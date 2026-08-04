# backend/apps/requirements/serializers.py
"""requirements 序列化器。"""

from rest_framework import serializers

from apps.requirements.models import TenderRequirement
from apps.requirements.constants import EXTRACTION_TYPES, EXTRACTION_TYPE_NAMES
from apps.tender.constants import (
    RequirementType,
    MandatoryLevel,
    RiskLevel,
    ResponseStrategy,
    OwnerRole,
    ExtractionMethod,
    ReviewStatus,
)


class RequirementExtractSerializer(serializers.Serializer):
    """条款抽取请求序列化器（旧版，向后兼容）。"""

    mode = serializers.ChoiceField(
        choices=["rule", "llm", "hybrid"],
        default="hybrid",
        help_text="抽取模式",
    )
    prompt_version_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="指定提示词版本（可选）",
    )
    model_config_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="指定模型配置（可选）",
    )
    force = serializers.BooleanField(
        default=False,
        help_text="是否强制重新抽取",
    )


class RequirementExtractV2Serializer(serializers.Serializer):
    """条款抽取请求序列化器（V2，独立于 TenderChunk）。"""

    extraction_types = serializers.ListField(
        child=serializers.ChoiceField(choices=EXTRACTION_TYPES),
        default=["scoring", "mandatory", "qualification"],
        help_text=f"抽取类型列表，可选值: {EXTRACTION_TYPES}",
    )
    overwrite = serializers.BooleanField(
        default=False,
        help_text="是否覆盖已有条款（删除旧条款后重新抽取）",
    )
    prompt_version_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="指定提示词版本（可选，对所有抽取类型生效）",
    )
    model_config_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="指定模型配置（可选）",
    )


class RequirementExtractV2ResultSerializer(serializers.Serializer):
    """条款抽取结果序列化器（V2）。"""

    run_id = serializers.IntegerField(help_text="RequirementExtractionRun ID")
    task_id = serializers.IntegerField(help_text="AsyncTask ID")
    status = serializers.CharField(help_text="任务状态")
    total_count = serializers.IntegerField(help_text="总抽取数量")
    success_count = serializers.IntegerField(help_text="成功数量")
    failed_types = serializers.ListField(
        child=serializers.CharField(),
        help_text="失败的抽取类型",
    )


class RequirementListSerializer(serializers.ModelSerializer):
    """条款列表序列化器。"""

    requirement_type_display = serializers.CharField(
        source="get_requirement_type_display",
        read_only=True,
    )
    mandatory_level_display = serializers.CharField(
        source="get_mandatory_level_display",
        read_only=True,
    )
    risk_level_display = serializers.CharField(
        source="get_risk_level_display",
        read_only=True,
    )
    response_strategy_display = serializers.CharField(
        source="get_response_strategy_display",
        read_only=True,
    )
    owner_role_display = serializers.CharField(
        source="get_owner_role_display",
        read_only=True,
    )
    review_status_display = serializers.CharField(
        source="get_review_status_display",
        read_only=True,
    )
    class Meta:
        model = TenderRequirement
        fields = [
            "id",
            "requirement_key",
            "requirement_no",
            "sort_order",
            "requirement_type",
            "requirement_type_display",
            "title",
            "content",
            "summary",
            "mandatory_level",
            "mandatory_level_display",
            "risk_level",
            "risk_level_display",
            "response_strategy",
            "response_strategy_display",
            "owner_role",
            "owner_role_display",
            "response_needed",
            "evidence_needed",
            "score_info",
            "deadline_info",
            "amount_info",
            "evidence_types",
            "review_status",
            "review_status_display",
            "source_page_start",
            "source_page_end",
            "source_section_path",
            "source_section",
            "detail_points",
            "classification_reason",
            "extraction_method",
            "extraction_type",
            "confidence",
            "is_active",
            "created_at",
            "updated_at",
        ]


class RequirementDetailSerializer(RequirementListSerializer):
    """条款详情序列化器。"""

    tender_file_id = serializers.IntegerField(read_only=True)
    parsed_document_id = serializers.IntegerField(read_only=True, allow_null=True)
    source_chunk_id = serializers.IntegerField(read_only=True, allow_null=True)
    prompt_version_id = serializers.IntegerField(read_only=True, allow_null=True)
    source_prompt_run_id = serializers.IntegerField(read_only=True, allow_null=True)
    raw_extracted = serializers.JSONField(read_only=True)
    metadata = serializers.JSONField(read_only=True)

    class Meta(RequirementListSerializer.Meta):
        fields = RequirementListSerializer.Meta.fields + [
            "tender_file_id",
            "parsed_document_id",
            "source_chunk_id",
            "prompt_version_id",
            "source_prompt_run_id",
            "raw_extracted",
            "metadata",
        ]


class RequirementUpdateSerializer(serializers.ModelSerializer):
    """条款更新序列化器。"""

    class Meta:
        model = TenderRequirement
        fields = [
            "requirement_no",
            "title",
            "content",
            "summary",
            "requirement_type",
            "mandatory_level",
            "risk_level",
            "response_strategy",
            "owner_role",
            "response_needed",
            "evidence_needed",
            "amount_info",
            "deadline_info",
            "score_info",
            "evidence_types",
            "review_status",
            "is_active",
        ]


class RequirementExtractResultSerializer(serializers.Serializer):
    """条款抽取结果序列化器。"""

    total_count = serializers.IntegerField()
    created_count = serializers.IntegerField()
    updated_count = serializers.IntegerField()
    requirement_ids = serializers.ListField(
        child=serializers.IntegerField(),
    )
    prompt_run_ids = serializers.ListField(
        child=serializers.IntegerField(),
    )
