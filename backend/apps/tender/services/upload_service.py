import uuid
import hashlib

from django.conf import settings
from django.db import transaction

from apps.common.exceptions import NotFound, ValidationError
from apps.common.models import AsyncTask
from apps.common.services.file_magic import is_allowed_upload, get_unsupported_message
from apps.common.services.storage import ObjectNotFound, StorageService
from apps.tender.models import TenderFile


def enqueue_parse_task(tender_file: TenderFile, user) -> int:
    """创建 AsyncTask 并在事务提交后投递解析任务；返回 AsyncTask.id。

    v1 的解析任务为占位实现，真正解析在 tender 后续 spec 中补。
    """
    from apps.tender.tasks import parse_tender_file

    # 预生成 celery task id 随 AsyncTask 一起落库，投递时复用同一 id，
    # 保证 AsyncTask.celery_task_id 与实际 Celery 任务一致，无需投递后回写。
    celery_task_id = str(uuid.uuid4())
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        celery_task_id=celery_task_id,
        status=AsyncTask.STATUS_PENDING,
        progress=0,
        current_step="等待解析",
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
        input_payload={"tender_file_id": tender_file.id},
        created_by=user,
    )
    tender_file.parse_task = task
    tender_file.save(update_fields=["parse_task", "updated_at"])

    # 必须等外层事务提交后再投递，否则 worker 可能读不到尚未落库的记录。
    transaction.on_commit(
        lambda: parse_tender_file.apply_async(
            args=[task.id, tender_file.id],
            task_id=celery_task_id,
            queue="parse_queue",
        )
    )
    return task.id


