# backend/apps/enterprise/views/material_views.py
"""企业材料视图。"""

from datetime import date, timedelta

from django.conf import settings
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.models import OperationLog
from apps.common.services.storage import StorageService
from apps.enterprise.constants import MaterialStatus, MaterialType
from apps.enterprise.models import CompanyMaterial
from apps.enterprise.permissions import CanManageMaterial
from apps.enterprise.serializers import (
    CompanyMaterialBriefSerializer,
    CompanyMaterialSerializer,
    CompanyMaterialUploadSerializer,
    MaterialUploadPresignResponseSerializer,
)


class CompanyMaterialViewSet(viewsets.ModelViewSet):
    """企业材料视图集。"""

    queryset = CompanyMaterial.objects.all()
    serializer_class = CompanyMaterialSerializer
    permission_classes = [CanManageMaterial]

    def get_queryset(self):
        """根据查询参数过滤。"""
        queryset = super().get_queryset().select_related("company", "uploaded_by")

        # 公司过滤
        company_id = self.request.query_params.get("company_id")
        if company_id:
            queryset = queryset.filter(company_id=company_id)

        # 材料类型过滤
        material_type = self.request.query_params.get("material_type")
        if material_type:
            queryset = queryset.filter(material_type=material_type)

        # 状态过滤
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # 搜索
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(title__icontains=search)

        return queryset.order_by("-created_at")

    def get_serializer_class(self):
        """根据动作选择序列化器。"""
        if self.action == "list":
            return CompanyMaterialBriefSerializer
        if self.action in ["create", "upload"]:
            return CompanyMaterialUploadSerializer
        return CompanyMaterialSerializer

    @action(detail=False, methods=["post"])
    def presign_upload(self, request):
        """获取上传预签名 URL。"""
        company_id = request.data.get("company_id")
        material_type = request.data.get("material_type")
        filename = request.data.get("filename")

        if not all([company_id, material_type, filename]):
            return Response(
                {"detail": "缺少必要参数"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 生成对象键
        from datetime import datetime
        today = datetime.now()
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
        object_key = f"company_materials/{company_id}/{material_type}/{today.year}/{today.month:02d}/{today.day:02d}/{filename}"

        # 生成预签名 URL
        storage = StorageService()
        max_size = 50 * 1024 * 1024  # 50MB

        content_type = self._get_content_type(ext)
        upload_data = storage.presigned_post_upload(
            object_key,
            max_size=max_size,
            content_type=content_type,
            expires_seconds=3600,
        )

        return Response(
            {
                "object_key": object_key,
                "upload_url": upload_data["url"],
                "fields": upload_data["fields"],
            }
        )

    def _get_content_type(self, ext: str) -> str:
        """根据扩展名获取 MIME 类型。"""
        content_types = {
            "pdf": "application/pdf",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
            "doc": "application/msword",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        return content_types.get(ext.lower(), "application/octet-stream")

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """创建材料记录。"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 创建材料记录
        material = CompanyMaterial.objects.create(
            company_id=serializer.validated_data["company_id"],
            material_type=serializer.validated_data["material_type"],
            title=serializer.validated_data["title"],
            object_key=serializer.validated_data.get("object_key", ""),
            file_size=serializer.validated_data.get("file_size", 0),
            content_type=serializer.validated_data.get("content_type", ""),
            valid_from=serializer.validated_data.get("valid_from"),
            valid_to=serializer.validated_data.get("valid_to"),
            issuing_authority=serializer.validated_data.get("issuing_authority", ""),
            certificate_no=serializer.validated_data.get("certificate_no", ""),
            tags=serializer.validated_data.get("tags", []),
            status=MaterialStatus.ACTIVE,
            uploaded_by=request.user,
        )

        return Response(
            CompanyMaterialSerializer(material).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """下载材料（记录审计日志）。"""
        material = self.get_object()

        # 检查材料是否存在
        if not material.object_key:
            return Response(
                {"detail": "文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 敏感材料检查权限
        if material.is_sensitive:
            if not request.user.has_perm("enterprise.download_sensitive_material"):
                return Response(
                    {"detail": "无权限下载敏感材料"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # 记录审计日志
        OperationLog.objects.create(
            actor=request.user,
            action="material_download",
            target_type="company_material",
            target_id=str(material.id),
            summary=f"下载材料: {material.title}",
            extra={
                "material_title": material.title,
                "material_type": material.material_type,
                "is_sensitive": material.is_sensitive,
                "company_id": material.company_id,
            },
            ip=self._get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
        )

        # 返回下载 URL
        url = material.get_file_url(absolute_url=True)
        return Response({"url": url})

    @action(detail=False, methods=["get"])
    def expiring(self, request):
        """获取即将过期的材料。"""
        days = int(request.query_params.get("days", 30))
        threshold = date.today() + timedelta(days=days)

        materials = CompanyMaterial.objects.filter(
            status=MaterialStatus.ACTIVE,
            valid_to__lte=threshold,
            valid_to__gte=date.today(),
        ).select_related("company")

        serializer = CompanyMaterialBriefSerializer(materials, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """归档材料。"""
        material = self.get_object()
        material.status = MaterialStatus.ARCHIVED
        material.save(update_fields=["status"])
        return Response({"status": "archived"})

    @action(detail=True, methods=["post"])
    def replace(self, request, pk=None):
        """替换材料文件。"""
        material = self.get_object()

        object_key = request.data.get("object_key")
        file_size = request.data.get("file_size", 0)
        content_type = request.data.get("content_type", "")

        if not object_key:
            return Response(
                {"detail": "缺少 object_key"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        material.object_key = object_key
        material.file_size = file_size
        material.content_type = content_type
        material.save(update_fields=["object_key", "file_size", "content_type"])

        return Response(CompanyMaterialSerializer(material).data)

    def _get_client_ip(self, request) -> str:
        """获取客户端真实 IP。"""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")
