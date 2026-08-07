"""通知服务：统一入口 + 任务完成消息构造。"""

from apps.notifications.models import Notification

# AsyncTask.task_type 无 choices，此处维护展示名映射；未知值回退原文。
TASK_TYPE_DISPLAY = {
    # 文件解析
    "tender_parse": "文件解析",
    "tender_merge_parse": "文件合并解析",
    "requirement_extraction": "条款抽取",
    "requirement_extraction_v2": "条款抽取",
    "requirement_dedup": "条款去重",
    # 大纲
    "outline_generation": "大纲生成",
    "outline_generate": "大纲生成",
    "outline_extraction": "大纲提取",
    "outline_expand": "大纲扩展",
    "refine_outline": "大纲润色",
    "table_cleanup_outline": "大纲表格清理",
    # 章节
    "section_writing": "章节撰写",
    "section_batch_writing": "批量章节撰写",
    "section_generate": "章节生成",
    "section_batch_generation": "批量章节生成",
    "batch_section_generation": "批量章节生成",
    "section_expand": "章节扩写",
    # 检查 / 修复
    "consistency_audit": "一致性审查",
    "consistency_repair": "一致性修复",
    "bid_check": "废标检查",
    "global_fact_extract": "全局事实提取",
    "table_cleanup": "表格清理",
    # 导出
    "export": "标书导出",
    "document_export": "标书导出",
    "document_import": "文档解析",
    # 其他
    "requirement_analysis": "条款分析",
    "batch_requirement_analysis": "批量条款分析",
    "batch_content_generation": "批量内容生成",
    "matrix_generation": "矩阵生成",
    "kb_embedding": "知识库向量化",
    "image_generation": "图片生成",
    "mermaid_illustration": "插图生成",
    "knowledge.process_document": "文档向量化",
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


def _related_object_name(task) -> str:
    """解析任务关联对象名称，消息更具体（如「招标文件.docx」文件解析完成）。"""
    rt, rid = task.related_object_type, task.related_object_id
    if not rt or not rid:
        return ""
    try:
        if rt == "TenderFile":
            from apps.tender.models import TenderFile

            name = TenderFile.objects.filter(pk=rid).values_list("original_name", flat=True).first()
        elif rt in ("lot", "Lot"):
            from apps.projects.models import Lot

            name = Lot.objects.filter(pk=rid).values_list("name", flat=True).first()
        elif rt == "Outline":
            from apps.outline.models import Outline

            name = Outline.objects.filter(pk=rid).values_list("name", flat=True).first()
        elif rt == "Section":
            from apps.outline.models import Section

            name = Section.objects.filter(pk=rid).values_list("title", flat=True).first()
        elif rt == "BidCheckTask":
            from apps.bid_check.models.bid_check_task import BidCheckTask

            name = BidCheckTask.objects.filter(pk=rid).values_list("outline__name", flat=True).first()
        elif rt == "knowledge.KnowledgeDocument":
            from apps.knowledge.models import KnowledgeDocument

            name = KnowledgeDocument.objects.filter(pk=rid).values_list("file_name", flat=True).first()
        else:
            return ""
    except Exception:
        return ""
    return (name or "")[:60]


def notify_async_task_finished(task) -> Notification | None:
    """AsyncTask 终态通知。终态后不再变化，直接按 (user, type, id) 去重。"""
    from apps.common.models import AsyncTask

    if not task.created_by_id:
        return None

    obj_name = _related_object_name(task)
    prefix = f"「{obj_name}」" if obj_name else ""
    type_display = display_task_type(task.task_type)
    status_message = {
        AsyncTask.STATUS_SUCCESS: ("任务已完成", f"{prefix}{type_display}完成"),
        AsyncTask.STATUS_FAILED: (
            "任务失败",
            f"{prefix}{type_display}执行失败：{(task.error_message or '未知错误')[:100]}",
        ),
        AsyncTask.STATUS_CANCELLED: ("任务已取消", f"{prefix}{type_display}已取消"),
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
