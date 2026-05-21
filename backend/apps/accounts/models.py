from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.common.models import TimeStampedModel


class User(AbstractUser):
    """自定义用户模型（spec §4.2.1）。

    is_staff / is_superuser 仅用于 Django Admin，与业务 RBAC 无关。
    """

    real_name = models.CharField("真实姓名", max_length=64, blank=True)
    phone = models.CharField("手机号", max_length=32, blank=True)
    department = models.CharField("部门", max_length=128, blank=True)
    must_change_password = models.BooleanField("强制改密", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return self.username


class Permission(TimeStampedModel):
    """权限点（spec §4.2.2）；命名规范 模块.动作。"""

    SCOPE_GLOBAL = "global"
    SCOPE_PROJECT = "project"
    SCOPE_CHOICES = [
        (SCOPE_GLOBAL, "全局"),
        (SCOPE_PROJECT, "项目"),
    ]

    code = models.CharField("权限码", max_length=128, unique=True)
    name = models.CharField("显示名", max_length=128)
    module = models.CharField("所属模块", max_length=64)
    scope = models.CharField("作用域", max_length=16, choices=SCOPE_CHOICES)
    description = models.TextField("描述", blank=True)
    is_active = models.BooleanField("是否启用", default=True)

    class Meta:
        db_table = "accounts_permission"
        ordering = ["module", "code"]

    def __str__(self):
        return self.code
