from rest_framework import serializers

from apps.common.models import AsyncTask


class AsyncTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = AsyncTask
        fields = [
            "id",
            "task_type",
            "celery_task_id",
            "status",
            "progress",
            "current_step",
            "total_steps",
            "related_object_type",
            "related_object_id",
            "result_payload",
            "error_message",
            "created_at",
            "started_at",
            "finished_at",
        ]
