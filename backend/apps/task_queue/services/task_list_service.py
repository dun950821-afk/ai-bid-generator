"""任务列表服务：GenerationTask + AsyncTask 统一 DTO + Celery 实时快照。

DB 状态是唯一事实源；celery 快照（inspect active/reserved）仅做展示增强，
worker 失联时降级为 None，不影响列表功能。
"""

import logging
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

CELERY_SNAPSHOT_CACHE_KEY = "task_queue:celery_snapshot"
CELERY_SNAPSHOT_TTL = 10
CELERY_INSPECT_TIMEOUT = 0.5
_WORKER_UNREACHABLE = "__task_queue_worker_unreachable__"

TERMINAL_STATUSES = ("completed", "failed", "cancelled", "partial_success")


def build_celery_snapshot() -> dict | None:
    """{celery_task_id: "active"|"reserved"}，10s 缓存；worker 失联返回 None。

    celery 广播回复收集总是等满 timeout 才返回（实测回复约 0.5s 内到达），
    因此 timeout 取 0.5s 即够；失联结果同样缓存，避免 worker 掉线时
    每次请求都白等广播超时。
    """
    cached = cache.get(CELERY_SNAPSHOT_CACHE_KEY)
    if cached == _WORKER_UNREACHABLE:
        return None
    if cached is not None:
        return cached

    snapshot = None
    try:
        from config.celery import app

        inspect = app.control.inspect(timeout=CELERY_INSPECT_TIMEOUT)
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        if not active and not reserved:
            # 广播无响应（worker 失联）
            snapshot = None
        else:
            snapshot = {}
            for tasks in active.values() or []:
                for t in tasks:
                    snapshot[t.get("id")] = "active"
            for tasks in reserved.values() or []:
                for t in tasks:
                    snapshot.setdefault(t.get("id"), "reserved")
    except Exception:
        logger.warning("build_celery_snapshot failed (worker unreachable?)", exc_info=True)
        snapshot = None

    cache.set(
        CELERY_SNAPSHOT_CACHE_KEY,
        snapshot if snapshot is not None else _WORKER_UNREACHABLE,
        CELERY_SNAPSHOT_TTL,
    )
    return snapshot


