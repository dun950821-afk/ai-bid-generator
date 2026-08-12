# -*- coding: utf-8 -*-
"""企业项目案例序列化器。"""

from rest_framework import serializers

from apps.enterprise.models import CompanyCase


class CompanyCaseSerializer(serializers.ModelSerializer):
    """项目案例序列化器。"""

    period_text = serializers.CharField(read_only=True)
    amount_text = serializers.CharField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = CompanyCase
        fields = [
            "id", "company", "company_name",
            "project_name", "client_name", "client_contact",
            "amount", "amount_text", "start_date", "end_date", "period_text",
            "scope", "remark", "source",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "source", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data.setdefault("source", CompanyCase.SOURCE_MANUAL)
        validated_data.setdefault("company", self._default_company())
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)

    def _default_company(self):
        from apps.enterprise.models import CompanyProfile

        company = CompanyProfile.objects.filter(is_default=True).first()
        if company:
            return company
        return CompanyProfile.objects.first()
