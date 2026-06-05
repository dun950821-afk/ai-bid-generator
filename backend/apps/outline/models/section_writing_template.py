# backend/apps/outline/models/section_writing_template.py
"""章节撰写模板模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


class SectionWritingTemplate(TimeStampedModel):
    """章节撰写模板。

    定义不同类型章节的正文结构，包括：
    - 章节小标题结构
    - 必填/可选内容槽位
    - 表格字段定义
    - 允许的 RAG 通道
    """

    name = models.CharField("模板名称", max_length=100)
    template_key = models.CharField(
        "模板键",
        max_length=100,
        db_index=True,
        unique=True,
        help_text="如：project_management_plan, team_intro, evaluation_index_table",
    )
    description = models.TextField("模板描述", blank=True, default="")

    # 适用条件
    applicable_section_roles = models.JSONField(
        "适用章节定位",
        default=list,
        blank=True,
        help_text="如：['technical_solution', 'service_plan']",
    )
    applicable_keywords = models.JSONField(
        "适用关键词",
        default=list,
        blank=True,
        help_text="如：['项目管理', '实施管理', '进度管理']",
    )

    # 表达形式
    expression_form = models.CharField(
        "表达形式",
        max_length=50,
        blank=True,
        default="body_text",
        help_text="body_text, table, commitment_letter, resume_table, mixed",
    )
    writing_depth = models.CharField(
        "写作深度",
        max_length=50,
        blank=True,
        default="moderate",
        help_text="overview, moderate, detailed",
    )

    # 模板内容
    template_content = models.TextField(
        "模板内容",
        help_text="包含 {{ slot_name }} 占位符的模板文本",
    )

    # 槽位定义
    required_slots = models.JSONField(
        "必填槽位",
        default=list,
        blank=True,
        help_text=(
            '[{"name": "project_organization", "description": "项目组织架构", '
            '"allowed_rag_channels": ["company_info", "personnel"]}]'
        ),
    )
    optional_slots = models.JSONField(
        "可选槽位",
        default=list,
        blank=True,
        help_text="非必填的内容槽位",
    )

    # 表格定义
    table_schemas = models.JSONField(
        "表格定义",
        default=list,
        blank=True,
        help_text=(
            '[{"name": "index_table", "columns": ["评审项", "招标要求", "响应章节"]}]'
        ),
    )

    # 状态
    enabled = models.BooleanField("是否启用", default=True)
    priority = models.PositiveIntegerField(
        "优先级",
        default=50,
        help_text="数值越大优先级越高",
    )

    class Meta:
        db_table = "outline_section_writing_template"
        verbose_name = "章节撰写模板"
        verbose_name_plural = "章节撰写模板"
        ordering = ["-priority", "name"]

    def __str__(self):
        return self.name

    def get_slot_info(self) -> dict:
        """获取槽位信息。"""
        return {
            "required": self.required_slots,
            "optional": self.optional_slots,
        }

    def get_allowed_rag_channels_for_slot(self, slot_name: str) -> list[str]:
        """获取指定槽位允许的 RAG 通道。"""
        for slot in self.required_slots:
            if slot.get("name") == slot_name:
                return slot.get("allowed_rag_channels", [])
        for slot in self.optional_slots:
            if slot.get("name") == slot_name:
                return slot.get("allowed_rag_channels", [])
        return []
