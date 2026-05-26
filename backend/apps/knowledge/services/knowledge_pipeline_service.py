# backend/apps/knowledge/services/knowledge_pipeline_service.py
"""知识文档处理流水线。"""

from django.utils import timezone

from apps.common.models import AsyncTask
from apps.knowledge.constants import ParseStatus, ChunkStatus, IndexStatus, DocumentStatus
from apps.knowledge.models import KnowledgeDocument
from apps.knowledge.services.document_parse_service import DocumentParseService
from apps.knowledge.services.chunk_service import KnowledgeChunkService
from apps.knowledge.services.search_vector_service import SearchVectorService


class KnowledgePipelineService:
    """知识文档处理流水线。"""

    def process_document(self, document_id: int, task_id: int | None = None) -> None:
        """处理单个文档：解析 -> 分块 -> 索引。

        Args:
            document_id: 文档 ID
            task_id: 异步任务 ID
        """
        document = KnowledgeDocument.objects.filter(id=document_id).first()
        if not document:
            raise ValueError(f"文档不存在: {document_id}")

        # 更新任务状态
        task = None
        if task_id:
            task = AsyncTask.objects.filter(id=task_id).first()
            if task:
                task.status = AsyncTask.STATUS_RUNNING
                task.save()

        try:
            # 1. 解析
            DocumentParseService().parse(document)
            document.refresh_from_db()

            # 校验解析状态
            if document.parse_status != ParseStatus.PARSED:
                raise ValueError("文档解析未完成")

            # 2. 分块
            KnowledgeChunkService().chunk(document)
            document.refresh_from_db()

            # 校验分块状态
            if document.chunk_status != ChunkStatus.CHUNKED:
                raise ValueError("文档分块未完成")

            # 3. 索引
            SearchVectorService().update_document_chunks(document)
            document.refresh_from_db()

            # 更新知识库统计
            self._update_knowledge_base_stats(document.knowledge_base)

            if task:
                task.status = AsyncTask.STATUS_SUCCESS
                task.finished_at = timezone.now()
                task.save()

        except Exception as e:
            document.status = DocumentStatus.FAILED
            document.error_message = str(e)[:2000]
            document.save()

            if task:
                task.status = AsyncTask.STATUS_FAILED
                task.error_message = str(e)[:2000]
                task.finished_at = timezone.now()
                task.save()

            raise

    def _update_knowledge_base_stats(self, kb) -> None:
        """更新知识库统计。"""
        from django.db.models import Count, Sum
        from django.db.models.functions import Coalesce
        from apps.knowledge.models import KnowledgeDocument

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