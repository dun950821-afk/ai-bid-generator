from django.contrib import admin

from apps.enterprise.models import (
    BidMaterialPackage,
    BidMaterialPackageItem,
    CompanyMaterial,
    CompanyProfile,
)


@admin.register(CompanyProfile)
class CompanyProfileAdmin(admin.ModelAdmin):
    """公司主体管理。"""

    list_display = [
        "name",
        "short_name",
        "unified_social_credit_code",
        "legal_representative",
        "status",
        "is_default",
        "created_at",
    ]
    list_filter = ["status", "is_default"]
    search_fields = ["name", "unified_social_credit_code"]
    readonly_fields = ["version", "created_at", "updated_at"]


@admin.register(CompanyMaterial)
class CompanyMaterialAdmin(admin.ModelAdmin):
    """企业材料管理。"""

    list_display = [
        "title",
        "company",
        "material_type",
        "status",
        "valid_to",
        "is_sensitive",
        "uploaded_by",
        "created_at",
    ]
    list_filter = ["material_type", "status", "is_sensitive", "company"]
    search_fields = ["title", "certificate_no"]
    readonly_fields = ["object_key", "file_size", "created_at", "updated_at"]


class BidMaterialPackageItemInline(admin.TabularInline):
    """材料包明细内联显示。"""

    model = BidMaterialPackageItem
    extra = 0
    fields = ["usage_key", "material", "required", "display_order"]


@admin.register(BidMaterialPackage)
class BidMaterialPackageAdmin(admin.ModelAdmin):
    """标书材料包管理。"""

    list_display = [
        "name",
        "outline",
        "company",
        "status",
        "locked_at",
        "created_at",
    ]
    list_filter = ["status"]
    search_fields = ["name", "outline__name"]
    readonly_fields = ["company_snapshot", "locked_at", "created_at", "updated_at"]
    inlines = [BidMaterialPackageItemInline]
