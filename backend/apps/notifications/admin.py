from django.contrib import admin

from apps.notifications.models import Announcement, AnnouncementAck, Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "kind", "title", "is_read", "created_at")
    list_filter = ("kind", "is_read")
    search_fields = ("title", "user__username")


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "is_active", "created_by", "published_at", "offline_at", "created_at")
    list_filter = ("is_active",)
    search_fields = ("title", "content")
    actions = ["publish_selected", "offline_selected"]

    @admin.action(description="发布选中公告")
    def publish_selected(self, request, queryset):
        from django.utils.timezone import now

        for obj in queryset:
            obj.is_active = True
            if obj.published_at is None:
                obj.published_at = now()
            obj.offline_at = None
            obj.save(update_fields=["is_active", "published_at", "offline_at", "updated_at"])

    @admin.action(description="下线选中公告")
    def offline_selected(self, request, queryset):
        from django.utils.timezone import now

        queryset.update(is_active=False, offline_at=now(), updated_at=now())


@admin.register(AnnouncementAck)
class AnnouncementAckAdmin(admin.ModelAdmin):
    list_display = ("id", "announcement", "user", "dismissed", "seen_at", "dismissed_at")
    list_filter = ("dismissed",)
