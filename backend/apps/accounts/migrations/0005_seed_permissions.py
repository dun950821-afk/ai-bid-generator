from django.db import migrations

from apps.accounts.permissions_registry import apply_registry


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    apply_registry(Permission)


def noop(apps, schema_editor):
    """反向迁移不删除权限点，保留历史审计与 Role 绑定。"""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_authidentity"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, noop),
    ]
