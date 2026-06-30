# Generated for outline review fields (借鉴 OpenBidKit outlineWorkflow 审核闭环)

from django.db import migrations, models


class Migration(migrations.Migration):
    """大纲目录审核闭环字段：评分大类快照 / 审核状态 / 审核建议。"""

    dependencies = [
        ("outline", "0011_add_global_fact_group"),
    ]

    operations = [
        migrations.AddField(
            model_name="outline",
            name="requirement_groups",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="目录生成时提取的技术评分大类，用于审核比对",
                verbose_name="评分大类快照",
            ),
        ),
        migrations.AddField(
            model_name="outline",
            name="review_status",
            field=models.CharField(
                blank=True,
                default="",
                help_text="passed/failed/pending",
                max_length=20,
                verbose_name="审核状态",
            ),
        ),
        migrations.AddField(
            model_name="outline",
            name="review_suggestions",
            field=models.JSONField(blank=True, default=list, verbose_name="审核建议"),
        ),
    ]
