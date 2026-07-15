# backend/apps/knowledge/services/chunk_service.py
"""知识分块服务。"""

import re

import jieba
from hashlib import sha256
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce

from apps.common.services.storage import StorageService
from apps.knowledge.constants import (
    ChunkStatus, IndexStatus, ChunkType,
    MIN_CHUNK_SIZE, MAX_CHUNK_TOKENS, CHUNKER_VERSION,
)
from apps.knowledge.models import KnowledgeDocument, KnowledgeChunk


# 标题行正则：# ~ ######，捕获层级与标题文本
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
# 中文 token 估算系数（中文一字 ~1.5 token，英文 4 字符 ~1 token，折中取 1.5）
_TOKEN_RATIO = 1.5
# 二次切分目标 token 数（留余量给上下文）
_SUBCHUNK_TARGET_TOKENS = 400


class KnowledgeChunkService:
    """知识分块服务。"""

    VERSION = CHUNKER_VERSION

    def chunk(self, document: KnowledgeDocument) -> list[KnowledgeChunk]:
        """对文档进行分块。

        Args:
            document: 文档实例

        Returns:
            分块列表

        Raises:
            ValueError: 文档尚未解析完成
        """
        if document.chunk_status != ChunkStatus.PENDING:
            return list(document.chunks.all())

        if not document.parsed_uri:
            raise ValueError("文档尚未解析完成")

        document.chunk_status = ChunkStatus.CHUNKING
        document.save()

        try:
            # 加载解析结果
            storage = StorageService()
            markdown = storage.get_object(document.parsed_uri).decode("utf-8")

            # 分块
            chunks_data = self._split_markdown(markdown)

            # 清空旧 chunks，避免重跑残留
            KnowledgeChunk.objects.filter(document=document).delete()

            # 创建分块记录
            chunks = []
            for idx, chunk_data in enumerate(chunks_data):
                chunk = KnowledgeChunk(
                    document=document,
                    chunk_index=idx,
                    title=chunk_data.get("title", "")[:255],
                    section_path=chunk_data.get("section_path", "")[:512],
                    content=chunk_data["content"],
                    content_hash=self._compute_hash(chunk_data["content"]),
                    chunk_type=chunk_data.get("chunk_type", ChunkType.GENERAL),
                    page_start=chunk_data.get("page_start"),
                    page_end=chunk_data.get("page_end"),
                    token_count=self._estimate_tokens(chunk_data["content"]),
                    metadata=chunk_data.get("metadata", {}),
                    bm25_text=self._prepare_bm25_text(chunk_data["content"]),
                )
                chunks.append(chunk)

            # 批量写入（已清空旧数据，ignore_conflicts 兜底同 content_hash 的重复内容）
            KnowledgeChunk.objects.bulk_create(chunks, ignore_conflicts=True)

            actual_count = KnowledgeChunk.objects.filter(document=document).count()

            document.chunk_status = ChunkStatus.CHUNKED
            document.index_status = IndexStatus.PENDING
            document.chunk_count = actual_count
            document.chunker_version = self.VERSION
            document.save()

            # 更新知识库统计
            self._update_knowledge_base_stats(document.knowledge_base)

            return list(document.chunks.all())

        except Exception as e:
            document.chunk_status = ChunkStatus.FAILED
            document.error_message = str(e)[:2000]
            document.save()
            raise

    def _split_markdown(self, markdown: str) -> list[dict]:
        """按标题层级分块。

        策略：
        1. 识别所有 # ~ ###### 标题，按层级维护栈
        2. 每个标题切换时，把累积内容作为一个 chunk
        3. 短章节（< MIN_CHUNK_SIZE）合并到上一节
        4. 单 chunk 超 MAX_CHUNK_TOKENS 时按段落二次切分
        5. 章节路径按层级栈维护，正确显示"第一章/1.1 项目背景"
        """
        if not markdown.strip():
            return []

        lines = markdown.split("\n")

        # 章节栈：[{level, title, path}]
        section_stack: list[dict] = []
        current_lines: list[str] = []
        current_title = ""
        current_level = 0

        chunks_data: list[dict] = []

        def current_path() -> str:
            return "/".join(s["title"] for s in section_stack)

        def flush_section():
            """把累积内容作为 chunk 入库。"""
            nonlocal current_lines, current_title
            if not current_lines:
                return
            content = "\n".join(current_lines).strip()
            if not content:
                current_lines = []
                return

            # 短章节合并：内容不足 MIN_CHUNK_SIZE 且已有上一节，合并到上一节
            if len(content) < MIN_CHUNK_SIZE and chunks_data:
                chunks_data[-1]["content"] += "\n\n" + content
                return

            section_title = current_title or (section_stack[-1]["title"] if section_stack else "")
            chunks_data.append({
                "title": section_title[:255],
                "section_path": current_path()[:512],
                "content": content,
                "chunk_type": ChunkType.PARAGRAPH,
            })
            current_lines = []

        for line in lines:
            m = _HEADING_RE.match(line)
            if m:
                # 遇到新标题，先 flush 上一节
                flush_section()

                level = len(m.group(1))
                title = m.group(2).strip()

                # 维护层级栈：弹出更深或同级的层级
                while section_stack and section_stack[-1]["level"] >= level:
                    section_stack.pop()
                section_stack.append({"level": level, "title": title})

                current_title = title
                current_level = level
                current_lines = [line]  # 标题行作为内容起始
            else:
                current_lines.append(line)

        # flush 最后一节
        flush_section()

        # 没有任何标题 → 全文作为一个 chunk
        if not chunks_data and markdown.strip():
            chunks_data.append({
                "title": "全文",
                "section_path": "",
                "content": markdown.strip(),
                "chunk_type": ChunkType.GENERAL,
            })

        # 二次切分：单 chunk 超 MAX_CHUNK_TOKENS 时按段落拆分
        result: list[dict] = []
        for chunk in chunks_data:
            token_count = self._estimate_tokens(chunk["content"])
            if token_count <= MAX_CHUNK_TOKENS:
                result.append(chunk)
                continue
            result.extend(self._subchunk(chunk))

        return result

    def _subchunk(self, chunk: dict) -> list[dict]:
        """对超长 chunk 按段落二次切分。"""
        content = chunk["content"]
        title = chunk["title"]
        section_path = chunk["section_path"]

        # 按空行分段
        paragraphs = re.split(r"\n\s*\n", content)
        if len(paragraphs) <= 1:
            # 无法按段落切，强制按 token 上限截断
            return self._force_split(chunk)

        sub_chunks: list[dict] = []
        current_lines: list[str] = []
        current_tokens = 0

        for idx, para in enumerate(paragraphs):
            para = para.strip()
            if not para:
                continue
            para_tokens = self._estimate_tokens(para)

            # 单段就超限，单独成块
            if para_tokens > MAX_CHUNK_TOKENS:
                # 先 flush 当前累积
                if current_lines:
                    sub_content = "\n\n".join(current_lines)
                    sub_chunks.append({
                        "title": title,
                        "section_path": section_path,
                        "content": sub_content,
                        "chunk_type": chunk["chunk_type"],
                    })
                    current_lines = []
                    current_tokens = 0
                # 单段独立成块（可能超限，但不再拆）
                sub_chunks.append({
                    "title": title,
                    "section_path": section_path,
                    "content": para,
                    "chunk_type": chunk["chunk_type"],
                })
                continue

            # 累加超限，flush
            if current_tokens + para_tokens > _SUBCHUNK_TARGET_TOKENS and current_lines:
                sub_content = "\n\n".join(current_lines)
                sub_chunks.append({
                    "title": title,
                    "section_path": section_path,
                    "content": sub_content,
                    "chunk_type": chunk["chunk_type"],
                })
                current_lines = []
                current_tokens = 0

            current_lines.append(para)
            current_tokens += para_tokens

        # flush 剩余
        if current_lines:
            sub_content = "\n\n".join(current_lines)
            sub_chunks.append({
                "title": title,
                "section_path": section_path,
                "content": sub_content,
                "chunk_type": chunk["chunk_type"],
            })

        return sub_chunks if sub_chunks else [chunk]

    def _force_split(self, chunk: dict) -> list[dict]:
        """无法按段落切分时，按字符数强制截断。"""
        content = chunk["content"]
        max_chars = int(MAX_CHUNK_TOKENS / _TOKEN_RATIO)
        result = []
        for i in range(0, len(content), max_chars):
            result.append({
                "title": chunk["title"],
                "section_path": chunk["section_path"],
                "content": content[i:i + max_chars],
                "chunk_type": chunk["chunk_type"],
            })
        return result

    def _estimate_tokens(self, content: str) -> int:
        """估算 token 数（中文 ~1.5 token/字，英文 ~0.25 token/字，折中 1.5）。"""
        return max(1, int(len(content) * _TOKEN_RATIO))

    def _prepare_bm25_text(self, content: str) -> str:
        """准备全文检索文本（中文分词增强）。"""
        words = jieba.lcut(content)
        segmented = " ".join(words)
        return f"{content}\n{segmented}"

    def _compute_hash(self, content: str) -> str:
        """计算内容哈希。"""
        return sha256(content.encode("utf-8")).hexdigest()

    def _update_knowledge_base_stats(self, kb) -> None:
        """更新知识库统计。"""
        from apps.knowledge.models import KnowledgeBase

        stats = KnowledgeDocument.objects.filter(
            knowledge_base=kb,
            is_deleted=False,
        ).aggregate(
            doc_count=Count("id"),
            chunk_count=Coalesce(Sum("chunk_count"), 0),
        )

        kb.document_count = stats["doc_count"] or 0
        kb.chunk_count = stats["chunk_count"] or 0
        kb.save(update_fields=["document_count", "chunk_count"])
