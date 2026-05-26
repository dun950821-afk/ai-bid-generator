# backend/apps/knowledge/services/chunk_service.py
"""知识分块服务。"""

import jieba
from hashlib import sha256
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce

from apps.common.services.storage import StorageService
from apps.knowledge.constants import ChunkStatus, IndexStatus, ChunkType, MIN_CHUNK_SIZE, CHUNKER_VERSION
from apps.knowledge.models import KnowledgeDocument, KnowledgeChunk


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

            # 创建分块记录
            chunks = []
            for idx, chunk_data in enumerate(chunks_data):
                chunk = KnowledgeChunk(
                    document=document,
                    chunk_index=idx,
                    title=chunk_data.get("title", "")[:255],
                    section_path=chunk_data.get("section_path", ""),
                    content=chunk_data["content"],
                    content_hash=self._compute_hash(chunk_data["content"]),
                    chunk_type=chunk_data.get("chunk_type", ChunkType.GENERAL),
                    page_start=chunk_data.get("page_start"),
                    page_end=chunk_data.get("page_end"),
                    token_count=len(chunk_data["content"]) // 4,
                    metadata=chunk_data.get("metadata", {}),
                    bm25_text=self._prepare_bm25_text(chunk_data["content"]),
                )
                chunks.append(chunk)

            # 批量写入
            KnowledgeChunk.objects.bulk_create(chunks, ignore_conflicts=True)

            # 重新统计实际创建数量
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
        """按章节分块。"""
        chunks = []
        lines = markdown.split("\n")

        current_section = []
        current_title = ""
        current_path = ""

        for line in lines:
            if line.startswith("# "):
                # 保存当前章节
                if current_section:
                    content = "\n".join(current_section).strip()
                    if len(content) >= MIN_CHUNK_SIZE:
                        chunks.append({
                            "title": current_title,
                            "section_path": current_path,
                            "content": content,
                            "chunk_type": ChunkType.PARAGRAPH,
                        })

                current_title = line[2:].strip()
                current_path = current_title
                current_section = [line]
            elif line.startswith("## "):
                # 二级标题
                if current_section:
                    content = "\n".join(current_section).strip()
                    if len(content) >= MIN_CHUNK_SIZE:
                        chunks.append({
                            "title": current_title,
                            "section_path": current_path,
                            "content": content,
                            "chunk_type": ChunkType.PARAGRAPH,
                        })

                current_title = line[3:].strip()
                current_path = f"{current_path}/{current_title}" if current_path else current_title
                current_section = [line]
            else:
                current_section.append(line)

        # 保存最后一个章节
        if current_section:
            content = "\n".join(current_section).strip()
            if len(content) >= MIN_CHUNK_SIZE:
                chunks.append({
                    "title": current_title,
                    "section_path": current_path,
                    "content": content,
                    "chunk_type": ChunkType.PARAGRAPH,
                })

        # 如果没有分块，创建一个包含全部内容的分块
        if not chunks and markdown.strip():
            chunks.append({
                "title": "全文",
                "section_path": "",
                "content": markdown.strip(),
                "chunk_type": ChunkType.GENERAL,
            })

        return chunks

    def _prepare_bm25_text(self, content: str) -> str:
        """准备全文检索文本（中文分词增强）。"""
        # jieba 分词
        words = jieba.lcut(content)
        segmented = " ".join(words)

        # 组合：原文 + 分词结果
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