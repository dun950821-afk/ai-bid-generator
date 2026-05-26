# backend/apps/knowledge/services/document_service.py
"""知识文档管理服务。"""

from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.common.services.storage import StorageService
from apps.knowledge.constants import DocumentStatus, ParseStatus
from apps.knowledge.models import KnowledgeBase, KnowledgeDocument


class DocumentService:
    """知识文档管理服务。"""

    def init_upload(
        self,
        knowledge_base: KnowledgeBase,
        file_name: str,
        file_size: int,
        file_hash: str,
        mime_type: str,
        created_by,
    ) -> tuple[KnowledgeDocument, str, dict]:
        """初始化文档上传。

        Args:
            knowledge_base: 知识库实例
            file_name: 文件名
            file_size: 文件大小（字节）
            file_hash: 文件哈希（SHA256）
            mime_type: MIME 类型
            created_by: 创建人

        Returns:
            (document, upload_url, upload_fields)

        Raises:
            ValidationError: 知识库不可用或文件已存在
        """
        # 1. 校验知识库状态
        if not knowledge_base.is_active or knowledge_base.is_deleted:
            raise ValidationError("知识库已停用或已删除")

        # 2. 去重校验
        existing = KnowledgeDocument.objects.filter(
            knowledge_base=knowledge_base,
            file_hash=file_hash,
            is_deleted=False,
        ).first()
        if existing:
            raise ValidationError(f"文档已存在: {existing.file_name}")

        # 3. 创建文档记录
        document = KnowledgeDocument.objects.create(
            knowledge_base=knowledge_base,
            file_name=file_name,
            file_hash=file_hash,
            file_size=file_size,
            mime_type=mime_type,
            status=DocumentStatus.UPLOADING,
            created_by=created_by,
        )

        # 4. 生成 MinIO 上传 URL
        object_key = f"knowledge/{knowledge_base.id}/{document.id}/{file_name}"
        storage = StorageService()
        upload_url, upload_fields = storage.generate_presigned_post(
            object_key, file_size, mime_type
        )
        document.file_uri = object_key
        document.save()

        return document, upload_url, upload_fields

    def complete_upload(self, document: KnowledgeDocument) -> tuple:
        """完成上传，触发解析。

        Args:
            document: 文档实例

        Returns:
            AsyncTask 实例

        Raises:
            ValidationError: 文档状态不允许完成上传
        """
        # 防重复触发
        if document.status != DocumentStatus.UPLOADING:
            raise ValidationError(f"文档当前状态不允许完成上传: {document.get_status_display()}")

        # 校验文件已上传到 MinIO
        storage = StorageService()
        if not storage.object_exists(document.file_uri):
            raise ValidationError("文件尚未上传完成")

        document.status = DocumentStatus.PROCESSING
        document.parse_status = ParseStatus.PENDING
        document.save()

        # 创建异步任务
        from apps.common.models import AsyncTask

        task = AsyncTask.objects.create(
            task_type="knowledge.process_document",
            related_object_type="knowledge.KnowledgeDocument",
            related_object_id=str(document.id),
            created_by=document.created_by,
        )
        document.parse_task = task
        document.save()

        # 触发 Celery 任务
        from apps.knowledge.tasks import process_knowledge_document

        process_knowledge_document.delay(document.id, task.id)

        return task

    def delete_document(self, document: KnowledgeDocument) -> None:
        """软删除文档。"""
        document.soft_delete()
        self._update_knowledge_base_stats(document.knowledge_base)

    def _update_knowledge_base_stats(self, kb: KnowledgeBase) -> None:
        """更新知识库统计。"""
        from django.db.models import Count, Sum
        from django.db.models.functions import Coalesce

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