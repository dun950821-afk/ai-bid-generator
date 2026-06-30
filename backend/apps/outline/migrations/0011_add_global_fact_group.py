# Generated for global_fact group model

import django.db.models.deletion
from django.db import migrations, models

import apps.outline.constants


class Migration(migrations.Migration):
    """新增全局事实变量组模型（借鉴 OpenBidKit globalFactsTask）。"""

    dependencies = [
        ("outline", "0010_add_manual_source_and_generation_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="GlobalFactGroup",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "key",
                    models.CharField(
                        help_text="用于跨轮去重合并，英文蛇形，如 project_name/delivery_period",
                        max_length=100,
                        verbose_name="事实键",
                    ),
                ),
                (
                    "title",
                    models.CharField(
                        help_text="如'项目名称''交货期'，供章节编排决策引用",
                        max_length=200,
                        verbose_name="标题",
                    ),
                ),
                (
                    "content",
                    models.TextField(
                        help_text="完整事实正文，正文生成时强制引用此值",
                        verbose_name="事实内容",
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=apps.outline.constants.GlobalFactSource.CHOICES,
                        default=apps.outline.constants.GlobalFactSource.TENDER,
                        max_length=20,
                        verbose_name="来源",
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0, verbose_name="排序")),
                (
                    "outline",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="global_facts",
                        to="outline.outline",
                        verbose_name="所属大纲",
                    ),
                ),
            ],
            options={
                "verbose_name": "全局事实变量",
                "verbose_name_plural": "全局事实变量",
                "db_table": "outline_global_fact",
                "ordering": ["sort_order", "id"],
                "indexes": [
                    models.Index(fields=["outline"], name="idx_global_fact_outline"),
                    models.Index(
                        fields=["outline", "sort_order"],
                        name="idx_global_fact_order",
                    ),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="globalfactgroup",
            constraint=models.UniqueConstraint(
                fields=("outline", "key"),
                name="uniq_global_fact_key_per_outline",
            ),
        ),
    ]
