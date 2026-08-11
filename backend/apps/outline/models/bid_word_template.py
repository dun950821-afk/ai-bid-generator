# backend/apps/outline/models/bid_word_template.py
"""Word 模板中心模型。

模板 = 一份真实的 .docx 文件，用户在 ONLYOFFICE 中在线设计，
导出标书时由模板渲染引擎（docxtpl）填充变量与正文。

版本策略（方案 §17）：
- 模板持有唯一 draft 文件（draft_object_key），ONLYOFFICE 每次保存
  只更新 draft 并自增 draft_revision，不产生业务版本；
- 点击“发布”时把当前 draft 复制为 versions/v{n}.docx 并生成
  BidWordTemplateVersion 记录，published 版本不可修改。
"""

import time

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class BidWordTemplateScope:
    """模板作用域。"""

    SYSTEM = "system"
    ENTERPRISE = "enterprise"
    PROJECT = "project"

    CHOICES = [
        (SYSTEM, "系统模板"),
        (ENTERPRISE, "企业模板"),
        (PROJECT, "项目模板"),
    ]


class BidWordTemplateStatus:
    """模板状态。"""

    DRAFT = "draft"
    ACTIVE = "active"
    DISABLED = "disabled"
    ARCHIVED = "archived"

    CHOICES = [
        (DRAFT, "草稿"),
        (ACTIVE, "已发布"),
        (DISABLED, "已停用"),
        (ARCHIVED, "已归档"),
    ]


class BidWordTemplate(TimeStampedModel):
    """Word 标书模板。"""

    name = models.CharField("模板名称", max_length=255)
    code = models.CharField(
        "模板编码",
        max_length=100,
        unique=True,
        help_text="唯一标识，用于程序引用",
    )
    description = models.TextField("模板说明", blank=True, default="")

    scope_type = models.CharField(
        "作用域",
        max_length=20,
        choices=BidWordTemplateScope.CHOICES,
        default=BidWordTemplateScope.SYSTEM,
        db_index=True,
    )
    enterprise = models.ForeignKey(
        "enterprise.CompanyProfile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="bid_word_templates",
        verbose_name="所属企业",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="bid_word_templates",
        verbose_name="所属项目",
    )

    status = models.CharField(
        "状态",
        max_length=20,
        choices=BidWordTemplateStatus.CHOICES,
        default=BidWordTemplateStatus.DRAFT,
        db_index=True,
    )
    published_version = models.ForeignKey(
        "outline.BidWordTemplateVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="当前发布版本",
    )
    is_default = models.BooleanField("是否默认模板", default=False)
    usage_count = models.PositiveIntegerField("使用次数", default=0)

    # 草稿级样式映射（可编辑）；发布时拷贝进版本快照
    style_mapping = models.JSONField(
        "样式映射",
        default=dict,
        blank=True,
        help_text="逻辑样式名 → 模板实际样式名，如 {'heading1': '标题 1'}",
    )

    # ---- draft 文件（ONLYOFFICE 编辑目标）----
    draft_object_key = models.CharField(
        "草稿 MinIO 对象键",
        max_length=500,
        blank=True,
        default="",
    )
    draft_revision = models.PositiveIntegerField(
        "草稿修订号",
        default=0,
        help_text="ONLYOFFICE 每次保存（status=2）后 +1，不产生业务版本",
    )
    draft_file_key = models.CharField(
        "草稿 ONLYOFFICE 文件 Key",
        max_length=128,
        blank=True,
        default="",
        db_index=True,
        help_text="每次保存后更新，用于 ONLYOFFICE 缓存刷新",
    )
    draft_saved_at = models.DateTimeField(
        "草稿最后保存时间",
        null=True,
        blank=True,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_bid_word_templates",
        verbose_name="创建人",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_bid_word_templates",
        verbose_name="更新人",
    )

    class Meta:
        db_table = "outline_bid_word_template"
        verbose_name = "Word 标书模板"
        verbose_name_plural = "Word 标书模板"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["scope_type", "status"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_scope_type_display()})"

    def generate_draft_file_key(self) -> str:
        """生成新的 draft file_key。"""
        return f"tpl-{self.id}-r{self.draft_revision}-{int(time.time() * 1000)}"

    def has_draft_file(self) -> bool:
        return bool(self.draft_object_key)


class BidWordTemplateVersionStatus:
    """版本校验/编译状态。"""

    NOT_VALIDATED = "not_validated"
    VALIDATING = "validating"
    PASSED = "passed"
    FAILED = "failed"

    CHOICES = [
        (NOT_VALIDATED, "未校验"),
        (VALIDATING, "校验中"),
        (PASSED, "校验通过"),
        (FAILED, "校验失败"),
    ]


class BidWordTemplateVersion(TimeStampedModel):
    """Word 模板发布版本（不可变）。"""

    template = models.ForeignKey(
        "outline.BidWordTemplate",
        on_delete=models.CASCADE,
        related_name="versions",
        verbose_name="所属模板",
    )
    version_no = models.PositiveIntegerField("版本号")

    object_key = models.CharField("版本文件 MinIO 对象键", max_length=500)
    file_name = models.CharField("文件名", max_length=255)
    file_size = models.PositiveIntegerField("文件大小", default=0)
    file_hash = models.CharField(
        "文件 SHA256",
        max_length=64,
        db_index=True,
        help_text="用于编译缓存与生成快照追溯",
    )

    style_mapping = models.JSONField(
        "样式映射",
        default=dict,
        blank=True,
        help_text="逻辑样式名 → 模板实际样式名，如 {'heading1': '标题 1'}",
    )
    variable_schema = models.JSONField(
        "变量清单",
        default=list,
        blank=True,
        help_text="模板中扫描到的变量 key 列表",
    )

    validation_status = models.CharField(
        "校验状态",
        max_length=20,
        choices=BidWordTemplateVersionStatus.CHOICES,
        default=BidWordTemplateVersionStatus.NOT_VALIDATED,
    )
    validation_result = models.JSONField(
        "校验结果",
        default=dict,
        blank=True,
    )
    compile_status = models.CharField(
        "编译状态",
        max_length=20,
        blank=True,
        default="",
        help_text="compiled/failed，Phase 2 编译器接入后使用",
    )

    published_at = models.DateTimeField("发布时间", null=True, blank=True)

    # 预览产物（发布时经 ONLYOFFICE Conversion API 生成，方案 §54）
    preview_image_key = models.CharField(
        "首页预览图 MinIO 对象键",
        max_length=500,
        blank=True,
        default="",
    )
    preview_pdf_key = models.CharField(
        "预览 PDF MinIO 对象键",
        max_length=500,
        blank=True,
        default="",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="发布人",
    )

    class Meta:
        db_table = "outline_bid_word_template_version"
        verbose_name = "Word 模板版本"
        verbose_name_plural = "Word 模板版本"
        ordering = ["-version_no"]
        constraints = [
            models.UniqueConstraint(
                fields=["template", "version_no"],
                name="uniq_template_version_no",
            ),
        ]

    def __str__(self):
        return f"{self.template.name} v{self.version_no}"
