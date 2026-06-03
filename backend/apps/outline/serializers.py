# backend/apps/outline/serializers.py
"""大纲模块序列化器。"""

from rest_framework import serializers

from apps.outline.models import (
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

    class Meta:
        model = Section
        fields = [
            "id",
            "outline",
            "parent",
            "title",
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

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    generation_status_display = serializers.CharField(
        source="get_generation_status_display", read_only=True
    )
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id",
            "parent",
            "title",
            "level",
            "sort_order",
            "status",
            "status_display",
            "generation_status",
            "generation_status_display",
            "word_count",
            "children_count",
        ]

    def get_children_count(self, obj) -> int:
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