# backend/apps/outline/views_bid_document.py
"""标书 Word 文档视图。"""

import jwt
import logging
import time

from django.conf import settings
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.accounts.permissions import RequirePermission
from apps.outline.models import BidDocument

logger = logging.getLogger(__name__)


class BidDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """标书 Word 文档视图集。"""

    queryset = BidDocument.objects.select_related("outline", "created_by")
    permission_classes = [RequirePermission]

    def get_serializer_class(self):
        # list/retrieve 缺少 serializer_class 会 500（断言失败）
        from apps.outline.serializers import BidDocumentSerializer

        return BidDocumentSerializer

    def get_queryset(self):
        """越权过滤：只返回当前用户参与的项目下的标书文档。"""
        queryset = super().get_queryset()
        user = self.request.user
        # 未认证（无 Bearer token 的浏览器导航等）不能拿 AnonymousUser 做
        # user 过滤（Django 会抛 TypeError 500），直接返回空集 → 404。
        if user is None or not user.is_authenticated:
            return queryset.none()
        return queryset.filter(
            outline__project__members__user=user
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

        # 构建文件 URL：ONLYOFFICE 服务器经后端代理端点下载（URL 内嵌 JWT 校验）。
        # 不能直连 MinIO presigned URL：签名只对 GET 有效，ONLYOFFICE 下载前
        # 会发 HEAD 请求被拒（400/403），且 bucket 策略仅 editor/images/* 公开读。
        token = jwt.encode(
            {
                "document_id": document.id,
                "exp": int(time.time()) + 24 * 3600,
            },
            settings.ONLYOFFICE_JWT_SECRET,
            algorithm="HS256",
        )
        file_url = (
            f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
            f"/api/bid-documents/{document.id}/file/?token={token}"
        )

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

    @action(
        detail=True,
        methods=["get", "head"],
        # file 端点由 ONLYOFFICE 服务器访问：它下载 document.url 时带自己的
        # JWT 作为 Authorization header，SimpleJWT 认证器会抛 InvalidToken →
        # 401；它也没有用户 Bearer token。访问控制靠 URL 内 JWT，认证层和
        # 权限层整体跳过。kwargs 经 router 传入 as_view → Django View.__init__
        # setattr 成实例属性，不依赖 self.action（后者在 initialize_request
        # 之后才被设置）。
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def file(self, request, pk=None):
        """ONLYOFFICE 文件代理下载端点。

        ONLYOFFICE 下载文档前先发 HEAD 请求检查文件，而 S3/MinIO 预签名
        GET URL 的签名只对 GET 有效（HEAD 被拒 400/403），所以文档必须经
        此端点代理：JWT 校验后统一处理 GET/HEAD。
        """
        from django.http import HttpResponse

        from apps.common.services.storage import ObjectNotFound, StorageService

        token = request.query_params.get("token", "")
        try:
            payload = jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            return Response(
                {"error": "无效的下载链接"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if str(payload.get("document_id")) != str(pk):
            return Response(
                {"error": "无效的下载链接"},
                status=status.HTTP_403_FORBIDDEN,
            )

        document = BidDocument.objects.filter(pk=pk).first()
        if document is None or not document.object_key:
            return Response(
                {"error": "文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            storage = StorageService()
            content = storage.get_object(document.object_key)
        except ObjectNotFound:
            return Response(
                {"error": "文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.exception(f"Failed to proxy download from MinIO: {e}")
            return Response(
                {"error": "文件下载失败"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """下载 Word 文件。

        校验用户权限后返回文件下载。
        """
        from django.http import HttpResponse

        from apps.accounts.services import permission_service
        from apps.common.services.storage import ObjectNotFound, StorageService

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
            try:
                # StorageService 构造与 get_object 一起纳入 try：
                # 连接层异常（urllib3 超时等）非 S3Error，不 catch 会以裸 500 页返回
                storage = StorageService()
                content = storage.get_object(document.object_key)
            except ObjectNotFound:
                return Response(
                    {"error": "文件不存在"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            except Exception as e:
                logger.exception(f"Failed to download from MinIO: {e}")
                return Response(
                    {"error": "文件下载失败"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            response = HttpResponse(
                content,
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
            response["Content-Disposition"] = f'attachment; filename="{document.title}"'
            return response

        # 兼容旧数据：从本地文件下载
        response = FileResponse(
            document.docx_file.open("rb"),
            as_attachment=True,
            filename=document.title,
        )
        return response

    @action(detail=True, methods=["get"])
    def export_pdf(self, request, pk=None):
        """导出 PDF（经 ONLYOFFICE Conversion API，方案 §34）。

        复用 file 代理端点作为转换源的下载地址（URL 内嵌 JWT）。
        """
        from apps.accounts.services import permission_service
        from django.http import HttpResponse

        from apps.outline.services.onlyoffice.conversion_service import (
            ConversionError,
            convert_document,
        )

        document = self.get_object()

        outline = document.outline
        if not permission_service.has_project_permission(
            request.user, outline.project, "outline.view"
        ):
            return Response(
                {"error": "您没有权限下载此文档"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not document.object_key:
            return Response(
                {"error": "文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        token = jwt.encode(
            {
                "document_id": document.id,
                "exp": int(time.time()) + 3600,
            },
            settings.ONLYOFFICE_JWT_SECRET,
            algorithm="HS256",
        )
        file_url = (
            f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
            f"/api/bid-documents/{document.id}/file/?token={token}"
        )

        try:
            pdf = convert_document(
                file_url,
                key=f"bid-doc-{document.id}-{document.file_key}-pdf",
                outputtype="pdf",
                title=document.title,
            )
        except ConversionError as exc:
            logger.exception(f"Export PDF failed: document_id={document.id}")
            return Response(
                {"error": f"PDF 转换失败：{exc}", "code": "ONLYOFFICE_CONVERT_FAILED"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        filename = document.title
        if filename.lower().endswith(".docx"):
            filename = filename[:-5] + ".pdf"
        else:
            filename += ".pdf"

        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
