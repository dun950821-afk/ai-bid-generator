# Generated for section content_plan fields

from django.db import migrations, models


class Migration(migrations.Migration):
    """章节正文编排决策字段（借鉴 OpenBidKit buildChapterContentPlanMessages）。"""

    dependencies = [
        ("outline", "0012_outline_review_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="section",
            name="content_plan",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="planning 阶段输出，含 writing_focus/knowledge/facts/table/mermaid/image",
                verbose_name="正文编排决策",
            ),
        ),
        migrations.AddField(
            model_name="section",
            name="content_plan_updated_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True, verbose_name="编排决策更新时间"),
        ),
    ]
