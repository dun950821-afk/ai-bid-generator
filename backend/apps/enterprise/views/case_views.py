# -*- coding: utf-8 -*-
"""企业项目案例视图。"""

from rest_framework import viewsets

from apps.enterprise.models import CompanyCase
from apps.enterprise.permissions import CanManageCompany
from apps.enterprise.serializers import CompanyCaseSerializer


class CompanyCaseViewSet(viewsets.ModelViewSet):
    """企业项目案例 CRUD。"""

    queryset = CompanyCase.objects.select_related("company").all()
    serializer_class = CompanyCaseSerializer
    permission_classes = [CanManageCompany]

    def get_queryset(self):
        queryset = super().get_queryset()
        company_id = self.request.query_params.get("company_id")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        keyword = self.request.query_params.get("keyword")
        if keyword:
            queryset = queryset.filter(project_name__icontains=keyword)
        return queryset
