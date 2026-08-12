from django.contrib import admin

from apps.enterprise.models import (
    BidMaterialPackage,
    BidMaterialPackageItem,
    CompanyCase,
    CompanyMaterial,
    CompanyProfile,
    ProjectMember,
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


@admin.register(CompanyCase)
class CompanyCaseAdmin(admin.ModelAdmin):
    """企业项目案例管理。"""

    list_display = [
        "project_name",
        "client_name",
        "amount",
        "start_date",
        "end_date",
        "company",
        "source",
        "created_at",
    ]
    list_filter = ["company", "source"]
    search_fields = ["project_name", "client_name", "scope"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(ProjectMember)
class ProjectMemberAdmin(admin.ModelAdmin):
    """项目人员管理。"""

    list_display = [
        "name", "role", "title", "experience_years", "company", "created_at",
    ]
    list_filter = ["company", "role"]
    search_fields = ["name", "role", "certificates"]
    readonly_fields = ["created_at", "updated_at"]


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
