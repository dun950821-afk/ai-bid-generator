# backend/apps/knowledge/services/search_vector_service.py
"""全文索引服务。"""

from django.contrib.postgres.search import SearchVector

from apps.knowledge.constants import IndexStatus, DocumentStatus
from apps.knowledge.models import KnowledgeDocument, KnowledgeChunk


class SearchVectorService:
    """全文索引服务。"""

    def update_document_chunks(self, document: KnowledgeDocument) -> None:
        """更新文档所有分块的 search_vector。

        Args:
            document: 文档实例
        """
        if document.index_status != IndexStatus.PENDING:
            return

        document.index_status = IndexStatus.INDEXING
        document.save()

        try:
            # 检查是否有分块
            chunk_count = KnowledgeChunk.objects.filter(document=document).count()
            if chunk_count == 0:
                document.index_status = IndexStatus.FAILED
                document.status = DocumentStatus.FAILED
                document.error_message = "文档未生成任何分块"
                document.save()
                return

            # 更新 search_vector（权重：title A > bm25_text B > content C）
            KnowledgeChunk.objects.filter(document=document).update(
                search_vector=(
                    SearchVector("title", weight="A", config="simple") +
                    SearchVector("bm25_text", weight="B", config="simple") +
                    SearchVector("content", weight="C", config="simple")
                )
            )

            document.index_status = IndexStatus.INDEXED
            document.status = DocumentStatus.READY
            document.save()

        except Exception as e:
            document.index_status = IndexStatus.FAILED
            document.status = DocumentStatus.FAILED
            document.error_message = str(e)[:2000]
            document.save()
            raise

    def update_knowledge_base(self, kb) -> None:
        """更新知识库所有分块的索引。

        Args:
            kb: 知识库实例
        """
        KnowledgeChunk.objects.filter(
            document__knowledge_base=kb,
            document__is_deleted=False,
        ).update(
            search_vector=(
                SearchVector("title", weight="A", config="simple") +
                SearchVector("bm25_text", weight="B", config="simple") +
                SearchVector("content", weight="C", config="simple")
            )
        )