# -*- coding: utf-8 -*-
"""响应模板模型。

TenderResponseTemplate: 一次"招标文件 → 响应模板"识别与生成会话。
TenderTemplateBlock:    识别出的填充位置(段落/表格cell/表格行/区块)。
TenderResponseDocument: 生成产物(MinIO 存储, ONLYOFFICE 可预览)。
"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.response_template.constants import (
    BlockConfirmStatus,
    BlockFillStatus,
    BlockType,
    DocumentKind,
    TemplateStatus,
)


class TenderResponseTemplate(TimeStampedModel):
    """响应模板(项目级, 由招标文件解析产物触发创建)。"""

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="response_templates",
        verbose_name="项目",
    )
    lot = models.ForeignKey(
        "projects.Lot",
        on_delete=models.CASCADE,
        related_name="response_templates",
        null=True,
        blank=True,
        verbose_name="标段",
    )
    source_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        related_name="response_templates",
        verbose_name="源招标文件",
    )
    parsed_document = models.ForeignKey(
        "tender.ParsedDocument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="response_templates",
        verbose_name="解析文档",
    )
    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="response_templates",
        verbose_name="关联大纲(可选)",
    )

    name = models.CharField("模板名称", max_length=255)
    source_section = models.CharField("来源章节", max_length=255, blank=True, default="")

    status = models.CharField(
        "状态",
        max_length=20,
        choices=TemplateStatus.CHOICES,
        default=TemplateStatus.PENDING,
        db_index=True,
    )
    confidence = models.FloatField("整体置信度", null=True, blank=True)

    # AI 原始识别输出(审计/复现用, 不承载业务逻辑)
    schema_json = models.JSONField("AI识别原始结果", default=list, blank=True)
    summary_json = models.JSONField("识别统计", default=dict, blank=True)
    error_message = models.TextField("错误信息", blank=True, default="")

    # 编译模板(注入 Content Control 标记, v2 精确定位用)
    compiled_file_key = models.CharField(
        "编译模板 MinIO 对象键", max_length=500, blank=True, default="",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_response_templates",
        verbose_name="创建人",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_response_templates",
        verbose_name="更新人",
    )

    class Meta:
        db_table = "response_template"
        verbose_name = "招标响应模板"
        verbose_name_plural = "招标响应模板"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["project", "status"]),
            models.Index(fields=["source_file"]),
        ]

    def __str__(self):
        return self.name


class TenderTemplateBlock(TimeStampedModel):
    """识别出的填充位置块。

    定位方式(v1): anchor_text 文本锚点 + anchor_type 定位类型,
    填充时在原始 docx 中按锚点查找并填充。
    """

    template = models.ForeignKey(
        "response_template.TenderResponseTemplate",
        on_delete=models.CASCADE,
        related_name="blocks",
        verbose_name="所属模板",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_blocks",
        verbose_name="父块",
    )

    block_key = models.CharField("块标识", max_length=64, help_text="如 附件1/A3-01")
    title = models.CharField("标题", max_length=255)
    block_type = models.CharField(
        "类型",
        max_length=20,
        choices=BlockType.CHOICES,
        db_index=True,
    )
    order = models.PositiveIntegerField("顺序", default=0)
    is_separate_package = models.BooleanField(
        "是否单独密封/装订",
        default=False,
        help_text="附件7 报价表等要求单独密封的块",
    )

    # 定位信息
    anchor_text = models.CharField(
        "定位锚点文本", max_length=500, blank=True, default="",
        help_text="在 docx 中查找的文本片段(段落/表格cell)",
    )
    anchor_type = models.CharField(
        "锚点类型",
        max_length=20,
        default="text",
        help_text="text=段落文本 / cell=表格单元格 / row=表格行",
    )

    # 识别信息
    confidence = models.FloatField("置信度", null=True, blank=True)
    source_config = models.JSONField(
        "来源配置", default=dict, blank=True,
        help_text="AI 生成依据、条款范围、项目需求引用等",
    )
    binding_config = models.JSONField(
        "绑定配置", default=dict, blank=True,
        help_text="AUTO_FIELD: {field: company.name}; MATERIAL_SLOT: {usage_key: ...}",
    )
    ai_result = models.JSONField(
        "AI识别原始输出", default=dict, blank=True,
    )

    # 确认/填充状态
    confirm_status = models.CharField(
        "确认状态",
        max_length=20,
        choices=BlockConfirmStatus.CHOICES,
        default=BlockConfirmStatus.UNCONFIRMED,
    )
    fill_status = models.CharField(
        "填充状态",
        max_length=20,
        choices=BlockFillStatus.CHOICES,
        default=BlockFillStatus.EMPTY,
    )
    fill_payload = models.JSONField(
        "填充内容", default=dict, blank=True,
        help_text="AI 生成/映射后的填充内容快照",
    )

    class Meta:
        db_table = "response_template_block"
        verbose_name = "响应模板块"
        verbose_name_plural = "响应模板块"
        ordering = ["order"]
        indexes = [
            models.Index(fields=["template", "block_type"]),
            models.Index(fields=["template", "fill_status"]),
        ]

    def __str__(self):
        return f"{self.block_key} {self.title} [{self.block_type}]"


class TenderResponseDocument(TimeStampedModel):
    """生成产物文档。"""

    STATUS_GENERATING = "generating"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = [
        (STATUS_GENERATING, "生成中"),
        (STATUS_DONE, "已完成"),
        (STATUS_FAILED, "失败"),
    ]

    template = models.ForeignKey(
        "response_template.TenderResponseTemplate",
        on_delete=models.CASCADE,
        related_name="documents",
        verbose_name="所属模板",
    )
    title = models.CharField("文档标题", max_length=255)
    kind = models.CharField(
        "产物类型",
        max_length=20,
        choices=DocumentKind.CHOICES,
        default=DocumentKind.MAIN,
    )
    status = models.CharField(
        "状态",
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_GENERATING,
    )

    object_key = models.CharField("MinIO 对象键", max_length=500, blank=True, default="")
    file_name = models.CharField("文件名", max_length=255, blank=True, default="")
    file_size = models.PositiveIntegerField("文件大小", default=0)
    file_hash = models.CharField("SHA256", max_length=64, blank=True, default="")
    error_message = models.TextField("错误信息", blank=True, default="")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_response_documents",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "response_template_document"
        verbose_name = "响应文件产物"
        verbose_name_plural = "响应文件产物"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
