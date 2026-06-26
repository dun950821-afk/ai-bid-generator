# backend/apps/generation/migrations/0008_add_context_length.py
"""Generated manually to only add context_length to ModelConfig."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("generation", "0007_merge_20260608_1113"),
    ]

    operations = [
        migrations.AddField(
            model_name="modelconfig",
            name="context_length",
            field=models.IntegerField(
                "上下文长度（token）",
                blank=True,
                help_text="模型最大上下文 token 数（如 DeepSeek 128000 或 1000000）。留空使用默认 128000。",
                null=True,
            ),
        ),
    ]
