# backend/apps/enterprise/serializers/package_serializer.py
"""标书材料包序列化器。"""

from rest_framework import serializers

from apps.enterprise.models import BidMaterialPackage, BidMaterialPackageItem
from apps.enterprise.serializers.company_serializer import CompanySnapshotSerializer
from apps.enterprise.serializers.material_serializer import (
    CompanyMaterialBriefSerializer,
)


class BidMaterialPackageItemSerializer(serializers.ModelSerializer):
    """材料包明细序列化器。"""

    material = CompanyMaterialBriefSerializer(read_only=True)
    material_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = BidMaterialPackageItem
        fields = [
            "id",
            "material",
            "material_id",
            "usage_key",
            "display_order",
            "required",
            "notes",
        ]


class BidMaterialPackageSerializer(serializers.ModelSerializer):
    """标书材料包序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    outline_name = serializers.CharField(source="outline.name", read_only=True)
    items = BidMaterialPackageItemSerializer(many=True, read_only=True)
    company_snapshot = CompanySnapshotSerializer(read_only=True)
    is_editable = serializers.SerializerMethodField()

    class Meta:
        model = BidMaterialPackage
        fields = [
            "id",
            "outline",
            "outline_name",
            "company",
            "company_name",
            "name",
            "status",
            "status_display",
            "company_snapshot",
            "items",
            "is_editable",
            "created_by",
            "locked_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["outline", "company_snapshot", "created_by", "locked_at"]

    def get_is_editable(self, obj) -> bool:
        return obj.is_editable()


class BidMaterialPackageBriefSerializer(serializers.ModelSerializer):
    """材料包简要序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = BidMaterialPackage
        fields = [
            "id",
            "name",
            "status",
            "status_display",
            "company_name",
            "item_count",
            "locked_at",
        ]

    def get_item_count(self, obj) -> int:
        return obj.items.count()


class BidMaterialPackageCreateSerializer(serializers.Serializer):
    """创建材料包序列化器。"""

    company_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    auto_fill = serializers.BooleanField(
        default=True,
        help_text="是否自动填充推荐材料",
    )


class BidMaterialPackageUpdateSerializer(serializers.Serializer):
    """更新材料包序列化器。"""

    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    items = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        help_text="材料明细列表，格式：[{usage_key, material_id, required, notes}]",
    )


class MaterialCheckResultSerializer(serializers.Serializer):
    """材料完整性检查结果序列化器。"""

    pass_status = serializers.BooleanField()
    missing_materials = serializers.ListField(child=serializers.DictField())
    expired_materials = serializers.ListField(child=serializers.DictField())
    warnings = serializers.ListField(child=serializers.DictField())


class RequiredMaterialSerializer(serializers.Serializer):
    """章节所需材料序列化器。"""

    usage_key = serializers.CharField()
    material_type = serializers.CharField()
    required = serializers.BooleanField()
    insert_mode = serializers.CharField()
    description = serializers.CharField()