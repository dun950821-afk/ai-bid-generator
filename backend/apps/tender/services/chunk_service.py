"""语义分块服务（规则实现）。"""

import logging
import re
from hashlib import sha256
from typing import List

from apps.tender.constants import (
    CHUNKER_VERSION,
    ChunkType,
    ChunkLevel,
    CHUNK_TYPE_KEYWORDS,
    MANDATORY_KEYWORDS,
    MANDATORY_SYMBOLS,
    DEADLINE_PATTERNS,
    AMOUNT_PATTERNS,
    SCORE_PATTERNS,
    PENALTY_KEYWORDS,
)
from apps.tender.models import TenderChunk
from apps.common.services.storage import StorageService

logger = logging.getLogger(__name__)

# 分块配置
MAX_TOKENS = 512
MIN_CHUNK_SIZE = 50


class ChunkService:
    """语义分块服务（规则实现）。

    三层混合策略：section → clause → window
    父子结构分批写入，支持幂等。
    """

    VERSION = CHUNKER_VERSION

    def chunk(self, parsed_doc) -> List[TenderChunk]:
        """对解析文档进行语义分块。

        Args:
            parsed_doc: ParsedDocument 实例

        Returns:
            TenderChunk 列表
        """
        markdown = self._load_markdown(parsed_doc.markdown_uri)

        # 一级：章节分块
        section_chunks = self._split_sections(markdown, parsed_doc)

        # 先写入 section chunks，获取 ID
        TenderChunk.objects.bulk_create(
            section_chunks,
            ignore_conflicts=True,
        )

        # 建立 section 映射（用于设置 parent_chunk）
        section_map = {}
        for chunk in TenderChunk.objects.filter(
            parsed_document=parsed_doc,
            chunk_level=ChunkLevel.SECTION,
        ):
            section_map[chunk.section_path] = chunk

        # 二级：条款分块
        clause_chunks = []
        for section in section_chunks:
            clauses = self._split_clauses(section)
            # 设置 parent_chunk
            for clause in clauses:
                if section.section_path in section_map:
                    clause.parent_chunk = section_map[section.section_path]
            clause_chunks.extend(clauses)

        # 写入 clause chunks
        TenderChunk.objects.bulk_create(
            clause_chunks,
            ignore_conflicts=True,
        )

        # 建立 clause 映射
        clause_map = {}
        for chunk in TenderChunk.objects.filter(
            parsed_document=parsed_doc,
            chunk_level=ChunkLevel.CLAUSE,
        ):
            if chunk.clause_no:
                clause_map[chunk.clause_no] = chunk

        # 三级：窗口兜底
        window_chunks = []
        for clause in clause_chunks:
            if clause.token_count > MAX_TOKENS:
                windows = self._split_windows(clause)
                # 设置 parent_chunk（优先 clause，其次 section）
                for window in windows:
                    if clause.clause_no in clause_map:
                        window.parent_chunk = clause_map[clause.clause_no]
                    elif clause.section_path in section_map:
                        window.parent_chunk = section_map[clause.section_path]
                window_chunks.extend(windows)

        # 写入 window chunks
        TenderChunk.objects.bulk_create(
            window_chunks,
            ignore_conflicts=True,
        )

        # 类型分类 + 特征提取（更新已写入的 chunks）
        all_chunks = list(TenderChunk.objects.filter(parsed_document=parsed_doc))
        for chunk in all_chunks:
            self._classify_chunk(chunk)
            self._extract_features(chunk)

        # 批量更新
        if all_chunks:
            TenderChunk.objects.bulk_update(
                all_chunks,
                fields=[
                    "chunk_type",
                    "secondary_types",
                    "classification_confidence",
                    "matched_keywords",
                    "is_mandatory",
                    "has_deadline",
                    "has_amount",
                    "has_score",
                    "has_penalty",
                    "has_timeline",
                ],
            )

        logger.info(
            "Chunked parsed_document=%s chunks=%d",
            parsed_doc.id,
            len(all_chunks),
        )

        return all_chunks

    def _load_markdown(self, markdown_uri: str) -> str:
        """从 MinIO 加载 Markdown。"""
        storage = StorageService()
        content = storage.get_object(markdown_uri)
        return content.decode("utf-8")

    def _split_sections(self, markdown: str, parsed_doc) -> List[TenderChunk]:
        """一级：按章节分块。"""
        chunks = []
        lines = markdown.split("\n")

        current_section = []
        current_title = ""
        current_path = ""
        chunk_index = 0

        for line in lines:
            # 检测章节标题（优先匹配更具体的模式）
            if line.startswith("# "):
                # 保存当前章节
                if current_section:
                    content = "\n".join(current_section).strip()
                    if len(content) >= MIN_CHUNK_SIZE:
                        chunk = self._create_chunk(
                            parsed_doc=parsed_doc,
                            level=ChunkLevel.SECTION,
                            index=chunk_index,
                            content=content,
                            section_title=current_title,
                            section_path=current_path,
                        )
                        chunks.append(chunk)
                        chunk_index += 1

                current_title = line[2:].strip()
                current_path = current_title
                current_section = [line]
            else:
                current_section.append(line)

        # 保存最后一个章节
        if current_section:
            content = "\n".join(current_section).strip()
            if len(content) >= MIN_CHUNK_SIZE:
                chunk = self._create_chunk(
                    parsed_doc=parsed_doc,
                    level=ChunkLevel.SECTION,
                    index=chunk_index,
                    content=content,
                    section_title=current_title,
                    section_path=current_path,
                )
                chunks.append(chunk)

        return chunks

    def _split_clauses(self, section_chunk: TenderChunk) -> List[TenderChunk]:
        """二级：按条款分块。"""
        chunks = []
        lines = section_chunk.content.split("\n")

        current_clause = []
        current_clause_no = ""
        chunk_index = 0

        for line in lines:
            # 检测条款编号（优先匹配更具体的模式）
            # 1. 层级编号（多级）：3.2.1
            match = re.match(r"^(\d+\.\d+(?:\.\d+)+)\s*", line)
            if match:
                # 保存当前条款
                if current_clause:
                    content = "\n".join(current_clause).strip()
                    if len(content) >= MIN_CHUNK_SIZE:
                        chunk = self._create_chunk(
                            parsed_doc=section_chunk.parsed_document,
                            level=ChunkLevel.CLAUSE,
                            index=chunk_index,
                            content=content,
                            section_title=section_chunk.section_title,
                            section_path=section_chunk.section_path,
                            clause_no=current_clause_no,
                        )
                        chunks.append(chunk)
                        chunk_index += 1

                current_clause_no = match.group(1)
                current_clause = [line]
                continue

            # 2. 层级编号（二级）：3.2
            match = re.match(r"^(\d+\.\d+)\s*", line)
            if match:
                if current_clause:
                    content = "\n".join(current_clause).strip()
                    if len(content) >= MIN_CHUNK_SIZE:
                        chunk = self._create_chunk(
                            parsed_doc=section_chunk.parsed_document,
                            level=ChunkLevel.CLAUSE,
                            index=chunk_index,
                            content=content,
                            section_title=section_chunk.section_title,
                            section_path=section_chunk.section_path,
                            clause_no=current_clause_no,
                        )
                        chunks.append(chunk)
                        chunk_index += 1

                current_clause_no = match.group(1)
                current_clause = [line]
                continue

            # 3. 括号数字：（1）
            match = re.match(r"^（(\d+)）\s*", line)
            if match:
                if current_clause:
                    content = "\n".join(current_clause).strip()
                    if len(content) >= MIN_CHUNK_SIZE:
                        chunk = self._create_chunk(
                            parsed_doc=section_chunk.parsed_document,
                            level=ChunkLevel.CLAUSE,
                            index=chunk_index,
                            content=content,
                            section_title=section_chunk.section_title,
                            section_path=section_chunk.section_path,
                            clause_no=current_clause_no,
                        )
                        chunks.append(chunk)
                        chunk_index += 1

                current_clause_no = f"（{match.group(1)}）"
                current_clause = [line]
                continue

            current_clause.append(line)

        # 保存最后一个条款
        if current_clause:
            content = "\n".join(current_clause).strip()
            if len(content) >= MIN_CHUNK_SIZE:
                chunk = self._create_chunk(
                    parsed_doc=section_chunk.parsed_document,
                    level=ChunkLevel.CLAUSE,
                    index=chunk_index,
                    content=content,
                    section_title=section_chunk.section_title,
                    section_path=section_chunk.section_path,
                    clause_no=current_clause_no,
                )
                chunks.append(chunk)

        return chunks

    def _split_windows(self, chunk: TenderChunk) -> List[TenderChunk]:
        """三级：按窗口分块（兜底）。"""
        # 简单实现：按段落分割
        paragraphs = chunk.content.split("\n\n")
        chunks = []
        chunk_index = 0

        for para in paragraphs:
            if len(para.strip()) >= MIN_CHUNK_SIZE:
                window = self._create_chunk(
                    parsed_doc=chunk.parsed_document,
                    level=ChunkLevel.WINDOW,
                    index=chunk_index,
                    content=para.strip(),
                    section_title=chunk.section_title,
                    section_path=chunk.section_path,
                    clause_no=chunk.clause_no,
                )
                chunks.append(window)
                chunk_index += 1

        return chunks

    def _create_chunk(
        self,
        parsed_doc,
        level: str,
        index: int,
        content: str,
        section_title: str = "",
        section_path: str = "",
        clause_no: str = "",
    ) -> TenderChunk:
        """创建 TenderChunk 实例（不保存）。"""
        chunk = TenderChunk(
            parsed_document=parsed_doc,
            chunk_level=level,
            chunk_index=index,
            content=content,
            section_title=section_title,
            section_path=section_path,
            clause_no=clause_no,
            token_count=len(content) // 4,  # 简单估算
        )
        chunk.content_hash = self._compute_hash(chunk)
        return chunk

    def _classify_chunk(self, chunk: TenderChunk) -> None:
        """分类分块类型。"""
        scores = {}
        matched_keywords = []

        for chunk_type, keywords in CHUNK_TYPE_KEYWORDS.items():
            score = 0
            for kw in keywords:
                if kw in chunk.content:
                    score += 1
                    matched_keywords.append(kw)
            scores[chunk_type] = score

        # 取最高分类型
        total_score = sum(scores.values())
        if total_score > 0:
            primary_type = max(scores, key=scores.get)
            chunk.chunk_type = primary_type
            chunk.classification_confidence = scores[primary_type] / total_score

            # 次类型
            secondary = [t for t, s in scores.items() if s > 0 and t != primary_type]
            chunk.secondary_types = secondary[:3]
        else:
            chunk.chunk_type = ChunkType.GENERAL
            chunk.classification_confidence = 0.0

        chunk.matched_keywords = matched_keywords[:10]

    def _extract_features(self, chunk: TenderChunk) -> None:
        """提取特征标记。"""
        content = chunk.content

        # 强制条款
        chunk.is_mandatory = self._is_mandatory(content)

        # 截止时间
        chunk.has_deadline = any(
            re.search(p, content) for p in DEADLINE_PATTERNS
        )

        # 金额
        chunk.has_amount = any(
            re.search(p, content) for p in AMOUNT_PATTERNS
        )

        # 评分
        chunk.has_score = any(
            re.search(p, content) for p in SCORE_PATTERNS
        )

        # 惩罚条款
        chunk.has_penalty = any(kw in content for kw in PENALTY_KEYWORDS)

        # 时间节点
        chunk.has_timeline = chunk.has_deadline or "期限" in content or "周期" in content

    def _is_mandatory(self, content: str) -> bool:
        """判断是否为强制条款。"""
        # 符号标记
        for symbol in MANDATORY_SYMBOLS:
            if symbol in content:
                return True

        # 关键词标记
        for kw in MANDATORY_KEYWORDS:
            if kw in content:
                return True

        return False

    def _compute_hash(self, chunk: TenderChunk) -> str:
        """计算内容哈希。"""
        data = f"{chunk.section_path}:{chunk.clause_no}:{chunk.content}"
        return sha256(data.encode("utf-8")).hexdigest()