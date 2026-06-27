# backend/apps/enterprise/serializers/material_serializer.py
"""企业材料序列化器。"""

from rest_framework import serializers

from apps.enterprise.constants import MaterialType
from apps.enterprise.models import CompanyMaterial


class CompanyMaterialSerializer(serializers.ModelSerializer):
    """企业材料序列化器。"""

    material_type_display = serializers.CharField(
        source="get_material_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    uploaded_by_name = serializers.CharField(
        source="uploaded_by.get_full_name", read_only=True
    )
    file_url = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    days_to_expire = serializers.IntegerField(read_only=True)

    class Meta:
        model = CompanyMaterial
        fields = [
            "id",
            "company",
            "company_name",
            "material_type",
            "material_type_display",
            "title",
            "object_key",
            "file_size",
            "content_type",
            "valid_from",
            "valid_to",
            "issuing_authority",
            "certificate_no",
            "extracted_text",
            "tags",
            "is_sensitive",
            "status",
            "status_display",
            "uploaded_by_name",
            "file_url",
            "is_expired",
            "days_to_expire",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "object_key",
            "file_size",
            "content_type",
            "extracted_text",
            "is_sensitive",
            "uploaded_by",
        ]

    def get_file_url(self, obj) -> str:
        """获取文件 URL。"""
        request = self.context.get("request")
        absolute_url = request is None
        return obj.get_file_url(absolute_url=absolute_url)


class CompanyMaterialBriefSerializer(serializers.ModelSerializer):
    """企业材料简要序列化器（用于材料包列表）。"""

    material_type_display = serializers.CharField(
        source="get_material_type_display", read_only=True
    )
    file_url = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = CompanyMaterial
        fields = [
            "id",
            "title",
            "material_type",
            "material_type_display",
            "valid_to",
            "is_sensitive",
            "status",
            "file_url",
            "is_expired",
        ]

    def get_file_url(self, obj) -> str:
        """获取文件 URL。"""
        request = self.context.get("request")
        absolute_url = request is None
        return obj.get_file_url(absolute_url=absolute_url)


class CompanyMaterialUploadSerializer(serializers.Serializer):
    """材料上传序列化器。"""

    company_id = serializers.IntegerField()
    material_type = serializers.ChoiceField(choices=MaterialType.CHOICES)
    title = serializers.CharField(max_length=255)
    valid_from = serializers.DateField(required=False, allow_null=True)
    valid_to = serializers.DateField(required=False, allow_null=True)
    issuing_authority = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    certificate_no = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    tags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )
    object_key = serializers.CharField(max_length=500)
    file_size = serializers.IntegerField(default=0)
    content_type = serializers.CharField(max_length=100, required=False, default="")


class MaterialUploadPresignSerializer(serializers.Serializer):
    """材料上传预签名请求序列化器。"""

    company_id = serializers.IntegerField()
    material_type = serializers.ChoiceField(choices=MaterialType.CHOICES)
    filename = serializers.CharField(max_length=255)


class MaterialUploadPresignResponseSerializer(serializers.Serializer):
    """材料上传预签名响应序列化器。"""

    object_key = serializers.CharField()
    upload_url = serializers.CharField()
    fields = serializers.DictField()


class MaterialForGenerationSerializer(serializers.Serializer):
    """用于生成上下文的材料信息序列化器。"""

    id = serializers.IntegerField()
    usage_key = serializers.CharField()
    title = serializers.CharField()
    material_type = serializers.CharField()
    available = serializers.BooleanField()
    is_expired = serializers.BooleanField()
    days_to_expire = serializers.IntegerField(allow_null=True)
    valid_to = serializers.CharField(allow_null=True)
    certificate_no = serializers.CharField()
    issuing_authority = serializers.CharField()
    is_sensitive = serializers.BooleanField()