# backend/apps/outline/views_bid_document.py
"""标书 Word 文档视图。"""

import jwt
import logging

from django.conf import settings
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import RequirePermission
from apps.outline.models import BidDocument

logger = logging.getLogger(__name__)


class BidDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """标书 Word 文档视图集。"""

    queryset = BidDocument.objects.select_related("outline", "created_by")
    permission_classes = [RequirePermission]

    def get_queryset(self):
        """越权过滤：只返回当前用户参与的项目下的标书文档。"""
        queryset = super().get_queryset()
        return queryset.filter(
            outline__project__members__user=self.request.user
        ).distinct()

    @action(detail=True, methods=["get"])
    def onlyoffice_config(self, request, pk=None):
        """获取 ONLYOFFICE 编辑器配置。

        返回配置和 JWT token，用于前端初始化 ONLYOFFICE 编辑器。
        """
        from apps.accounts.services import permission_service

        document = self.get_object()

        # 检查用户是否有权限访问该大纲（项目成员权限）
        outline = document.outline
        if not permission_service.has_project_permission(
            request.user, outline.project, "outline.view"
        ):
            return Response(
                {"error": "您没有权限访问此文档"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 构建文件 URL（presigned URL from MinIO，使用绝对 URL 给 ONLYOFFICE）
        file_url = document.get_file_url(absolute_url=True)

        # 构建回调 URL
        callback_url = (
            f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
            f"/api/onlyoffice/callback/{document.id}/"
        )

        # ONLYOFFICE 配置
        config = {
            "document": {
                "fileType": "docx",
                "key": document.file_key,
                "title": document.title,
                "url": file_url,
                "permissions": {
                    "chat": False,
                    "comment": True,
                },
            },
            "documentType": "word",
            "editorConfig": {
                "mode": "edit",
                "lang": "zh-CN",
                "callbackUrl": callback_url,
                "user": {
                    "id": str(request.user.id) if request.user.is_authenticated else "anonymous",
                    "name": (
                        request.user.get_full_name() or request.user.username
                        if request.user.is_authenticated
                        else "匿名用户"
                    ),
                },
                "customization": {
                    "forcesave": True,
                    "features": {
                        "spellcheck": {
                            "mode": False,
                        },
                    },
                    "plugins": settings.ONLYOFFICE_ENABLE_PLUGINS,
                },
            },
        }

        # 生成 JWT token
        token = jwt.encode(
            config,
            settings.ONLYOFFICE_JWT_SECRET,
            algorithm="HS256",
        )
        config["token"] = token

        return Response({
            "documentServerUrl": settings.ONLYOFFICE_DOCUMENT_SERVER_URL,
            "config": config,
        })

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """下载 Word 文件。

        校验用户权限后返回文件下载。
        """
        from django.http import HttpResponse

        from apps.accounts.services import permission_service
        from apps.common.services.storage import StorageService

        document = self.get_object()

        # 检查用户是否有权限访问该大纲（项目成员权限）
        outline = document.outline
        if not permission_service.has_project_permission(
            request.user, outline.project, "outline.view"
        ):
            return Response(
                {"error": "您没有权限下载此文档"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not document.object_key and not document.docx_file:
            return Response(
                {"error": "文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 优先从 MinIO 下载
        if document.object_key:
            storage = StorageService()
            try:
                content = storage.get_object(document.object_key)
                response = HttpResponse(
                    content,
                    content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
                response["Content-Disposition"] = f'attachment; filename="{document.title}"'
                return response
            except Exception as e:
                logger.exception(f"Failed to download from MinIO: {e}")
                return Response(
                    {"error": "文件下载失败"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # 兼容旧数据：从本地文件下载
        response = FileResponse(
            document.docx_file.open("rb"),
            as_attachment=True,
            filename=document.title,
        )
        return response