class TenderUploadService:
    def __init__(self, storage: StorageService | None = None):
        self.storage = storage or StorageService()

    def init_upload(self, *, project, lot, file_name, file_size, content_type, file_category, user):
        """H3：DB 落库 atomic 在前，MinIO 签名（网络 IO）放事务外。

        事务内不做网络 IO，否则 MinIO 抖动会长时间占用 DB 连接。签名
        失败时把已落库的 TenderFile 标记为 rejected，由 cleanup 任务
        在 grace 期后回收。
        """
        with transaction.atomic():
            tender_file = TenderFile.objects.create(
                project=project,
                lot=lot,
                original_name=file_name,
                file_size=file_size,
                content_type=content_type or "",
                file_category=file_category,
                object_key="__pending__",
                status=TenderFile.STATUS_UPLOADING,
                created_by=user,
            )
            object_key = StorageService.build_tender_object_key(
                project_id=project.id,
                lot_id=lot.id if lot else None,
                file_id=tender_file.id,
                original_name=file_name,
            )
            tender_file.object_key = object_key
            tender_file.save(update_fields=["object_key", "updated_at"])

        try:
            post_form = self.storage.presigned_post_upload(
                object_key,
                max_size=settings.MAX_TENDER_FILE_SIZE,
                content_type=content_type or None,
            )
        except Exception as exc:
            tender_file.status = TenderFile.STATUS_REJECTED
            tender_file.error_message = f"签名失败: {exc}"[:500]
            tender_file.save(
                update_fields=["status", "error_message", "updated_at"]
            )
            raise

        return {
            "file_id": tender_file.id,
            "upload_url": post_form["url"],
            "upload_fields": post_form["fields"],
            "object_key": object_key,
            "expires_in": settings.MINIO_PRESIGN_EXPIRES_SECONDS,
        }

    def complete_upload(self, *, tender_file: TenderFile, user):
        # 幂等：已经进入后续状态则直接返回既有结果
        if tender_file.status in {
            TenderFile.STATUS_PARSE_PENDING,
            TenderFile.STATUS_PARSING,
            TenderFile.STATUS_PARSED,
            TenderFile.STATUS_PARSE_FAILED,
        }:
            return {"file_id": tender_file.id, "status": tender_file.status, "task_id": tender_file.parse_task_id}
        if tender_file.status == TenderFile.STATUS_READY:
            return {"file_id": tender_file.id, "status": tender_file.status, "task_id": None}
        if tender_file.status != TenderFile.STATUS_UPLOADING:
            raise ValidationError(message="当前文件状态不允许完成上传", code="invalid_state")

        try:
            stat = self.storage.stat_object(tender_file.object_key)
        except ObjectNotFound as exc:
            # 对象不存在意味着直传从未成功落地；必须把 TenderFile 也
            # 落库为 rejected，否则记录会卡在 uploading，前端无法重传，
            # cleanup 任务也只能等 grace 期满才能识别遗留。
            self._reject(tender_file, "MinIO 对象不存在")
            raise NotFound(message="MinIO 对象不存在") from exc

        real_size = getattr(stat, "size", None)
        if real_size != tender_file.file_size:
            self._reject(tender_file, "文件大小与初始化信息不一致")
            raise ValidationError(message="文件大小校验失败")

        head = self.storage.read_head(tender_file.object_key)
        if not is_allowed_upload(tender_file.original_name, head):
            message = get_unsupported_message(tender_file.original_name, head) or "文件类型校验失败"
            self._reject(tender_file, message)
            raise ValidationError(message=message)

        if tender_file.file_category == TenderFile.CATEGORY_ATTACHMENT:
            tender_file.status = TenderFile.STATUS_READY
            tender_file.save(update_fields=["status", "updated_at"])
            return {"file_id": tender_file.id, "status": tender_file.status, "task_id": None}

        # 入解析队列：AsyncTask 创建、parse_task 回写、状态置 parse_pending 必须原子，
        # enqueue_parse_task 内的 transaction.on_commit 也依赖此块提交后才投递。
        with transaction.atomic():
            task_id = tender_file.parse_task_id or enqueue_parse_task(tender_file, user)
            tender_file.status = TenderFile.STATUS_PARSE_PENDING
            tender_file.save(update_fields=["status", "updated_at"])
        return {"file_id": tender_file.id, "status": tender_file.status, "task_id": task_id}

    def _reject(self, tender_file: TenderFile, message: str):
        # complete_upload 未整体 atomic，此处 save 立即提交；调用方随后 raise
        # ValidationError 也不会回滚拒绝状态。切勿把 complete_upload 改回整体 atomic。
        tender_file.status = TenderFile.STATUS_REJECTED
        tender_file.error_message = message
        tender_file.save(update_fields=["status", "error_message", "updated_at"])
        try:
            self.storage.remove_object(tender_file.object_key)
        except Exception:
            # 删除失败不影响业务状态；后续可由清理任务处理。
            pass

    def direct_upload(self, *, project, lot, file_obj, file_name, file_size, content_type, file_category, user):
        """直接上传模式（后端代理上传）。

        后端接收文件，计算 SHA256，上传 MinIO，创建 TenderFile，触发解析。
        用于不支持 crypto.subtle 的非安全上下文环境。

        Args:
            project: Project 实例
            lot: Lot 实例或 None
            file_obj: 文件对象（Django UploadedFile）
            file_name: 文件名
            file_size: 文件大小
            content_type: MIME 类型
            file_category: 文件类别
            user: 用户实例

        Returns:
            {"file_id": int, "status": str, "task_id": int or None}
        """
        # 计算文件哈希
        file_hash = hashlib.sha256()
        for chunk in file_obj.chunks():
            file_hash.update(chunk)
        file_hash_hex = file_hash.hexdigest()

        # 重置文件指针以便后续读取
        file_obj.seek(0)

        with transaction.atomic():
            # 创建 TenderFile
            tender_file = TenderFile.objects.create(
                project=project,
                lot=lot,
                original_name=file_name,
                file_size=file_size,
                content_type=content_type or "",
                file_category=file_category,
                object_key="__pending__",
                status=TenderFile.STATUS_UPLOADING,
                created_by=user,
            )

            # 生成对象键
            object_key = StorageService.build_tender_object_key(
                project_id=project.id,
                lot_id=lot.id if lot else None,
                file_id=tender_file.id,
                original_name=file_name,
            )
            tender_file.object_key = object_key
            tender_file.save(update_fields=["object_key", "updated_at"])

        # 上传到 MinIO（事务外）
        try:
            self.storage.upload_fileobj(
                file_obj,
                object_key,
                content_type=content_type or "application/octet-stream",
            )
        except Exception as exc:
            tender_file.status = TenderFile.STATUS_REJECTED
            tender_file.error_message = f"MinIO 上传失败: {exc}"[:500]
            tender_file.save(update_fields=["status", "error_message", "updated_at"])
            raise ValidationError(message=f"文件上传失败: {exc}")

        # 校验文件类型
        file_obj.seek(0)
        head = file_obj.read(4096)
        file_obj.seek(0)
        if not is_allowed_upload(file_name, head):
            message = get_unsupported_message(file_name, head) or "文件类型校验失败"
            self._reject(tender_file, message)
            raise ValidationError(message=message)

        # 根据类别决定后续流程
        if file_category == TenderFile.CATEGORY_ATTACHMENT:
            tender_file.status = TenderFile.STATUS_READY
            tender_file.save(update_fields=["status", "updated_at"])
            return {"file_id": tender_file.id, "status": tender_file.status, "task_id": None}

        # 入解析队列
        with transaction.atomic():
            task_id = enqueue_parse_task(tender_file, user)
            tender_file.status = TenderFile.STATUS_PARSE_PENDING
            tender_file.save(update_fields=["status", "updated_at"])

        return {"file_id": tender_file.id, "status": tender_file.status, "task_id": task_id}
