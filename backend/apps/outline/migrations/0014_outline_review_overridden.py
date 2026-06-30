# Generated for outline review_overridden field

from django.db import migrations, models


class Migration(migrations.Migration):
    """大纲审核人工忽略字段。"""

    dependencies = [
        ("outline", "0013_section_content_plan"),
    ]

    operations = [
        migrations.AddField(
            model_name="outline",
            name="review_overridden",
            field=models.BooleanField(
                default=False,
                help_text="用户忽略 AI 建议强制通过时置 true",
                verbose_name="人工忽略审核",
            ),
        ),
    ]
