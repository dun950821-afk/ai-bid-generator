# backend/apps/bid_check/admin.py
"""废标检查管理后台。"""

from django.contrib import admin

from apps.bid_check.models import BidCheckFinding, BidCheckTask


@admin.register(BidCheckTask)
class BidCheckTaskAdmin(admin.ModelAdmin):
    list_display = ["id", "outline", "bid_document", "status", "created_at", "finished_at"]
    list_filter = ["status"]
    search_fields = ["outline__name"]
    readonly_fields = ["findings_summary", "error_message", "created_at", "updated_at", "finished_at"]


@admin.register(BidCheckFinding)
class BidCheckFindingAdmin(admin.ModelAdmin):
    list_display = ["id", "task", "type", "severity", "title", "resolved"]
    list_filter = ["type", "severity", "resolved"]
    search_fields = ["title", "summary"]
