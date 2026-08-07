"""招标文件相关序列化器。"""

from rest_framework import serializers

from apps.projects.models import Project
from apps.tender.models import TenderFile, ParsedDocument, TenderChunk, PipelineJob


class InitUploadSerializer(serializers.Serializer):
    """初始化上传序列化器。"""

    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(),
        error_messages={"does_not_exist": "项目不存在"},
    )
    lot = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.none(),  # 占位，在 __init__ 中动态设置
        allow_null=True,
        required=False,
        default=None,
        error_messages={"does_not_exist": "标段不存在"},
    )
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1)
    content_type = serializers.CharField(max_length=100, required=False, default="")
    file_category = serializers.ChoiceField(
        choices=TenderFile.CATEGORY_CHOICES
    )
    main_file_id = serializers.IntegerField(required=False, allow_null=True, default=None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 动态设置 lot 的 queryset，避免循环导入
        from apps.projects.models import Lot

        self.fields["lot"].queryset = Lot.objects.all()

    def validate_file_size(self, value):
        """校验文件大小不超过系统限制。"""
        from django.conf import settings

        max_size = getattr(settings, "MAX_TENDER_FILE_SIZE", 100 * 1024 * 1024)  # 默认 100MB
        if value > max_size:
            raise serializers.ValidationError(f"文件大小超过限制（最大 {max_size // 1024 // 1024} MB）")
        return value

    def validate(self, data):
        """验证 lot 属于 project；解析并校验 main_file 关联。"""
        lot = data.get("lot")
        project = data["project"]
        if lot and lot.project_id != project.id:
            raise serializers.ValidationError({"lot": "标段不属于该项目"})

        main_file_id = data.pop("main_file_id", None)
        main_file = None
        if main_file_id is not None:
            main_file = TenderFile.objects.filter(pk=main_file_id).first()
            if main_file is None:
                raise serializers.ValidationError({"main_file_id": "主文件不存在"})
            from apps.common.exceptions import ValidationError as ServiceValidationError
            from apps.tender.services.upload_service import validate_main_file

            try:
                validate_main_file(
                    main_file,
                    project=project,
                    lot=lot,
                    file_category=data["file_category"],
                )
            except ServiceValidationError as exc:
                raise serializers.ValidationError({"main_file_id": exc.message}) from exc
        data["main_file"] = main_file
        return data

    def to_internal_value(self, data):
        """支持 project_id/lot_id 作为 project/lot 的别名。"""
        # 允许前端传入 project_id，映射到 project
        if "project_id" in data and "project" not in data:
            data = {**data, "project": data["project_id"]}
        if "lot_id" in data and "lot" not in data:
            data = {**data, "lot": data["lot_id"]}
        return super().to_internal_value(data)


class TenderFileSerializer(serializers.ModelSerializer):
    """招标文件序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    file_category_display = serializers.CharField(source="get_file_category_display", read_only=True)
    file_size_mb = serializers.SerializerMethodField()
    lot_name = serializers.CharField(source="lot.name", read_only=True)
    main_file_name = serializers.SerializerMethodField()
    outline_count = serializers.IntegerField(source="outline_set.count", read_only=True)
    has_parsed_content = serializers.SerializerMethodField()

    class Meta:
        model = TenderFile
        fields = [
            "id",
            "project",
            "lot",
            "lot_name",
            "main_file",
            "main_file_name",
            "original_name",
            "file_size",
            "file_size_mb",
            "content_type",
            "file_category",
            "file_category_display",
            "object_key",
            "status",
            "status_display",
            "parse_task",
            "error_message",
            "outline_count",
            "has_parsed_content",
            "created_at",
            "updated_at",
        ]

    def get_file_size_mb(self, obj):
        return round(obj.file_size / 1024 / 1024, 2)

    def get_main_file_name(self, obj):
        return obj.main_file.original_name if obj.main_file_id else None

    def get_has_parsed_content(self, obj):
        # 列表视图已用 Exists 注解（见 TenderFileListView.get_queryset），
        # 未注解的调用方（详情视图等）退回查询兜底
        if hasattr(obj, "has_parsed_content"):
            return obj.has_parsed_content
        return ParsedDocument.objects.filter(
            tender_file=obj,
            is_active=True,
        ).exclude(markdown_uri__isnull=True).exclude(markdown_uri="").exists()


class ParsedDocumentSerializer(serializers.ModelSerializer):
    """解析文档序列化器。"""

    tender_file_name = serializers.CharField(source="tender_file.original_name", read_only=True)
    chunk_count = serializers.SerializerMethodField()

    class Meta:
        model = ParsedDocument
        fields = [
            "id",
            "tender_file",
            "tender_file_name",
            "is_active",
            "markdown_uri",
            "page_count",
            "parse_engine",
            "parser_version",
            "parse_quality",
            "quality_metrics",
            "parse_duration",
            "section_tree",
            "input_hash",
            "output_hash",
            "chunk_count",
            "created_at",
            "updated_at",
        ]

    def get_chunk_count(self, obj):
        return obj.chunks.count()


class TenderChunkSerializer(serializers.ModelSerializer):
    """语义分块序列化器。"""

    chunk_level_display = serializers.CharField(source="get_chunk_level_display", read_only=True)
    chunk_type_display = serializers.CharField(source="get_chunk_type_display", read_only=True)

    class Meta:
        model = TenderChunk
        fields = [
            "id",
            "parsed_document",
            "parent_chunk",
            "chunk_level",
            "chunk_level_display",
            "chunk_index",
            "content_hash",
            "chunk_type",
            "chunk_type_display",
            "secondary_types",
            "classification_confidence",
            "matched_keywords",
            "section_title",
            "section_path",
            "clause_no",
            "content",
            "token_count",
            "page_start",
            "page_end",
            "is_table",
            "is_mandatory",
            "has_deadline",
            "has_amount",
            "has_score",
            "has_penalty",
            "has_timeline",
            "embedding_status",
            "created_at",
        ]


class TenderChunkListSerializer(serializers.ModelSerializer):
    """语义分块列表序列化器（不含 content）。"""

    chunk_level_display = serializers.CharField(source="get_chunk_level_display", read_only=True)
    chunk_type_display = serializers.CharField(source="get_chunk_type_display", read_only=True)

    class Meta:
        model = TenderChunk
        fields = [
            "id",
            "chunk_level",
            "chunk_level_display",
            "chunk_index",
            "chunk_type",
            "chunk_type_display",
            "section_title",
            "section_path",
            "clause_no",
            "token_count",
            "is_mandatory",
            "has_deadline",
            "has_amount",
            "has_score",
            "has_penalty",
            "has_timeline",
        ]


class PipelineJobSerializer(serializers.ModelSerializer):
    """流水线任务序列化器。"""

    stage_display = serializers.CharField(source="get_stage_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = PipelineJob
        fields = [
            "id",
            "tender_file",
            "stage",
            "stage_display",
            "status",
            "status_display",
            "version",
            "started_at",
            "finished_at",
            "error_message",
            "retry_count",
            "created_at",
        ]


class ChunkStatsSerializer(serializers.Serializer):
    """分块统计序列化器。"""

    total_count = serializers.IntegerField()
    type_distribution = serializers.DictField()
    level_distribution = serializers.DictField()
    mandatory_count = serializers.IntegerField()
    feature_stats = serializers.DictField()


class ParseDebugSerializer(serializers.Serializer):
    """解析调试输出序列化器。"""

    tender_file_id = serializers.IntegerField()
    parsed_document_id = serializers.IntegerField()
    page_count = serializers.IntegerField()
    parse_engine = serializers.CharField()
    parser_version = serializers.CharField()
    parse_quality = serializers.CharField()
    parse_duration_seconds = serializers.FloatField()
    quality_metrics = serializers.DictField()


class ChunkDebugSerializer(serializers.Serializer):
    """分块调试输出序列化器。"""

    parsed_document_id = serializers.IntegerField()
    chunk_count = serializers.IntegerField()
    chunk_type_distribution = serializers.DictField()
    chunk_level_distribution = serializers.DictField()
    mandatory_chunk_count = serializers.IntegerField()
    table_chunk_count = serializers.IntegerField()
    feature_stats = serializers.DictField()
    warnings = serializers.ListField()
