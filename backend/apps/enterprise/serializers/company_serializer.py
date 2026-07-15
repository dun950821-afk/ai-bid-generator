# backend/apps/enterprise/serializers/company_serializer.py
"""公司主体序列化器。"""

from rest_framework import serializers

from apps.enterprise.models import CompanyProfile


class CompanyProfileSerializer(serializers.ModelSerializer):
    """公司主体序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )
    material_count = serializers.SerializerMethodField()

    class Meta:
        model = CompanyProfile
        fields = [
            "id",
            "name",
            "short_name",
            "unified_social_credit_code",
            "legal_representative",
            "registered_capital",
            "established_date",
            "registered_address",
            "business_scope",
            "company_intro",
            "official_phone",
            "official_email",
            "website",
            "contact_person",
            "bank_name",
            "bank_account",
            "status",
            "status_display",
            "version",
            "is_default",
            "created_by_name",
            "material_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["version", "is_default", "created_by"]

    def get_material_count(self, obj) -> int:
        """获取材料数量。"""
        if hasattr(obj, "_material_count"):
            return obj._material_count
        return obj.materials.count()


class CompanyProfileBriefSerializer(serializers.ModelSerializer):
    """公司主体简要序列化器（用于选择列表）。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    material_count = serializers.SerializerMethodField()

    class Meta:
        model = CompanyProfile
        fields = [
            "id",
            "name",
            "short_name",
            "unified_social_credit_code",
            "legal_representative",
            "registered_capital",
            "official_phone",
            "status",
            "status_display",
            "is_default",
            "material_count",
        ]

    def get_material_count(self, obj) -> int:
        """获取材料数量。"""
        if hasattr(obj, "_material_count"):
            return obj._material_count
        return obj.materials.count()


class CompanyProfileCreateSerializer(serializers.ModelSerializer):
    """公司主体创建序列化器。"""

    class Meta:
        model = CompanyProfile
        fields = [
            "id",
            "name",
            "short_name",
            "unified_social_credit_code",
            "legal_representative",
            "registered_capital",
            "established_date",
            "registered_address",
            "business_scope",
            "company_intro",
            "official_phone",
            "official_email",
            "website",
            "contact_person",
            "bank_name",
            "bank_account",
            "status",
            "is_default",
            "version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_default", "version", "created_at", "updated_at"]


class CompanySnapshotSerializer(serializers.Serializer):
    """公司信息快照序列化器。"""

    id = serializers.IntegerField()
    name = serializers.CharField()
    short_name = serializers.CharField()
    unified_social_credit_code = serializers.CharField()
    legal_representative = serializers.CharField()
    registered_capital = serializers.CharField()
    established_date = serializers.CharField(allow_null=True)
    registered_address = serializers.CharField()
    business_scope = serializers.CharField()
    company_intro = serializers.CharField()
    official_phone = serializers.CharField()
    official_email = serializers.CharField()
    website = serializers.CharField()
    contact_person = serializers.CharField()
    bank_name = serializers.CharField()
    bank_account = serializers.CharField()
    version = serializers.IntegerField()
