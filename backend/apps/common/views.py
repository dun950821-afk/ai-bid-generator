import os
import uuid

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import BadRequest, NotFound, PermissionDenied
from apps.common.models import AsyncTask
from apps.common.serializers import AsyncTaskSerializer
from apps.common.services.storage import StorageService


class TaskDetailView(APIView):
    """任务详情视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, task_id):
        """获取任务详情。"""
        try:
            task = AsyncTask.objects.get(pk=task_id)
        except AsyncTask.DoesNotExist as exc:
            raise NotFound(message="任务不存在") from exc

        if task.created_by_id != request.user.id and not permission_service.is_system_admin(request.user):
            raise PermissionDenied(message="无权查看该任务")

        return Response(AsyncTaskSerializer(task).data)


class CurrentTaskView(APIView):
    """获取当前执行中的任务。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request):
        """获取指定对象当前正在执行的任务。

        Query params:
            related_object_type: 关联对象类型
            related_object_id: 关联对象 ID
            task_type: 任务类型（可选）

        Returns:
            AsyncTask | null
        """
        related_object_type = request.query_params.get("related_object_type")
        related_object_id = request.query_params.get("related_object_id")
        task_type = request.query_params.get("task_type")

        if not related_object_type or not related_object_id:
            return Response(None)

        queryset = AsyncTask.objects.filter(
            related_object_type=related_object_type,
            related_object_id=related_object_id,
            status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RUNNING],
        )

        if task_type:
            queryset = queryset.filter(task_type=task_type)

        task = queryset.order_by("-created_at").first()

        if task:
            return Response(AsyncTaskSerializer(task).data)

        return Response(None)


class EditorImageUploadView(APIView):
    """编辑器图片上传视图。"""

    permission_classes = [IsAuthenticated]
    ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"]
    MAX_SIZE = 10 * 1024 * 1024  # 10MB
    EDITOR_IMAGES_PREFIX = "editor/images/"

    # kind → 扩展名 与 content_type
    KIND_TO_EXT = {
        "png": ".png",
        "jpeg": ".jpg",
        "webp": ".webp",
    }
    KIND_TO_CONTENT_TYPE = {
        "png": "image/png",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
    }

    def post(self, request):
        """上传编辑器图片。

        接收 multipart/form-data，字段名为 file。
        返回图片 URL（MinIO 公开路径或代理路径）。
        """
        file = request.FILES.get("file")
        if not file:
            raise BadRequest(message="未提供文件")

        if file.size > self.MAX_SIZE:
            raise BadRequest(message="文件大小超过 10MB 限制")

        # magic bytes 校验：客户端 content_type 可伪造，必须读文件头
        head = file.read(16)
        file.seek(0)
        from apps.common.services.file_magic import detect_image_kind
        kind = detect_image_kind(head)
        if kind is None:
            raise BadRequest(message="文件不是有效的图片，仅支持 png/jpeg/webp")

        # 用 magic bytes 推断的 kind 覆盖客户端声明，避免伪造
        content_type = self.KIND_TO_CONTENT_TYPE[kind]

        # 生成 MinIO 对象键（使用 magic bytes 推断的扩展名，而非客户端提供的）
        today = timezone.now()
        ext = self.KIND_TO_EXT[kind]
        filename = f"{uuid.uuid4().hex}{ext}"
        object_key = f"{self.EDITOR_IMAGES_PREFIX}{today.year}/{today.month:02d}/{today.day:02d}/{filename}"

        # 上传到 MinIO 并设置公开读策略
        storage = StorageService()
        storage.upload_fileobj(file, object_key, content_type=content_type)

        # 确保 editor/images/ 前缀为公开读（幂等操作）
        storage.set_public_policy(self.EDITOR_IMAGES_PREFIX)

        # 生成公开可访问的 URL
        from django.conf import settings
        if settings.MINIO_PROXY_ENABLED:
            # 使用 nginx 代理路径
            file_url = f"/minio/{settings.MINIO_BUCKET}/{object_key}"
        else:
            # 直接访问 MinIO 公共地址
            scheme = "https" if settings.MINIO_SECURE else "http"
            file_url = f"{scheme}://{settings.MINIO_PUBLIC_ENDPOINT}/{settings.MINIO_BUCKET}/{object_key}"

        return Response({
            "url": file_url,
            "filename": filename,
            "size": file.size,
        })