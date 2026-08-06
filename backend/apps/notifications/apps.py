from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"

    def ready(self):
        # 任务终态 → 通知 的 post_save 信号
        from apps.notifications import signals  # noqa: F401
