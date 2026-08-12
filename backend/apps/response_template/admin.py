# -*- coding: utf-8 -*-
"""响应模板 admin。"""

from django.contrib import admin

from apps.response_template.models import (
    TenderResponseDocument,
    TenderResponseTemplate,
    TenderTemplateBlock,
)


class TenderTemplateBlockInline(admin.TabularInline):
    model = TenderTemplateBlock
    extra = 0
    fields = ["block_key", "title", "block_type", "order", "confidence", "fill_status"]
    readonly_fields = ["block_key", "title", "order", "confidence"]


@admin.register(TenderResponseTemplate)
class TenderResponseTemplateAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "project", "source_file", "status", "confidence", "created_at"]
    list_filter = ["status"]
    search_fields = ["name"]
    inlines = [TenderTemplateBlockInline]


@admin.register(TenderTemplateBlock)
class TenderTemplateBlockAdmin(admin.ModelAdmin):
    list_display = ["id", "block_key", "title", "block_type", "template", "confidence", "fill_status"]
    list_filter = ["block_type", "fill_status", "confirm_status"]
    search_fields = ["title", "block_key"]


@admin.register(TenderResponseDocument)
class TenderResponseDocumentAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "template", "kind", "status", "file_size", "created_at"]
    list_filter = ["status", "kind"]
