"""任务队列管理 App。"""

from django.apps import AppConfig


class TaskQueueConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.task_queue"
    verbose_name = "任务队列管理"
