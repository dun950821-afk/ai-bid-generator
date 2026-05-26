# backend/apps/knowledge/tasks.py
"""知识库 Celery 任务。"""

from celery import shared_task
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.knowledge.models import KnowledgeDocument, KnowledgeBase
from apps.knowledge.services.knowledge_pipeline_service import KnowledgePipelineService
from apps.knowledge.services.search_vector_service import SearchVectorService


@shared_task(bind=True, max_retries=3)
def process_knowledge_document(self, document_id: int, task_id: int):
    """处理知识文档（解析 -> 分块 -> 索引）。

    Args:
        document_id: 文档 ID
        task_id: 异步任务 ID
    """
    try:
        KnowledgePipelineService().process_document(document_id, task_id)
    except Exception as exc:
        # 重试逻辑
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60)

        # 最终失败，更新任务状态
        task = AsyncTask.objects.filter(id=task_id).first()
        if task:
            task.status = AsyncTask.STATUS_FAILED
            task.error_message = str(exc)[:2000]
            task.finished_at = timezone.now()
            task.save()

        document = KnowledgeDocument.objects.filter(id=document_id).first()
        if document:
            from apps.knowledge.constants import DocumentStatus
            document.status = DocumentStatus.FAILED
            document.error_message = str(exc)[:2000]
            document.save()
        raise


@shared_task
def rebuild_knowledge_base_index(knowledge_base_id: int):
    """重建知识库索引。

    Args:
        knowledge_base_id: 知识库 ID
    """
    kb = KnowledgeBase.objects.filter(id=knowledge_base_id).first()
    if kb:
        SearchVectorService().update_knowledge_base(kb)