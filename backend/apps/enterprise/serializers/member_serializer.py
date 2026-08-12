# -*- coding: utf-8 -*-
"""项目人员序列化器。"""

from rest_framework import serializers

from apps.enterprise.models import ProjectMember


class ProjectMemberSerializer(serializers.ModelSerializer):
    """项目人员序列化器。"""

    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = ProjectMember
        fields = [
            "id", "company", "company_name", "name", "role", "title",
            "experience_years", "certificates", "projects", "material",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data.setdefault("created_by", request.user)
        return super().create(validated_data)
