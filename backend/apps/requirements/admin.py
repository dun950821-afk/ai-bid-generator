from django.contrib import admin

from .models import TenderRequirement


@admin.register(TenderRequirement)
class TenderRequirementAdmin(admin.ModelAdmin):
    """招标条款 Admin。"""

    list_display = [
        "id",
        "requirement_no",
        "requirement_type",
        "title",
        "mandatory_level",
        "risk_level",
        "is_active",
        "created_at",
    ]
    list_filter = [
        "requirement_type",
        "mandatory_level",
        "risk_level",
        "response_strategy",
        "owner_role",
        "extraction_method",
        "review_status",
        "is_active",
    ]
    search_fields = [
        "requirement_key",
        "requirement_no",
        "title",
        "content",
    ]
    raw_id_fields = [
        "tender_file",
        "parsed_document",
        "source_chunk",
        "prompt_version",
        "source_prompt_run",
        "created_by",
        "updated_by",
    ]
    readonly_fields = [
        "requirement_key",
        "raw_extracted",
        "created_at",
        "updated_at",
    ]
