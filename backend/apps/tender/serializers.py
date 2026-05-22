from django.conf import settings
from rest_framework import serializers

from apps.projects.models import Lot, Project
from apps.tender.models import TenderFile


class InitUploadSerializer(serializers.Serializer):
    project_id = serializers.IntegerField()
    lot_id = serializers.IntegerField(required=False, allow_null=True)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1)
    content_type = serializers.CharField(max_length=128, required=False, allow_blank=True)
    file_category = serializers.ChoiceField(choices=[c[0] for c in TenderFile.CATEGORY_CHOICES])

    def validate_file_size(self, value):
        # 前置校验，避免明知超限还白白签一次预签名；MinIO 端的
        # content-length-range 是最终防线，二者保持一致由 settings 统一。
        if value > settings.MAX_TENDER_FILE_SIZE:
            raise serializers.ValidationError(
                f"文件大小超过限制 {settings.MAX_TENDER_FILE_SIZE} 字节"
            )
        return value

    def validate(self, attrs):
        try:
            attrs["project"] = Project.objects.get(pk=attrs["project_id"])
        except Project.DoesNotExist as exc:
            raise serializers.ValidationError({"project_id": "项目不存在"}) from exc

        lot_id = attrs.get("lot_id")
        if lot_id:
            try:
                attrs["lot"] = Lot.objects.get(pk=lot_id, project=attrs["project"])
            except Lot.DoesNotExist as exc:
                raise serializers.ValidationError({"lot_id": "标段不存在或不属于该项目"}) from exc
        else:
            attrs["lot"] = None
        return attrs


class InitUploadResponseSerializer(serializers.Serializer):
    file_id = serializers.IntegerField()
    upload_url = serializers.CharField()  # MinIO POST 端点（bucket 维度）
    upload_fields = serializers.DictField()  # multipart 必须随 body 一起 POST 的隐藏字段
    object_key = serializers.CharField()
    expires_in = serializers.IntegerField()


class CompleteUploadResponseSerializer(serializers.Serializer):
    file_id = serializers.IntegerField()
    status = serializers.CharField()
    task_id = serializers.IntegerField(allow_null=True)


class TenderFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenderFile
        fields = [
            "id",
            "project",
            "lot",
            "original_name",
            "file_size",
            "content_type",
            "file_category",
            "object_key",
            "status",
            "parse_task",
            "error_message",
            "created_at",
            "updated_at",
        ]