def list_tasks(*, status: str = "all", kind: str = "all", task_type: str = "",
               page: int = 1, page_size: int = 20) -> dict:
    """两表合并统一列表。status: all/running/pending；kind: all/generation/async。

    分页在 SQL 层完成：合并结果按 created_at 倒序，前 N 条必然来自各表的前 N 条，
    因此每表只取 page*page_size 条 + count() 汇总即可，不再全表拉取。
    """
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask

    now = timezone.now()
    cutoff = now - timedelta(days=30)
    limit = page * page_size

    rows: list[dict] = []
    total = 0

    # ---- GenerationTask ----
    if kind in ("all", "generation"):
        gt_qs = GenerationTask.objects.filter(created_at__gte=cutoff)
        if status == "running":
            gt_qs = gt_qs.filter(status=GenerationTaskStatus.RUNNING)
        elif status == "pending":
            gt_qs = gt_qs.filter(
                status__in=[
                    GenerationTaskStatus.PENDING,
                    GenerationTaskStatus.CANCEL_REQUESTED,
                    GenerationTaskStatus.PAUSE_REQUESTED,
                    GenerationTaskStatus.PAUSED,
                ]
            )
        if task_type:
            gt_qs = gt_qs.filter(task_type=task_type)
        total += gt_qs.count()

        gt_qs = gt_qs.order_by("-created_at").values(
            "id", "task_type", "status", "outline_id", "outline__name",
            "total_count", "success_count", "failed_count", "skipped_count",
            "current_section_title", "error_message", "celery_task_id",
            "created_by_id", "created_by__username", "created_by__real_name",
            "created_at", "updated_at", "started_at", "finished_at",
            "force_stopped", "force_stopped_at",
        )[:limit]

        for r in gt_qs:
            total_count = r["total_count"] or 0
            done = (r["success_count"] or 0) + (r["failed_count"] or 0) + (r["skipped_count"] or 0)
            rows.append({
                "id": r["id"],
                "kind": "generation",
                "task_type": r["task_type"],
                "task_type_display": dict(GenerationTaskType.CHOICES).get(r["task_type"], r["task_type"]),
                "status": r["status"],
                "status_display": dict(GenerationTaskStatus.CHOICES).get(r["status"], r["status"]),
                "title": r["current_section_title"] or (r["outline__name"] or ""),
                "progress": round(done / total_count * 100) if total_count else 0,
                "related": {
                    "outline_id": r["outline_id"],
                    "outline_name": r["outline__name"] or "",
                },
                "created_by": {
                    "id": r["created_by_id"],
                    "username": r["created_by__username"] or "",
                    "real_name": r["created_by__real_name"] or "",
                },
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "started_at": r["started_at"],
                "finished_at": r["finished_at"],
                "duration_seconds": _compute_duration_seconds(r["started_at"], r["finished_at"], now),
                "error_message": r["error_message"] or "",
                "celery_task_id": r["celery_task_id"] or "",
                "force_stopped": r["force_stopped"],
                "force_stopped_at": r["force_stopped_at"],
            })

    # ---- AsyncTask ----
    if kind in ("all", "async"):
        from apps.common.models import AsyncTask

        at_qs = AsyncTask.objects.filter(created_at__gte=cutoff)
        if status == "running":
            at_qs = at_qs.filter(status=AsyncTask.STATUS_RUNNING)
        elif status == "pending":
            at_qs = at_qs.filter(status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RETRYING])
        if task_type:
            at_qs = at_qs.filter(task_type=task_type)
        total += at_qs.count()

        at_qs = at_qs.order_by("-created_at").values(
            "id", "task_type", "status", "progress", "current_step",
            "related_object_type", "related_object_id", "error_message",
            "celery_task_id", "created_by_id", "created_by__username",
            "created_by__real_name", "created_at", "updated_at", "started_at", "finished_at",
            "force_stopped", "force_stopped_at",
        )[:limit]
        at_rows = list(at_qs)

        # 关联对象名称（TenderFile/Outline/Section）
        related_names = _load_related_names(
            [(r["related_object_type"], r["related_object_id"]) for r in at_rows]
        )

        for r in at_rows:
            rows.append({
                "id": r["id"],
                "kind": "async",
                "task_type": r["task_type"],
                "task_type_display": r["task_type"],
                "status": r["status"],
                "status_display": dict(AsyncTask.STATUS_CHOICES).get(r["status"], r["status"]),
                "title": r["current_step"] or related_names.get(
                    (r["related_object_type"], r["related_object_id"]), ""
                ) or r["task_type"],
                "progress": r["progress"] or 0,
                "related": {
                    "tender_file_id": int(r["related_object_id"]) if r["related_object_type"] == "TenderFile" and r["related_object_id"] else None,
                    "outline_id": int(r["related_object_id"]) if r["related_object_type"] == "Outline" and r["related_object_id"] else None,
                    "section_id": int(r["related_object_id"]) if r["related_object_type"] == "Section" and r["related_object_id"] else None,
                    "tender_file_name": related_names.get(("TenderFile", r["related_object_id"]), ""),
                    "outline_name": related_names.get(("Outline", r["related_object_id"]), ""),
                },
                "created_by": {
                    "id": r["created_by_id"],
                    "username": r["created_by__username"] or "",
                    "real_name": r["created_by__real_name"] or "",
                },
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "started_at": r["started_at"],
                "finished_at": r["finished_at"],
                "duration_seconds": _compute_duration_seconds(r["started_at"], r["finished_at"], now),
                "error_message": r["error_message"] or "",
                "celery_task_id": r["celery_task_id"] or "",
                "force_stopped": r["force_stopped"],
                "force_stopped_at": r["force_stopped_at"],
            })

    # celery 实时状态增强
    try:
        snapshot = build_celery_snapshot()
    except Exception:
        snapshot = None
    celery_ids = {r["celery_task_id"] for r in rows if r["celery_task_id"]}
    for r in rows:
        r["celery_state"] = snapshot.get(r["celery_task_id"]) if (snapshot and r["celery_task_id"] in celery_ids) else None

    rows.sort(key=lambda r: r["created_at"] or timezone.now(), reverse=True)
    start = (page - 1) * page_size
    return {
        "items": rows[start:start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _compute_duration_seconds(started_at, finished_at, now) -> int | None:
    """执行时长：已完成 = finished_at - started_at；运行中 = now - started_at。"""
    if not started_at:
        return None
    end = finished_at or now
    if end < started_at:
        return None
    return int((end - started_at).total_seconds())


def _load_related_names(related_pairs: list[tuple[str, str]]) -> dict:
    """批量加载 TenderFile/Outline/Section 显示名。"""
    names: dict = {}
    if not related_pairs:
        return names

    tender_ids = {int(rid) for rtype, rid in related_pairs if rtype == "TenderFile" and rid and rid.isdigit()}
    outline_ids = {int(rid) for rtype, rid in related_pairs if rtype == "Outline" and rid and rid.isdigit()}
    section_ids = {int(rid) for rtype, rid in related_pairs if rtype == "Section" and rid and rid.isdigit()}

    if tender_ids:
        from apps.tender.models import TenderFile
        for tid, name in TenderFile.objects.filter(id__in=tender_ids).values_list("id", "original_name"):
            names[("TenderFile", str(tid))] = name or ""
    if outline_ids:
        from apps.outline.models import Outline
        for oid, name in Outline.objects.filter(id__in=outline_ids).values_list("id", "name"):
            names[("Outline", str(oid))] = name or ""
    if section_ids:
        from apps.outline.models import Section
        for sid, title in Section.objects.filter(id__in=section_ids).values_list("id", "title"):
            names[("Section", str(sid))] = title or ""
    return names


def list_recent_force_stopped(*, minutes: int = 30, user=None, limit: int = 20) -> list[dict]:
    """最近被强制结束的任务（全局提示轮询用）。

    queue.manage 权限用户见全部；普通用户仅见自己发起的任务。
    """
    from apps.common.models import AsyncTask
    from apps.outline.constants import GenerationTaskType
    from apps.outline.models import GenerationTask

    cutoff = timezone.now() - timedelta(minutes=minutes)
    rows: list[dict] = []

    # queue.manage 权限用户见全部；普通用户仅见自己发起的任务
    from apps.accounts.services import permission_service

    can_view_all = user is None or permission_service.has_permission(user, "queue.manage")
    gt_qs = GenerationTask.objects.filter(force_stopped_at__gte=cutoff)
    at_qs = AsyncTask.objects.filter(force_stopped_at__gte=cutoff)
    if not can_view_all:
        gt_qs = gt_qs.filter(created_by=user)
        at_qs = at_qs.filter(created_by=user)

    for r in gt_qs.values(
        "id", "task_type", "status", "force_stopped_at", "outline__name",
        "created_by__username", "created_by__real_name",
    ):
        rows.append({
            "id": r["id"],
            "kind": "generation",
            "task_type": r["task_type"],
            "task_type_display": dict(GenerationTaskType.CHOICES).get(r["task_type"], r["task_type"]),
            "title": r["outline__name"] or f"任务 {r['id']}",
            "status": r["status"],
            "force_stopped_at": r["force_stopped_at"],
            "created_by_username": r["created_by__username"] or "",
            "created_by_real_name": r["created_by__real_name"] or "",
        })

    for r in at_qs.values(
        "id", "task_type", "status", "force_stopped_at",
        "created_by__username", "created_by__real_name",
    ):
        rows.append({
            "id": r["id"],
            "kind": "async",
            "task_type": r["task_type"],
            "task_type_display": r["task_type"],
            "title": r["task_type"],
            "status": r["status"],
            "force_stopped_at": r["force_stopped_at"],
            "created_by_username": r["created_by__username"] or "",
            "created_by_real_name": r["created_by__real_name"] or "",
        })

    rows.sort(key=lambda r: r["force_stopped_at"], reverse=True)
    return rows[:limit]
