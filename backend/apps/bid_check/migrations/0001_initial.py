# Generated for bid_check initial migration

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import apps.bid_check.constants


class Migration(migrations.Migration):
    """废标检查模块初始迁移。"""

    initial = True

    dependencies = [
        ("outline", "0013_section_content_plan"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BidCheckTask",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(
                    choices=apps.bid_check.constants.BidCheckTaskStatus.CHOICES,
                    db_index=True,
                    default=apps.bid_check.constants.BidCheckTaskStatus.PENDING,
                    max_length=20,
                    verbose_name="状态",
                )),
                ("invalid_bid_items", models.TextField(blank=True, help_text="第一阶段从招标文件提取的废标项清单 markdown", verbose_name="无效投标清单")),
                ("rejection_items", models.TextField(blank=True, verbose_name="废标项清单")),
                ("custom_check_items", models.TextField(blank=True, verbose_name="自定义检查项")),
                ("findings_summary", models.JSONField(blank=True, default=dict, help_text="如 {high:2, medium:3, low:1}", verbose_name="结果摘要")),
                ("error_message", models.TextField(blank=True, verbose_name="错误信息")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True, verbose_name="完成时间")),
                ("bid_document", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="bid_checks",
                    to="outline.biddocument",
                    verbose_name="投标文件",
                )),
                ("created_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="bid_checks",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="发起人",
                )),
                ("outline", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="bid_checks",
                    to="outline.outline",
                    verbose_name="所属大纲",
                )),
            ],
            options={
                "verbose_name": "废标检查任务",
                "verbose_name_plural": "废标检查任务",
                "db_table": "bid_check_task",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="BidCheckFinding",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("type", models.CharField(
                    choices=apps.bid_check.constants.BidCheckFindingType.CHOICES,
                    db_index=True,
                    max_length=20,
                    verbose_name="类型",
                )),
                ("severity", models.CharField(
                    choices=apps.bid_check.constants.BidCheckSeverity.CHOICES,
                    db_index=True,
                    max_length=10,
                    verbose_name="严重程度",
                )),
                ("title", models.CharField(help_text="不超过 28 个中文字符", max_length=56, verbose_name="标题")),
                ("summary", models.TextField(verbose_name="风险摘要")),
                ("requirement", models.TextField(blank=True, help_text="对应检查项或招标要求", verbose_name="检查依据")),
                ("bid_evidence", models.TextField(blank=True, help_text="投标文件中的明确证据、章节或缺失位置", verbose_name="投标文件证据")),
                ("risk_reason", models.TextField(blank=True, verbose_name="风险原因")),
                ("suggestion", models.TextField(blank=True, verbose_name="处理建议")),
                ("resolved", models.BooleanField(default=False, verbose_name="已处理")),
                ("resolved_at", models.DateTimeField(blank=True, null=True, verbose_name="处理时间")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("task", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="findings",
                    to="bid_check.bidchecktask",
                    verbose_name="检查任务",
                )),
            ],
            options={
                "verbose_name": "废标检查发现项",
                "verbose_name_plural": "废标检查发现项",
                "db_table": "bid_check_finding",
                "ordering": ["-severity", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="bidchecktask",
            index=models.Index(fields=["outline"], name="idx_bchk_task_outline"),
        ),
        migrations.AddIndex(
            model_name="bidchecktask",
            index=models.Index(fields=["bid_document"], name="idx_bchk_task_bidoc"),
        ),
        migrations.AddIndex(
            model_name="bidchecktask",
            index=models.Index(fields=["status"], name="idx_bchk_task_status"),
        ),
        migrations.AddIndex(
            model_name="bidcheckfinding",
            index=models.Index(fields=["task", "severity"], name="idx_bchk_find_sev"),
        ),
        migrations.AddIndex(
            model_name="bidcheckfinding",
            index=models.Index(fields=["task", "type"], name="idx_bchk_find_typ"),
        ),
        migrations.AddIndex(
            model_name="bidcheckfinding",
            index=models.Index(fields=["resolved"], name="idx_bchk_find_res"),
        ),
    ]
