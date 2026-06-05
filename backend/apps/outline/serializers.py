# backend/apps/outline/serializers.py
"""大纲模块序列化器。"""

from rest_framework import serializers

from apps.outline.models import (
    BidDocument,
    GenerationTask,
    Outline,
    Section,
    SectionVersion,
    SectionGenerationRecord,
    PresetOutlineTemplate,
    PresetSectionTemplate,
)


class PresetSectionTemplateSerializer(serializers.ModelSerializer):
    """预设章节模板序列化器。"""

    class Meta:
        model = PresetSectionTemplate
        fields = ["id", "title", "level", "sort_order", "parent"]


class PresetOutlineTemplateSerializer(serializers.ModelSerializer):
    """预设大纲模板序列化器。"""

    sections = PresetSectionTemplateSerializer(many=True, read_only=True)

    class Meta:
        model = PresetOutlineTemplate
        fields = ["id", "name", "description", "category", "is_active", "sections"]


class SectionSerializer(serializers.ModelSerializer):
    """章节序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    generation_status_display = serializers.CharField(
        source="get_generation_status_display", read_only=True
    )
    section_number = serializers.CharField(read_only=True)
    section_number_display = serializers.CharField(read_only=True)

    class Meta:
        model = Section
        fields = [
            "id",
            "outline",
            "parent",
            "title",
            "section_number",
            "section_number_display",
            "level",
            "sort_order",
            "content",
            "word_count",
            "status",
            "status_display",
            "generation_status",
            "generation_status_display",
            "user_prompt",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["outline", "level", "sort_order", "word_count"]


class SectionTreeSerializer(serializers.ModelSerializer):
    """章节树序列化器（扁平列表）。"""

    section_number = serializers.CharField(read_only=True)
    section_number_display = serializers.CharField(read_only=True)
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id",
            "parent",
            "title",
            "section_number",
            "section_number_display",
            "level",
            "sort_order",
            "children_count",
            "content_matrix_status",
            "content_generation_status",
            "content_word_count",
        ]

    def get_children_count(self, obj) -> int:
        if hasattr(obj, "_children_count"):
            return obj._children_count
        return obj.children.count()


class SectionVersionSerializer(serializers.ModelSerializer):
    """章节版本序列化器。"""

    source_display = serializers.CharField(source="get_source_display", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )

    class Meta:
        model = SectionVersion
        fields = [
            "id",
            "version_no",
            "source",
            "source_display",
            "word_count",
            "created_by_name",
            "created_at",
        ]


class SectionVersionDetailSerializer(serializers.ModelSerializer):
    """章节版本详情序列化器（含内容）。"""

    source_display = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = SectionVersion
        fields = [
            "id",
            "version_no",
            "content",
            "source",
            "source_display",
            "word_count",
            "created_at",
        ]


class OutlineSerializer(serializers.ModelSerializer):
    """大纲序列化器。"""

    source_display = serializers.CharField(source="get_source_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    lot_name = serializers.CharField(source="lot.name", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )
    section_count = serializers.SerializerMethodField()

    class Meta:
        model = Outline
        fields = [
            "id",
            "project",
            "lot",
            "name",
            "source",
            "source_display",
            "status",
            "status_display",
            "is_current",
            "lot_name",
            "project_name",
            "created_by_name",
            "section_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["project", "source", "is_current", "created_by"]

    def get_section_count(self, obj) -> int:
        return obj.sections.count()


class OutlineDetailSerializer(OutlineSerializer):
    """大纲详情序列化器（含章节树）。"""

    sections = SectionTreeSerializer(many=True, read_only=True)

    class Meta(OutlineSerializer.Meta):
        fields = OutlineSerializer.Meta.fields + ["sections"]


class OutlineCreateFromPresetSerializer(serializers.Serializer):
    """从预设模板创建大纲序列化器。"""

    lot_id = serializers.IntegerField()
    template_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)


class OutlineCreateFromAiSerializer(serializers.Serializer):
    """AI解析创建大纲序列化器。"""

    tender_file_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    sections_data = serializers.ListField(
        child=serializers.DictField(),
        help_text="AI解析返回的章节列表",
        required=False,
        default=list,
    )


class OutlineGenerateFromTenderSerializer(serializers.Serializer):
    """从招标文件生成大纲序列化器。"""

    tender_file_id = serializers.IntegerField(
        help_text="招标文件ID，文件必须已解析",
    )
    name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        help_text="大纲名称，默认为'{标段名} - AI解析大纲'",
    )


class SectionMoveSerializer(serializers.Serializer):
    """章节移动序列化器。"""

    new_parent_id = serializers.IntegerField(allow_null=True)
    new_sort_order = serializers.IntegerField()


class SectionAnalyzeSerializer(serializers.Serializer):
    """章节分析结果序列化器。"""

    keywords = serializers.ListField(child=serializers.CharField())
    knowledge_types = serializers.ListField(child=serializers.CharField())
    requirement_types = serializers.ListField(child=serializers.CharField())
    background = serializers.CharField()
    suggested_prompt = serializers.CharField()


class SectionGenerateSerializer(serializers.Serializer):
    """章节生成请求序列化器。"""

    user_prompt = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="用户补充提示词",
    )
    analysis_result = serializers.DictField(
        required=False,
        default=dict,
        help_text="AI分析结果（可选，前端可传入）",
    )
    force = serializers.BooleanField(
        default=False,
        help_text="是否强制重新生成",
    )


class SectionRollbackSerializer(serializers.Serializer):
    """章节回滚序列化器。"""

    version_no = serializers.IntegerField()


class GenerationStatusSerializer(serializers.Serializer):
    """生成状态序列化器。"""

    task_id = serializers.IntegerField()
    status = serializers.CharField()
    progress = serializers.IntegerField()
    current_step = serializers.CharField()
    total = serializers.IntegerField()
    completed = serializers.IntegerField()
    failed = serializers.IntegerField()
    running = serializers.IntegerField()
    sections = serializers.ListField(child=serializers.DictField())


# ========== 矩阵相关序列化器 ==========


class ContentMatrixSerializer(serializers.Serializer):
    """内容责任矩阵序列化器。"""

    section_role = serializers.CharField(required=False, allow_blank=True)
    write_scope = serializers.CharField(required=True, allow_blank=False)
    exclude_scope = serializers.CharField(required=False, allow_blank=True)
    reference_sections = serializers.ListField(required=False, default=list)
    no_duplicate_sections = serializers.ListField(required=False, default=list)
    dependency_sections = serializers.ListField(required=False, default=list)
    expression_form = serializers.CharField(required=False, allow_blank=True)
    writing_depth = serializers.CharField(required=False, allow_blank=True)
    related_requirements = serializers.ListField(required=False, default=list)
    generation_priority = serializers.IntegerField(
        required=False, default=50, min_value=0, max_value=100
    )
    ai_reasoning_summary = serializers.CharField(required=False, allow_blank=True)
    manual_notes = serializers.CharField(required=False, allow_blank=True)


class SectionMatrixSerializer(serializers.Serializer):
    """章节矩阵状态序列化器。"""

    section_id = serializers.IntegerField(source="id")
    content_matrix = ContentMatrixSerializer(required=False)
    content_matrix_status = serializers.CharField()
    content_matrix_version = serializers.IntegerField()
    content_matrix_updated_at = serializers.DateTimeField()
    content_matrix_error = serializers.CharField()


class UpdateMatrixSerializer(serializers.Serializer):
    """更新矩阵序列化器（乐观锁）。"""

    content_matrix_version = serializers.IntegerField(required=True)
    content_matrix = ContentMatrixSerializer(required=True)


class GenerateMatrixSerializer(serializers.Serializer):
    """生成矩阵请求序列化器。"""

    force = serializers.BooleanField(required=False, default=False)
    section_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )


class MatrixStatusSerializer(serializers.Serializer):
    """矩阵整体状态序列化器。"""

    total = serializers.IntegerField()
    pending = serializers.IntegerField()
    generating = serializers.IntegerField()
    generated = serializers.IntegerField()
    edited = serializers.IntegerField()
    failed = serializers.IntegerField()
    is_generating = serializers.BooleanField()
    current_task_id = serializers.IntegerField(allow_null=True)


class GenerationTaskSerializer(serializers.ModelSerializer):
    """生成任务序列化器。"""

    current_section_title = serializers.SerializerMethodField()

    class Meta:
        model = GenerationTask
        fields = [
            "id",
            "task_type",
            "status",
            "total_count",
            "success_count",
            "failed_count",
            "skipped_count",
            "current_section_id",
            "current_section_title",
            "error_message",
            "created_at",
            "updated_at",
            "finished_at",
            "params",
            "result",
        ]

    def get_current_section_title(self, obj):
        if obj.current_section_id:
            from apps.outline.models import Section

            try:
                section = Section.objects.get(pk=obj.current_section_id)
                return section.title
            except Section.DoesNotExist:
                pass
        return None


# ========== 批量正文生成序列化器 ==========


class BatchGenerationPrecheckSerializer(serializers.Serializer):
    """批量生成预检查结果序列化器。"""

    can_generate = serializers.BooleanField()
    total_sections = serializers.IntegerField()
    eligible_sections = serializers.IntegerField()
    matrix_ready_sections = serializers.IntegerField()
    matrix_missing_sections = serializers.IntegerField()
    already_generated = serializers.IntegerField()
    warnings = serializers.ListField(child=serializers.DictField())
    errors = serializers.ListField(child=serializers.DictField())
    eligible_section_ids = serializers.ListField(child=serializers.IntegerField())


class BatchGenerationRequestSerializer(serializers.Serializer):
    """批量正文生成请求序列化器。"""

    section_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        help_text="指定章节ID列表，空则自动选择所有可用章节",
    )
    include_success = serializers.BooleanField(
        required=False,
        default=False,
        help_text="是否包含已成功生成的章节（强制重新生成）",
    )
    parallel = serializers.BooleanField(
        required=False,
        default=False,
        help_text="是否并行执行（第一版暂不支持）",
    )
    max_parallel = serializers.IntegerField(
        required=False,
        default=3,
        min_value=1,
        max_value=10,
        help_text="最大并行数",
    )
    skip_on_failure = serializers.BooleanField(
        required=False,
        default=True,
        help_text="失败是否跳过继续生成后续章节",
    )
    user_prompt_default = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="默认用户提示词（应用于所有章节）",
    )


class BatchGenerationProgressSerializer(serializers.Serializer):
    """批量生成进度序列化器。"""

    task_id = serializers.IntegerField()
    status = serializers.CharField()
    total = serializers.IntegerField()
    success = serializers.IntegerField()
    failed = serializers.IntegerField()
    skipped = serializers.IntegerField()
    running = serializers.IntegerField()
    pending = serializers.IntegerField()
    progress_percent = serializers.IntegerField()
    current_section = serializers.DictField(allow_null=True)
    sections = serializers.ListField(child=serializers.DictField())
    error_message = serializers.CharField(allow_blank=True)
    started_at = serializers.DateTimeField(allow_null=True)
    finished_at = serializers.DateTimeField(allow_null=True)


class GenerationOrderSerializer(serializers.Serializer):
    """生成顺序序列化器。"""

    section_id = serializers.IntegerField()
    title = serializers.CharField()
    leaf_depth = serializers.IntegerField()
    level = serializers.IntegerField()
    sort_order = serializers.IntegerField()
    has_children = serializers.BooleanField()
    batch = serializers.IntegerField()
    priority = serializers.IntegerField()


# ========== 标书 Word 文档序列化器 ==========


class BidDocumentSerializer(serializers.ModelSerializer):
    """标书 Word 文档序列化器。"""

    class Meta:
        model = BidDocument
        fields = [
            "id",
            "outline",
            "title",
            "version",
            "status",
            "file_key",
            "saved_at",
            "force_saved_at",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "outline", "version", "file_key", "created_by"]


class BuildDocxResponseSerializer(serializers.Serializer):
    """生成 Word 草稿响应序列化器。"""

    document_id = serializers.IntegerField()
    title = serializers.CharField()
    version = serializers.IntegerField()
    file_key = serializers.CharField()
    file_url = serializers.CharField()
    warnings = serializers.ListField(child=serializers.DictField())


class LatestBidDocumentSerializer(serializers.Serializer):
    """最新 Word 文档状态序列化器。"""

    exists = serializers.BooleanField()
    document_id = serializers.IntegerField(allow_null=True)
    title = serializers.CharField(allow_null=True)
    version = serializers.IntegerField(allow_null=True)
    status = serializers.CharField(allow_null=True)
    updated_at = serializers.CharField(allow_null=True)


class OnlyofficeConfigSerializer(serializers.Serializer):
    """ONLYOFFICE 配置序列化器。"""

    documentServerUrl = serializers.CharField()
    config = serializers.DictField()