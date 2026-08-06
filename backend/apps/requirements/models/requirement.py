# backend/apps/requirements/models/requirement.py
"""招标条款模型。"""

from django.conf import settings
from django.db import models
from pgvector.django import VectorField

from apps.common.models import TimeStampedModel
from apps.requirements.constants import RequirementDedupStatus
from apps.tender.constants import (
    RequirementType,
    MandatoryLevel,
    RiskLevel,
    ResponseStrategy,
    OwnerRole,
    ExtractionMethod,
    ReviewStatus,
)


class TenderRequirement(TimeStampedModel):
    """招标条款。

    从招标文件中抽取的结构化条款，为后续响应矩阵、大纲生成、章节撰写提供基础数据。
    """

    # ========================================================================
    # 基础关联
    # ========================================================================
    tender_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        related_name="requirements",
        verbose_name="招标文件",
    )
    parsed_document = models.ForeignKey(
        "tender.ParsedDocument",
        on_delete=models.PROTECT,  # 保护解析版本证据链
        null=True,
        blank=True,
        related_name="requirements",
        verbose_name="解析文档",
    )
    source_chunk = models.ForeignKey(
        "tender.TenderChunk",
        on_delete=models.PROTECT,  # 保护证据链
        null=True,
        blank=True,
        related_name="requirements",
        verbose_name="来源分块",
    )
    # 新的条款抽取关联（独立于 TenderChunk）
    extraction_run = models.ForeignKey(
        "requirements.RequirementExtractionRun",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="requirements",
        verbose_name="抽取运行",
    )
    # 抽取元数据字段
    extraction_type = models.CharField(
        "抽取类型",
        max_length=50,
        blank=True,
        db_index=True,
        help_text="scoring/mandatory/qualification/commercial/technical/submission",
    )
    prompt_template_id = models.PositiveIntegerField(
        "提示词模板 ID",
        null=True,
        blank=True,
    )
    prompt_version_str = models.CharField(
        "提示词版本号",
        max_length=50,
        blank=True,
    )
    llm_model = models.CharField(
        "LLM 模型",
        max_length=100,
        blank=True,
    )
    source_text = models.TextField(
        "源文本",
        blank=True,
        help_text="LLM 抽取时的原文片段",
    )
    source_section = models.CharField(
        "源章节",
        max_length=500,
        blank=True,
    )
    source_page = models.PositiveIntegerField(
        "源页码",
        null=True,
        blank=True,
    )
    raw_llm_item = models.JSONField(
        "LLM 原始输出项",
        null=True,
        blank=True,
        help_text="单条款的原始 LLM 输出 JSON",
    )
    prompt_version = models.ForeignKey(
        "generation.PromptVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extracted_requirements",
        verbose_name="提示词版本",
    )
    source_prompt_run = models.ForeignKey(
        "generation.PromptRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extracted_requirements",
        verbose_name="AI 运行记录",
    )
    detail_points = models.JSONField(
        "细项要点",
        default=list,
        blank=True,
        help_text="groups 模式下的细项要点列表（独立字段，不依赖 raw_llm_item）",
    )
    classification_reason = models.CharField(
        "归因说明",
        max_length=1000,
        blank=True,
        default="",
        help_text="3.1 technical 模式：为何归入该类",
    )

    # ========================================================================
    # 唯一与排序
    # ========================================================================
    requirement_key = models.CharField(
        "条款唯一键",
        max_length=64,
        help_text="tender_file 内唯一，用于幂等更新",
    )
    requirement_no = models.CharField(
        "条款编号",
        max_length=64,
        blank=True,
        help_text="如 ★1、2.1.3、P1-评分项1",
    )
    sort_order = models.PositiveIntegerField(
        "排序序号",
        default=0,
    )

    # ========================================================================
    # 内容字段
    # ========================================================================
    requirement_type = models.CharField(
        "条款类型",
        max_length=32,
        choices=RequirementType.CHOICES,
        default=RequirementType.OTHER,
    )
    title = models.CharField(
        "条款标题",
        max_length=255,
        blank=True,
    )
    content = models.TextField(
        "条款内容",
        help_text="保留原文含义",
    )
    summary = models.CharField(
        "内容摘要",
        max_length=500,
        blank=True,
        help_text="AI 生成的概括摘要",
    )

    # ========================================================================
    # 分类字段
    # ========================================================================
    mandatory_level = models.CharField(
        "强制程度",
        max_length=16,
        choices=MandatoryLevel.CHOICES,
        default=MandatoryLevel.UNKNOWN,
    )
    risk_level = models.CharField(
        "风险等级",
        max_length=16,
        choices=RiskLevel.CHOICES,
        default=RiskLevel.UNKNOWN,
    )
    response_strategy = models.CharField(
        "响应策略",
        max_length=32,
        choices=ResponseStrategy.CHOICES,
        default=ResponseStrategy.PENDING_REVIEW,
    )
    owner_role = models.CharField(
        "责任角色",
        max_length=32,
        choices=OwnerRole.CHOICES,
        default=OwnerRole.BID_MANAGER,
    )

    # ========================================================================
    # 响应与证据标识
    # ========================================================================
    response_needed = models.BooleanField(
        "需要响应",
        default=True,
    )
    evidence_needed = models.BooleanField(
        "需要证据材料",
        default=False,
    )

    # ========================================================================
    # 结构化信息
    # ========================================================================
    amount_info = models.JSONField(
        "金额信息",
        default=dict,
        blank=True,
        help_text="金额、币种等",
    )
    deadline_info = models.JSONField(
        "截止时间信息",
        default=dict,
        blank=True,
        help_text="截止日期、时间节点等",
    )
    score_info = models.JSONField(
        "评分信息",
        default=dict,
        blank=True,
        help_text="分值、评分标准等",
    )
    evidence_types = models.JSONField(
        "证据材料类型",
        default=list,
        blank=True,
        help_text="需要的证明材料类型列表",
    )
    metadata = models.JSONField(
        "元数据",
        default=dict,
        blank=True,
    )

    # ========================================================================
    # 原始抽取结果
    # ========================================================================
    raw_extracted = models.JSONField(
        "原始抽取结果",
        default=dict,
        blank=True,
        help_text="LLM 原始输出 JSON",
    )

    # ========================================================================
    # 审核状态
    # ========================================================================
    review_status = models.CharField(
        "审核状态",
        max_length=16,
        choices=ReviewStatus.CHOICES,
        default=ReviewStatus.PENDING,
    )

    # ========================================================================
    # 证据链字段（冗余保存，防止关联对象删除）
    # ========================================================================
    source_page_start = models.PositiveIntegerField(
        "来源起始页码",
        null=True,
        blank=True,
    )
    source_page_end = models.PositiveIntegerField(
        "来源结束页码",
        null=True,
        blank=True,
    )
    source_section_path = models.CharField(
        "来源章节路径",
        max_length=512,
        blank=True,
    )
    source_chunk_index = models.PositiveIntegerField(
        "来源分块序号",
        null=True,
        blank=True,
    )
    source_content_hash = models.CharField(
        "来源内容哈希",
        max_length=64,
        blank=True,
    )

    # ========================================================================
    # 抽取信息
    # ========================================================================
    extraction_method = models.CharField(
        "抽取方式",
        max_length=16,
        choices=ExtractionMethod.CHOICES,
        default=ExtractionMethod.HYBRID,
    )
    extractor_version = models.CharField(
        "抽取器版本",
        max_length=32,
        blank=True,
    )
    confidence = models.FloatField(
        "置信度",
        null=True,
        blank=True,
        help_text="0.0 ~ 1.0",
    )
    is_active = models.BooleanField(
        "是否有效",
        default=True,
    )

    # ========================================================================
    # 标段级去重（Phase 2）
    # ========================================================================
    embedding = VectorField(
        "嵌入向量",
        dimensions=1024,
        null=True,
        blank=True,
        help_text="标段级去重时生成（title + content）",
    )
    merged_into = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="merged_duplicates",
        verbose_name="合并入条款",
        help_text="去重后本条被合并到的保留条款",
    )
    dedup_status = models.CharField(
        "去重状态",
        max_length=16,
        choices=RequirementDedupStatus.CHOICES,
        default=RequirementDedupStatus.NONE,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="创建人",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_requirements",
        verbose_name="最后更新人",
    )

    class Meta:
        db_table = "requirements_tender_requirement"
        verbose_name = "招标条款"
        verbose_name_plural = "招标条款"
        ordering = ["tender_file", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tender_file", "requirement_key"],
                name="uniq_req_key_per_file",
            ),
        ]
        indexes = [
            models.Index(fields=["tender_file", "requirement_type"]),
            models.Index(fields=["tender_file", "mandatory_level"]),
            models.Index(fields=["tender_file", "risk_level"]),
            models.Index(fields=["tender_file", "owner_role"]),
            models.Index(fields=["tender_file", "response_strategy"]),
            models.Index(fields=["tender_file", "is_active"]),
            models.Index(fields=["tender_file", "review_status"]),
            models.Index(fields=["parsed_document"]),
            models.Index(fields=["source_chunk"]),
            models.Index(fields=["requirement_key"]),
            models.Index(fields=["extraction_run"]),
            models.Index(fields=["extraction_type"]),
        ]

    def __str__(self):
        return f"Requirement#{self.id} ({self.requirement_no or self.requirement_key[:8]})"
