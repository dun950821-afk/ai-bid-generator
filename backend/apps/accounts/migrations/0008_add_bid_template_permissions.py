"""添加 Word 模板中心权限码。"""

from django.db import migrations


def add_bid_template_permissions(apps, schema_editor):
    """同步 Word 模板中心权限到数据库。"""
    Permission = apps.get_model("accounts", "Permission")
    from apps.accounts.permissions_registry import apply_registry
    apply_registry(Permission)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_add_enterprise_permissions"),
    ]

    operations = [
        migrations.RunPython(add_bid_template_permissions),
    ]
