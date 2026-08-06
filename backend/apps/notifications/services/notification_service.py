"""通知服务：统一入口 + 任务完成消息构造。"""

from apps.notifications.models import Notification

# AsyncTask.task_type 无 choices，此处维护展示名映射；未知值回退原文。
TASK_TYPE_DISPLAY = {
    "outline_generation": "大纲生成",
    "outline_extraction": "大纲提取",
    "section_writing": "章节撰写",
    "section_batch_writing": "批量章节撰写",
    "document_export": "标书导出",
    "document_import": "文档解析",
    "requirement_analysis": "条款分析",
    "batch_requirement_analysis": "批量条款分析",
    "batch_content_generation": "批量内容生成",
    "matrix_generation": "矩阵生成",
    "kb_embedding": "知识库向量化",
}


def display_task_type(task_type: str) -> str:
    return TASK_TYPE_DISPLAY.get(task_type, task_type or "任务")


def notify(
    *,
    user,
    title: str,
    message: str = "",
    kind: str = Notification.KIND_TASK,
    task_type: str = "",
    related_object_type: str = "",
    related_object_id: str = "",
) -> Notification:
    """写一条通知。keyword-only，避免调用点位置参数写错。"""
    return Notification.objects.create(
        user=user,
        kind=kind,
        title=title[:128],
        message=message[:512],
        task_type=task_type[:64],
        related_object_type=related_object_type[:64],
        related_object_id=str(related_object_id)[:64],
    )


def notify_async_task_finished(task) -> Notification | None:
    """AsyncTask 终态通知。终态后不再变化，直接按 (user, type, id) 去重。"""
    from apps.common.models import AsyncTask

    if not task.created_by_id:
        return None

    status_message = {
        AsyncTask.STATUS_SUCCESS: ("任务已完成", f"{display_task_type(task.task_type)} 已执行完成"),
        AsyncTask.STATUS_FAILED: (
            "任务失败",
            f"{display_task_type(task.task_type)} 执行失败：{(task.error_message or '未知错误')[:100]}",
        ),
        AsyncTask.STATUS_CANCELLED: ("任务已取消", f"{display_task_type(task.task_type)} 已取消"),
    }
    if task.status not in status_message:
        return None

    title, message = status_message[task.status]

    return notify(
        user=task.created_by,
        title=title,
        message=message,
        task_type=task.task_type,
        related_object_type="async_task",
        related_object_id=task.pk,
    )


def notify_generation_task_finished(task) -> Notification | None:
    """GenerationTask 终态通知（completed / partial_success / failed / cancelled）。"""
    from apps.outline.constants import GenerationTaskStatus

    if not task.created_by_id:
        return None

    type_display = task.get_task_type_display()

    if task.status == GenerationTaskStatus.COMPLETED:
        title = "生成任务已完成"
        message = f"{type_display}：成功 {task.success_count} 项"
        if task.failed_count:
            message += f"，失败 {task.failed_count} 项"
    elif task.status == GenerationTaskStatus.PARTIAL_SUCCESS:
        title = "生成任务部分完成"
        message = f"{type_display}：成功 {task.success_count} 项，失败 {task.failed_count} 项"
    elif task.status == GenerationTaskStatus.FAILED:
        title = "生成任务失败"
        message = f"{type_display} 执行失败：{(task.error_message or '未知错误')[:100]}"
    elif task.status == GenerationTaskStatus.CANCELLED:
        title = "生成任务已取消"
        message = f"{type_display} 已取消"
    else:
        return None

    return notify(
        user=task.created_by,
        title=title,
        message=message,
        task_type=task.task_type,
        related_object_type="generation_task",
        related_object_id=task.pk,
    )
