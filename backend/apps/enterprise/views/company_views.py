# backend/apps/enterprise/views/company_views.py
"""公司主体视图。"""

from django.db import transaction
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

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
        """创建时自动设置创建人。"""
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def set_default(self, request, pk=None):
        """设为默认公司。"""
        company = self.get_object()

        with transaction.atomic():
            # 取消其他公司的默认状态
            CompanyProfile.objects.filter(is_default=True).update(is_default=False)
            # 设置当前公司为默认
            company.is_default = True
            company.status = "active"
            company.save(update_fields=["is_default", "status"])

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
