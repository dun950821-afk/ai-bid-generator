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
    upload_url = serializers.CharField()
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
