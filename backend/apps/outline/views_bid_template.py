# backend/apps/outline/views_bid_template.py
"""Word 模板中心视图。

ONLYOFFICE 编辑链路复用 BidDocument 的成熟模式：
- editor_config：生成编辑器配置 + JWT
- file：ONLYOFFICE 服务器经此代理端点下载 draft 文件（URL 内嵌 JWT）
- download：用户下载 draft 或指定版本文件
- publish：把当前 draft 发布为不可变业务版本
"""

import logging
import time

import jwt
from django.conf import settings
from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import RequirePermission
from apps.accounts.services import permission_service
from apps.common.exceptions import PermissionDenied
from apps.common.services.storage import ObjectNotFound, StorageService
from apps.outline.models import (
    BidWordTemplate,
    BidWordTemplateScope,
    BidWordTemplateVersion,
)
from apps.outline.serializers import (
    BidWordTemplateCreateSerializer,
    BidWordTemplateSerializer,
    BidWordTemplateVersionSerializer,
)
from apps.outline.services.template import template_service

logger = logging.getLogger(__name__)

DOCX_CONTENT_TYPE = template_service.DOCX_CONTENT_TYPE


class BidWordTemplateViewSet(viewsets.ModelViewSet):
    """Word 模板视图集。"""

    permission_classes = [RequirePermission]
    required_permission = "bid_template.view"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        """可见性过滤：系统/企业模板全员可见，项目模板仅项目成员可见。"""
        queryset = (
            BidWordTemplate.objects.select_related(
                "enterprise", "project", "published_version", "created_by"
            )
            .annotate(version_count=Count("versions"))
            .order_by("-updated_at")
        )
        user = self.request.user
        if user is None or not user.is_authenticated:
            return queryset.none()
        queryset = queryset.filter(
            Q(scope_type=BidWordTemplateScope.SYSTEM)
            | Q(scope_type=BidWordTemplateScope.ENTERPRISE)
            | Q(scope_type=BidWordTemplateScope.PROJECT, project__members__user=user)
        ).distinct()

        scope_type = self.request.query_params.get("scope_type")
        if scope_type:
            queryset = queryset.filter(scope_type=scope_type)
        if self.request.query_params.get("has_published"):
            queryset = queryset.filter(published_version__isnull=False)
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(code__icontains=search)
                | Q(description__icontains=search)
            )
        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return BidWordTemplateCreateSerializer
        return BidWordTemplateSerializer

    def _require_manage(self, template=None):
        """写操作权限：全局 bid_template.manage + 作用域检查。

        项目模板额外要求当前用户是该项目成员（方案 §51 简化版：
        系统/企业模板走全局管理权限，项目模板走项目成员）。
        """
        user = self.request.user
        if not permission_service.has_permission(user, "bid_template.manage"):
            raise PermissionDenied(message="您没有模板管理权限")
        if template is not None and template.scope_type == BidWordTemplateScope.PROJECT:
            if not template.project or not template.project.members.filter(
                user=user
            ).exists():
                raise PermissionDenied(message="您不是该项目成员，无法维护此模板")

    # ---------- CRUD ----------

    def create(self, request, *args, **kwargs):
        """创建模板。

        支持两种创建方式（方案 §25）：
        - multipart 带 file：上传已有 DOCX 作为初始 draft
        - 不带 file：创建空白 draft
        """
        self._require_manage()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 项目模板：创建人必须是该项目成员
        if serializer.validated_data.get("scope_type") == BidWordTemplateScope.PROJECT:
            project = serializer.validated_data.get("project")
            if project and not project.members.filter(user=request.user).exists():
                raise PermissionDenied(message="您不是该项目成员，无法创建项目模板")

        template = serializer.save(
            created_by=request.user, updated_by=request.user
        )

        upload = request.FILES.get("file")
        try:
            if upload:
                template_service.save_upload_as_draft(
                    template, upload.name, upload.read()
                )
            else:
                template_service.create_blank_draft(template)
        except template_service.TemplateValidationError as exc:
            template.delete()
            return Response(
                {"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            BidWordTemplateSerializer(template).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        self._require_manage(self.get_object())
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_manage(self.get_object())
        return super().destroy(request, *args, **kwargs)

    # ---------- 文件 ----------

    @action(detail=True, methods=["post"])
    def upload(self, request, pk=None):
        """上传/替换 draft 文件（multipart，字段名 file）。"""
        template = self.get_object()
        self._require_manage(template)

        upload = request.FILES.get("file")
        if not upload:
            return Response(
                {"error": "缺少文件"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            template_service.save_upload_as_draft(template, upload.name, upload.read())
        except template_service.TemplateValidationError as exc:
            return Response(
                {"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(BidWordTemplateSerializer(template).data)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """下载模板文件。

        默认下载 draft；带 ?version_id= 下载指定发布版本。
        """
        template = self.get_object()
        version_id = request.query_params.get("version_id")

        if version_id:
            version = template.versions.filter(pk=version_id).first()
            if version is None:
                return Response(
                    {"error": "版本不存在"}, status=status.HTTP_404_NOT_FOUND
                )
            object_key = version.object_key
            filename = version.file_name
        else:
            if not template.draft_object_key:
                return Response(
                    {"error": "模板还没有文件"}, status=status.HTTP_404_NOT_FOUND
                )
            object_key = template.draft_object_key
            filename = f"{template.name}.docx"

        try:
            content = StorageService().get_object(object_key)
        except ObjectNotFound:
            return Response(
                {"error": "文件不存在"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception(f"Failed to download template from MinIO: {e}")
            return Response(
                {"error": "文件下载失败"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response = HttpResponse(content, content_type=DOCX_CONTENT_TYPE)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    # ---------- ONLYOFFICE 编辑 ----------

    @action(detail=True, methods=["get"])
    def editor_config(self, request, pk=None):
        """获取 ONLYOFFICE 编辑器配置（编辑 draft 文件）。"""
        template = self.get_object()
        self._require_manage(template)

        if not template.draft_object_key:
            return Response(
                {"error": "模板还没有文件，请先上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not template.draft_file_key:
            template.draft_file_key = template.generate_draft_file_key()
            template.save(update_fields=["draft_file_key", "updated_at"])

        # ONLYOFFICE 服务器经后端代理端点下载（URL 内嵌 JWT 校验），
        # 原因同 BidDocument：MinIO presigned GET 对 HEAD 无效。
        token = jwt.encode(
            {
                "template_id": template.id,
                "exp": int(time.time()) + 24 * 3600,
            },
            settings.ONLYOFFICE_JWT_SECRET,
            algorithm="HS256",
        )
        file_url = (
            f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
            f"/api/bid-word-templates/{template.id}/file/?token={token}"
        )
        callback_url = (
            f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
            f"/api/onlyoffice/callback/template/{template.id}/"
        )

        config = {
            "document": {
                "fileType": "docx",
                "key": template.draft_file_key,
                "title": f"{template.name}.docx",
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
                    "id": str(request.user.id),
                    "name": request.user.get_full_name() or request.user.username,
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
        # file 端点由 ONLYOFFICE 服务器访问，访问控制靠 URL 内 JWT，
        # 认证层和权限层整体跳过（同 BidDocument.file）。
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def file(self, request, pk=None):
        """ONLYOFFICE 模板文件代理下载端点（draft）。"""
        token = request.query_params.get("token", "")
        try:
            payload = jwt.decode(
                token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"]
            )
        except jwt.InvalidTokenError:
            return Response(
                {"error": "无效的下载链接"}, status=status.HTTP_403_FORBIDDEN
            )
        if str(payload.get("template_id")) != str(pk):
            return Response(
                {"error": "无效的下载链接"}, status=status.HTTP_403_FORBIDDEN
            )

        template = BidWordTemplate.objects.filter(pk=pk).first()
        if template is None:
            return Response(
                {"error": "文件不存在"}, status=status.HTTP_404_NOT_FOUND
            )

        # JWT 带 version_id 时服务版本文件（Conversion API 预览用），否则 draft
        version_id = payload.get("version_id")
        if version_id:
            version = template.versions.filter(pk=version_id).first()
            object_key = version.object_key if version else None
        else:
            object_key = template.draft_object_key
        if not object_key:
            return Response(
                {"error": "文件不存在"}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            content = StorageService().get_object(object_key)
        except ObjectNotFound:
            return Response(
                {"error": "文件不存在"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception(f"Failed to proxy template download from MinIO: {e}")
            return Response(
                {"error": "文件下载失败"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return HttpResponse(content, content_type=DOCX_CONTENT_TYPE)

    # ---------- 版本 ----------

    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        """版本记录列表。"""
        template = self.get_object()
        versions = template.versions.select_related("created_by")
        return Response(BidWordTemplateVersionSerializer(versions, many=True).data)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """发布当前 draft 为新版本（发布前强制校验，方案 §50）。"""
        template = self.get_object()
        self._require_manage(template)
        try:
            version, validation_result = template_service.publish_template(
                template, user=request.user
            )
        except template_service.TemplateValidationError as exc:
            body = {"error": str(exc)}
            if exc.validation:
                body["validation"] = exc.validation
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        except ObjectNotFound:
            return Response(
                {"error": "草稿文件不存在，请重新上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "version": BidWordTemplateVersionSerializer(version).data,
                "validation": validation_result,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        """对当前 draft 执行模板校验（不发布）。"""
        from apps.outline.services.template.template_validator import (
            TemplateValidator,
        )

        template = self.get_object()
        if not template.draft_object_key:
            return Response(
                {"error": "模板还没有文件，请先上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            content = StorageService().get_object(template.draft_object_key)
        except ObjectNotFound:
            return Response(
                {"error": "草稿文件不存在，请重新上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            TemplateValidator().validate(
                content, style_mapping=template.style_mapping
            )
        )

    @action(detail=True, methods=["get"])
    def variables(self, request, pk=None):
        """扫描 draft 文件，返回模板中实际使用的变量/控件。"""
        from apps.outline.services.template.template_compiler import scan_template

        template = self.get_object()
        if not template.draft_object_key:
            return Response(
                {"error": "模板还没有文件，请先上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            content = StorageService().get_object(template.draft_object_key)
        except ObjectNotFound:
            return Response(
                {"error": "草稿文件不存在，请重新上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(scan_template(content))

    # ---------- 版本管理（Phase 5） ----------

    @action(detail=True, methods=["post"])
    def rollback(self, request, pk=None):
        """回滚：把历史版本复制为当前 draft（不改历史版本）。"""
        template = self.get_object()
        self._require_manage(template)
        version_id = request.data.get("version_id")
        if not version_id:
            return Response(
                {"error": "缺少 version_id"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            version = template_service.rollback_to_version(
                template, version_id, user=request.user
            )
        except template_service.TemplateValidationError as exc:
            return Response(
                {"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        except ObjectNotFound:
            return Response(
                {"error": "版本文件不存在"}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            {
                "message": f"已把 V{version.version_no} 复制为当前草稿",
                "template": BidWordTemplateSerializer(template).data,
            }
        )

    @action(detail=True, methods=["post"])
    def set_default(self, request, pk=None):
        """设为默认模板（全局唯一，需已有发布版本）。"""
        template = self.get_object()
        self._require_manage(template)
        try:
            template_service.set_default_template(template)
        except template_service.TemplateValidationError as exc:
            return Response(
                {"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(BidWordTemplateSerializer(template).data)

    @action(detail=False, methods=["post"])
    def init_default(self, request):
        """初始化系统默认简洁模板（幂等）。"""
        self._require_manage()
        template = template_service.create_system_default_template(
            user=request.user
        )
        return Response(
            BidWordTemplateSerializer(template).data,
            status=status.HTTP_201_CREATED,
        )

    # ---------- 样式与预览（Phase 5） ----------

    @action(detail=True, methods=["get"])
    def styles(self, request, pk=None):
        """解析 draft 文件中的样式名列表（样式映射面板数据源）。"""
        template = self.get_object()
        if not template.draft_object_key:
            return Response(
                {"error": "模板还没有文件，请先上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            content = StorageService().get_object(template.draft_object_key)
        except ObjectNotFound:
            return Response(
                {"error": "草稿文件不存在，请重新上传"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from io import BytesIO

        from docx import Document

        doc = Document(BytesIO(content))
        style_names = sorted({s.name for s in doc.styles if s.name})
        return Response(
            {
                "styles": style_names,
                "style_mapping": template.style_mapping,
            }
        )

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """下载预览产物：?type=image|pdf&version_id=（默认已发布版本）。"""
        template = self.get_object()
        version_id = request.query_params.get("version_id")
        if version_id:
            version = template.versions.filter(pk=version_id).first()
        else:
            version = template.published_version
        if version is None:
            return Response(
                {"error": "没有已发布的版本"}, status=status.HTTP_404_NOT_FOUND
            )

        preview_type = request.query_params.get("type", "image")
        if preview_type == "pdf":
            object_key = version.preview_pdf_key
            content_type = "application/pdf"
            filename = f"{template.name}_v{version.version_no}.pdf"
        else:
            object_key = version.preview_image_key
            content_type = "image/png"
            filename = f"{template.name}_v{version.version_no}.png"
        if not object_key:
            return Response(
                {"error": "该版本没有预览产物"}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            content = StorageService().get_object(object_key)
        except ObjectNotFound:
            return Response(
                {"error": "预览文件不存在"}, status=status.HTTP_404_NOT_FOUND
            )
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class BidWordTemplateVariableListView(APIView):
    """模板变量注册表（前端变量面板数据源，方案 §41）。"""

    permission_classes = [RequirePermission]
    required_permission = "bid_template.view"

    def get(self, request):
        from apps.outline.services.template.template_variable_registry import (
            registry,
        )

        return Response({"groups": registry.grouped()})
