import logging
from datetime import timedelta

from django.utils import timezone

from apps.common.models import AsyncTask
from apps.common.services.storage import StorageService
from apps.tender.models import TenderFile
from config.celery import app

logger = logging.getLogger(__name__)


@app.task(name="apps.tender.parse_tender_file", bind=True)
def parse_tender_file(self, task_id: int, tender_file_id: int):
    """v1 占位解析任务：只更新任务与文件状态，不做真实文档解析。

    M1：必须捕获异常并把 AsyncTask / TenderFile 都置为失败态，否则
    解析中途失败时记录卡在 running / parsing，前端永远看不到失败原因
    也无法重试。bind=True 方便后续接 retry / 拿 task.request 上下文。
    """
    task = AsyncTask.objects.get(pk=task_id)
    tender_file = TenderFile.objects.get(pk=tender_file_id)

    try:
        task.status = AsyncTask.STATUS_RUNNING
        task.progress = 10
        task.current_step = "开始解析"
        task.started_at = timezone.now()
        task.save(
            update_fields=["status", "progress", "current_step", "started_at"]
        )

        tender_file.status = TenderFile.STATUS_PARSING
        tender_file.save(update_fields=["status", "updated_at"])

        task.status = AsyncTask.STATUS_SUCCESS
        task.progress = 100
        task.current_step = "解析占位任务完成"
        task.result_payload = {
            "tender_file_id": tender_file.id,
            "placeholder": True,
        }
        task.finished_at = timezone.now()
        task.save(
            update_fields=[
                "status",
                "progress",
                "current_step",
                "result_payload",
                "finished_at",
            ]
        )

        tender_file.status = TenderFile.STATUS_PARSED
        tender_file.save(update_fields=["status", "updated_at"])
        return task.result_payload
    except Exception as exc:
        logger.exception(
            "parse_tender_file failed: task_id=%s tender_file_id=%s",
            task_id,
            tender_file_id,
        )
        _mark_parse_failed(task, tender_file, exc)
        raise


def _mark_parse_failed(task: AsyncTask, tender_file: TenderFile, exc: Exception):
    """把任务和文件落到失败态；记录尽量短的错误摘要，避免巨型 traceback 入库。"""
    error_message = f"{type(exc).__name__}: {exc}"[:512]
    task.status = AsyncTask.STATUS_FAILED
    task.error_message = error_message
    task.finished_at = timezone.now()
    try:
        task.save(
            update_fields=["status", "error_message", "finished_at"]
        )
    except Exception:
        logger.exception("AsyncTask save in failure handler also failed")
    try:
        tender_file.status = TenderFile.STATUS_PARSE_FAILED
        tender_file.error_message = error_message
        tender_file.save(
            update_fields=["status", "error_message", "updated_at"]
        )
    except Exception:
        logger.exception("TenderFile save in failure handler also failed")


@app.task(name="apps.tender.cleanup_stale_uploads")
def cleanup_stale_uploads():
    """清理超过 24h 仍处于 uploading 的孤儿上传记录。"""
    storage = StorageService()
    cutoff = timezone.now() - timedelta(hours=24)
    qs = TenderFile.objects.filter(status=TenderFile.STATUS_UPLOADING, created_at__lt=cutoff)
    count = 0
    for tender_file in qs:
        try:
            storage.remove_object(tender_file.object_key)
        except Exception:
            pass
        tender_file.status = TenderFile.STATUS_UPLOAD_EXPIRED
        tender_file.save(update_fields=["status", "updated_at"])
        count += 1
    return {"expired": count}
