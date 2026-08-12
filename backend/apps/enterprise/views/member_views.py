# -*- coding: utf-8 -*-
"""项目人员视图。"""

from rest_framework import viewsets

from apps.enterprise.models import ProjectMember
from apps.enterprise.permissions import CanManageCompany
from apps.enterprise.serializers import ProjectMemberSerializer


class ProjectMemberViewSet(viewsets.ModelViewSet):
    """企业项目人员 CRUD。"""

    queryset = ProjectMember.objects.select_related("company").all()
    serializer_class = ProjectMemberSerializer
    permission_classes = [CanManageCompany]

    def get_queryset(self):
        queryset = super().get_queryset()
        company_id = self.request.query_params.get("company_id")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        keyword = self.request.query_params.get("keyword")
        if keyword:
            queryset = queryset.filter(name__icontains=keyword)
        return queryset
