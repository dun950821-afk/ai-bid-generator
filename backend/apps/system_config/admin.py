"""系统配置 Admin。"""

from django.contrib import admin

from apps.system_config.models import SystemSetting, StorageConfig


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ["key", "retrieval_mode", "top_k", "max_context_tokens", "updated_at"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(StorageConfig)
class StorageConfigAdmin(admin.ModelAdmin):
    list_display = ["name", "provider", "endpoint", "bucket", "is_default", "created_at"]
    list_filter = ["provider", "is_default"]
    search_fields = ["name", "endpoint", "bucket"]
    readonly_fields = ["created_at", "updated_at"]
