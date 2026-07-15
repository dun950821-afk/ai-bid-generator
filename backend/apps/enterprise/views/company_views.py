# backend/apps/enterprise/views/company_views.py
"""公司主体视图。"""

from django.db import transaction
from django.db.models import Count, ProtectedError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.services.audit_service import log_operation
from apps.enterprise.models import CompanyProfile
from apps.enterprise.permissions import CanManageCompany
from apps.enterprise.serializers import (
    CompanyProfileBriefSerializer,
    CompanyProfileCreateSerializer,
    CompanyProfileSerializer,
)


class CompanyProfileViewSet(viewsets.ModelViewSet):
    """公司主体视图集。"""

    queryset = CompanyProfile.objects.all()
    serializer_class = CompanyProfileSerializer
    permission_classes = [CanManageCompany]

    def get_queryset(self):
        """根据查询参数过滤。"""
        queryset = super().get_queryset()

        # 状态过滤
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # 搜索
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        # 预加载材料数量
        queryset = queryset.annotate(material_count=Count('materials'))

        return queryset.order_by("-is_default", "-created_at")

    def get_serializer_class(self):
        """根据动作选择序列化器。"""
        if self.action == "list":
            return CompanyProfileBriefSerializer
        if self.action == "create":
            return CompanyProfileCreateSerializer
        return CompanyProfileSerializer

    def perform_create(self, serializer):
        """创建时自动设置创建人 + 审计。"""
        company = serializer.save(created_by=self.request.user)
        log_operation(
            actor=self.request.user,
            action="company_create",
            request=self.request,
            target_type="company_profile",
            target_id=str(company.id),
            summary=f"创建公司: {company.name}",
            extra={"company_id": company.id, "company_name": company.name},
        )

    def perform_update(self, serializer):
        """更新时审计。"""
        company = serializer.save()
        log_operation(
            actor=self.request.user,
            action="company_update",
            request=self.request,
            target_type="company_profile",
            target_id=str(company.id),
            summary=f"更新公司: {company.name}",
            extra={"company_id": company.id, "company_name": company.name},
        )

    def perform_destroy(self, instance):
        """删除公司：拒默认公司 + 捕获 ProtectedError。"""
        if instance.is_default:
            raise ValidationError({"detail": "默认公司不可删除，请先切换默认公司"})

        try:
            instance.delete()
        except ProtectedError:
            material_count = instance.materials.count()
            package_count = instance.material_packages.count()
            raise ValidationError(
                {"detail": f"公司已被引用，无法删除：{material_count} 个材料、{package_count} 个材料包"}
            )

        log_operation(
            actor=self.request.user,
            action="company_delete",
            request=self.request,
            target_type="company_profile",
            target_id=str(instance.id),
            summary=f"删除公司: {instance.name}",
            extra={"company_id": instance.id, "company_name": instance.name},
        )

    @action(detail=True, methods=["post"])
    def set_default(self, request, pk=None):
        """设为默认公司。"""
        company = self.get_object()

        with transaction.atomic():
            CompanyProfile.objects.filter(is_default=True).update(is_default=False)
            company.is_default = True
            company.status = "active"
            company.save(update_fields=["is_default", "status"])

        log_operation(
            actor=request.user,
            action="company_set_default",
            request=request,
            target_type="company_profile",
            target_id=str(company.id),
            summary=f"设为默认公司: {company.name}",
            extra={"company_id": company.id, "company_name": company.name},
        )

        return Response(
            {
                "id": company.id,
                "name": company.name,
                "is_default": True,
            }
        )

    @action(detail=False, methods=["get"])
    def default(self, request):
        """获取默认公司。"""
        company = CompanyProfile.objects.filter(is_default=True).first()
        if not company:
            return Response(
                {"detail": "未设置默认公司"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = CompanyProfileSerializer(company)
        return Response(serializer.data)
