"""任务队列配置模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class TaskQueueConfig(TimeStampedModel):
    """队列参数配置（key-value 注册表，DB 值优先覆盖代码默认值）。

    每个 key 的定义（类型/范围/默认值/是否需要重启）集中在
    apps.task_queue.services.config_service.CONFIG_DEFINITIONS。
    value 为 None 表示未配置（使用注册表默认值）。
    """

    key = models.CharField("参数键", max_length=64, unique=True)
    value = models.JSONField("参数值", null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="最后修改人",
    )

    class Meta:
        db_table = "task_queue_config"
        verbose_name = "队列参数配置"
        verbose_name_plural = "队列参数配置"

    def __str__(self):
        return f"{self.key}={self.value}"
