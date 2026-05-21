from django.db import migrations

BUILTIN_ROLES = [
    {
        "code": "system_admin",
        "name": "系统管理员",
        "description": "拥有系统全部权限，不受限",
        "permissions": [],  # 直通逻辑在 permission_service，不绑定具体权限
    },
    {
        "code": "bid_manager",
        "name": "投标经理",
        "description": "可创建与管理项目",
        "permissions": ["project.create"],
    },
    {
        "code": "normal_user",
        "name": "普通用户",
        "description": "基础全局能力",
        "permissions": [],
    },
]


def seed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    Permission = apps.get_model("accounts", "Permission")
    for spec in BUILTIN_ROLES:
        role, _ = Role.objects.update_or_create(
            code=spec["code"],
            defaults={
                "name": spec["name"],
                "description": spec["description"],
                "is_system": True,
            },
        )
        role.permissions.set(
            Permission.objects.filter(code__in=spec["permissions"])
        )


def noop(apps, schema_editor):
    """反向迁移不删除内置角色。"""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_seed_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_roles, noop),
    ]
