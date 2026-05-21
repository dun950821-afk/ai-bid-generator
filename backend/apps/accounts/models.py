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
    roles = models.ManyToManyField(
        "accounts.Role", related_name="users", blank=True, verbose_name="角色"
    )
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


class Role(TimeStampedModel):
    """全局角色（spec §4.2.3）；permissions 只允许绑定 scope=global 的 Permission，
    该约束由 Phase 2 的 RoleService / RoleSerializer 在业务层强制。"""

    code = models.CharField("角色码", max_length=64, unique=True)
    name = models.CharField("显示名", max_length=128)
    description = models.TextField("描述", blank=True)
    is_system = models.BooleanField("内置角色", default=False)
    permissions = models.ManyToManyField(
        Permission, related_name="roles", blank=True, verbose_name="权限"
    )

    class Meta:
        db_table = "accounts_role"
        ordering = ["code"]

    def __str__(self):
        return self.code


class AuthIdentity(TimeStampedModel):
    """外部身份绑定（spec §4.2.5）；v1 账号密码登录不写本表，保持空表。"""

    PROVIDER_CHOICES = [
        ("password", "账号密码"),
        ("dingtalk", "钉钉"),
        ("ldap", "LDAP"),
        ("wecom", "企业微信"),
        ("oauth2", "OAuth2"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="auth_identities"
    )
    provider = models.CharField("认证源", max_length=32, choices=PROVIDER_CHOICES)
    external_id = models.CharField("外部身份标识", max_length=255)
    extra = models.JSONField("附加信息", default=dict, blank=True)
    last_login_at = models.DateTimeField("最近登录", null=True, blank=True)

    class Meta:
        db_table = "accounts_auth_identity"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "external_id"],
                name="uniq_authidentity_provider_external",
            )
        ]

    def __str__(self):
        return f"{self.provider}:{self.external_id}"
