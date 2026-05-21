from django.db import models


class TimeStampedModel(models.Model):
    """提供 created_at / updated_at 时间戳的抽象基类（spec §3.5）。"""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
