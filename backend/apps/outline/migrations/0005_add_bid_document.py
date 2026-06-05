# backend/apps/outline/migrations/0005_add_bid_document.py
"""添加 BidDocument 模型。"""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("outline", "0004_add_generation_task"),
    ]

    operations = [
        migrations.CreateModel(
            name="BidDocument",
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
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True),
                ),
                (
                    "title",
                    models.CharField(max_length=255, verbose_name="文档标题"),
                ),
                (
                    "docx_file",
                    models.FileField(
                        upload_to="bid_documents/%Y/%m/%d/",
                        verbose_name="Word 文件",
                    ),
                ),
                (
                    "version",
                    models.PositiveIntegerField(default=1, verbose_name="版本号"),
                ),
                (
                    "file_key",
                    models.CharField(
                        db_index=True,
                        help_text="每次保存后更新，用于 ONLYOFFICE 缓存刷新",
                        max_length=128,
                        verbose_name="ONLYOFFICE 文件 Key",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "草稿"),
                            ("editing", "编辑中"),
                            ("saved", "已保存"),
                            ("exported", "已导出"),
                        ],
                        db_index=True,
                        default="draft",
                        max_length=20,
                        verbose_name="文档状态",
                    ),
                ),
                (
                    "saved_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="ONLYOFFICE status=2 保存成功的时间",
                        null=True,
                        verbose_name="最后保存时间",
                    ),
                ),
                (
                    "force_saved_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="ONLYOFFICE status=6 强制保存的时间",
                        null=True,
                        verbose_name="强制保存时间",
                    ),
                ),
                (
                    "last_callback_status",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="ONLYOFFICE callback 的 status 值",
                        max_length=20,
                        verbose_name="最后回调状态",
                    ),
                ),
                (
                    "last_callback_payload",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="ONLYOFFICE callback 的完整 payload（调试用）",
                        verbose_name="最后回调数据",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="创建人",
                    ),
                ),
                (
                    "outline",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="bid_documents",
                        to="outline.outline",
                        verbose_name="所属大纲",
                    ),
                ),
            ],
            options={
                "verbose_name": "标书 Word 文档",
                "verbose_name_plural": "标书 Word 文档",
                "db_table": "outline_bid_document",
                "ordering": ["-version"],
            },
            bases=(models.Model,),
        ),
        migrations.AddIndex(
            model_name="biddocument",
            index=models.Index(fields=["outline", "-version"], name="outline_bid_doc_outline_idx"),
        ),
    ]