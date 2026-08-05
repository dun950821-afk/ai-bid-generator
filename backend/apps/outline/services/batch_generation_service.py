# backend/apps/outline/services/batch_generation_service.py
"""批量正文生成编排服务。

设计原则：
- 不重建逻辑，复用 generate_section_task 的单章生成能力
- 负责调度编排：计算顺序、分批、状态管理、进度更新
- 支持依赖优先、叶子优先、并行控制
- 支持暂停/恢复/取消操作
"""

import logging
from collections import defaultdict
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from apps.outline.constants import (
    ContentGenerationStatus,
    ContentMatrixStatus,
    GenerationTaskStatus,
    GenerationTaskType,
    SectionGenerationStatus,
)
from apps.outline.models import BatchGenerationTaskItem, GenerationTask, Outline, Section

User = get_user_model()
logger = logging.getLogger(__name__)


class BatchGenerationService:
    """批量正文生成编排服务。"""

    def precheck(self, outline_id: int) -> dict:
        """预检查批量生成条件。

        Returns:
            {
                "can_generate": bool,
                "total_sections": int,
                "eligible_sections": int,
                "matrix_ready_sections": int,
                "matrix_missing_sections": int,
                "already_generated": int,
                "warnings": [...],
                "errors": [...],
                "eligible_section_ids": [...],
            }
        """
        outline = Outline.objects.get(pk=outline_id)
        sections = Section.objects.filter(outline=outline).order_by("sort_order")

        eligible_sections = []
        matrix_ready = []
        matrix_missing = []
        already_generated = []
        warnings = []
        errors = []

        for section in sections:
            # 只生成有矩阵的章节（矩阵生成或用户编辑）
            if section.content_matrix_status not in [
                ContentMatrixStatus.GENERATED,
                ContentMatrixStatus.EDITED,
            ]:
                matrix_missing.append(section)
                continue

            matrix_ready.append(section)

            # 检查是否已生成
            if section.content_generation_status == ContentGenerationStatus.SUCCESS:
                already_generated.append(section)
                warnings.append({
                    "type": "already_generated",
                    "section_id": section.id,
                    "section_title": section.title,
                    "message": f"章节 '{section.title}' 已生成正文",
                })
                continue

            eligible_sections.append(section)

        total = sections.count()

        # 错误检查
        if len(matrix_ready) == 0:
            errors.append({
                "type": "no_matrix_ready",
                "message": "没有章节具备可用的内容责任矩阵，请先生成矩阵",
            })

        if total == 0:
            errors.append({
                "type": "no_sections",
                "message": "大纲没有章节",
            })

        return {
            "can_generate": len(eligible_sections) > 0,
            "total_sections": total,
            "eligible_sections": len(eligible_sections),
            "matrix_ready_sections": len(matrix_ready),
            "matrix_missing_sections": len(matrix_missing),
            "already_generated": len(already_generated),
            "warnings": warnings,
            "errors": errors,
            "eligible_section_ids": [s.id for s in eligible_sections],
        }

    def calculate_generation_order(
        self,
        outline_id: int,
        section_ids: list[int] = None,
        include_success: bool = False,
    ) -> list[dict]:
        """计算章节生成顺序。

        规则：
        1. 叶子章节优先（leaf_depth 越大越先）
        2. 同层级按 sort_order 排序
        3. 父章节等待子章节完成后生成

        Args:
            outline_id: 大纲ID
            section_ids: 指定章节ID列表，空则自动选择
            include_success: 是否包含已成功生成的章节

        Returns:
            [
                {"section_id": 1, "leaf_depth": 3, "level": 1, "priority": 1, "batch": 0},
                {"section_id": 2, "leaf_depth": 0, "level": 2, "priority": 2, "batch": 1},
                ...
            ]
        """
        outline = Outline.objects.get(pk=outline_id)

        # 获取目标章节
        if section_ids:
            sections = Section.objects.filter(
                outline=outline,
                id__in=section_ids,
            ).order_by("sort_order")
        else:
            sections = Section.objects.filter(
                outline=outline,
                content_matrix_status__in=[
                    ContentMatrixStatus.GENERATED,
                    ContentMatrixStatus.EDITED,
                ],
            ).order_by("sort_order")

            # 如果不包含已成功的，则排除
            if not include_success:
                sections = sections.exclude(
                    content_generation_status=ContentGenerationStatus.SUCCESS,
                )

        # 计算每个章节的 leaf_depth
        section_map = {s.id: s for s in sections}
        all_sections = Section.objects.filter(outline=outline)

        def get_leaf_depth(section_id: int) -> int:
            """计算叶子深度（到最远叶子的距离）。"""
            children = [s for s in all_sections if s.parent_id == section_id]
            if not children:
                return 0
            return 1 + max(get_leaf_depth(c.id) for c in children)

        leaf_depths = {}
        for section in sections:
            leaf_depths[section.id] = get_leaf_depth(section.id)

        # 构建依赖关系
        dependencies = defaultdict(list)  # section_id -> list of child_ids
        for section in sections:
            if section.parent_id and section.parent_id in section_map:
                dependencies[section.parent_id].append(section.id)

        # 按规则排序
        order_list = []
        for section in sections:
            order_list.append({
                "section_id": section.id,
                "title": section.title,
                "leaf_depth": leaf_depths[section.id],
                "level": section.level,
                "sort_order": section.sort_order,
                "has_children": bool(dependencies[section.id]),
            })

        # 排序：leaf_depth 降序（叶子优先），level 升序，sort_order 升序
        order_list.sort(key=lambda x: (-x["leaf_depth"], x["level"], x["sort_order"]))

        # 分批：叶子章节第一批，父章节等子章节完成后
        # 根据 leaf_depth 和依赖关系计算批次
        batch_assignment = {}
        current_batch = 0

        # 第一批：leaf_depth == 0 的纯叶子
        for item in order_list:
            if item["leaf_depth"] == 0:
                batch_assignment[item["section_id"]] = current_batch

        # 后续批：依赖的子章节都在前批完成后
        remaining = [item for item in order_list if item["section_id"] not in batch_assignment]

        while remaining:
            current_batch += 1
            batch_added = []

            for item in remaining:
                child_ids = dependencies[item["section_id"]]
                # 检查所有子章节是否已分配批次
                children_in_section_ids = [cid for cid in child_ids if cid in section_map]
                if not children_in_section_ids:
                    # 无子章节在目标列表中，可直接生成
                    batch_assignment[item["section_id"]] = current_batch
                    batch_added.append(item)
                elif all(cid in batch_assignment for cid in children_in_section_ids):
                    # 所有子章节已分配
                    batch_assignment[item["section_id"]] = current_batch
                    batch_added.append(item)

            for item in batch_added:
                remaining.remove(item)

            # 防死循环：如果还有未分配的，强制分配到当前批次
            if not batch_added and remaining:
                for item in remaining:
                    batch_assignment[item["section_id"]] = current_batch
                    remaining = []
                break

        # 更新排序结果
        for item in order_list:
            item["batch"] = batch_assignment.get(item["section_id"], 0)

        # 添加优先级（用于显示）
        for idx, item in enumerate(order_list):
            item["priority"] = idx + 1

        return order_list

    @transaction.atomic
    def create_batch_task(
        self,
        outline_id: int,
        created_by,
        section_ids: list[int] = None,
        include_success: bool = False,
        parallel: bool = False,
        max_parallel: int = 3,
        skip_on_failure: bool = True,
        user_prompt_default: str = "",
    ) -> GenerationTask:
        """创建批量生成任务。

        Args:
            outline_id: 大纲ID
            created_by: 创建人
            section_ids: 指定章节ID列表（空则自动选择）
            include_success: 是否包含已成功生成的章节
            parallel: 是否并行执行
            max_parallel: 最大并行数
            skip_on_failure: 失败是否跳过继续
            user_prompt_default: 默认用户提示词

        Returns:
            GenerationTask 实例
        """
        outline = Outline.objects.get(pk=outline_id)

        # 使用 select_for_update 锁定，防止并发创建
        running_task = GenerationTask.objects.select_for_update().filter(
            outline=outline,
            task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
            status__in=[
                GenerationTaskStatus.PENDING,
                GenerationTaskStatus.RUNNING,
                GenerationTaskStatus.PAUSE_REQUESTED,
                GenerationTaskStatus.PAUSED,
            ],
        ).first()

        if running_task:
            raise ValueError(f"大纲已有正在执行的批量生成任务 (ID: {running_task.id})")

        # 计算生成顺序
        order_list = self.calculate_generation_order(outline_id, section_ids, include_success)

        if not order_list:
            raise ValueError("没有需要生成的章节")

        # 创建任务
        task = GenerationTask.objects.create(
            task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
            outline=outline,
            status=GenerationTaskStatus.PENDING,
            total_count=len(order_list),
            created_by=created_by,
            params={
                "section_ids": [item["section_id"] for item in order_list],
                "generation_order": order_list,
                "include_success": include_success,
                "parallel": parallel,
                "max_parallel": max_parallel,
                "skip_on_failure": skip_on_failure,
                "user_prompt_default": user_prompt_default,
            },
        )

        # 创建 BatchGenerationTaskItem 记录（冻结顺序）
        items_to_create = []
        for idx, item in enumerate(order_list):
            items_to_create.append(
                BatchGenerationTaskItem(
                    task=task,
                    section_id=item["section_id"],
                    sort_index=idx,
                    status="pending",
                )
            )
        BatchGenerationTaskItem.objects.bulk_create(items_to_create)

        # 更新章节状态为 pending
        section_ids_list = [item["section_id"] for item in order_list]
        Section.objects.filter(id__in=section_ids_list).update(
            content_generation_status=ContentGenerationStatus.PENDING,
            generation_status=SectionGenerationStatus.PENDING,
        )

        return task

    def start_batch_generation(self, task_id: int) -> None:
        """启动批量生成任务（调用 Celery）。"""
        from apps.outline.tasks import batch_section_generation_task

        with transaction.atomic():
            task = GenerationTask.objects.select_for_update().get(pk=task_id)

            if task.status != GenerationTaskStatus.PENDING:
                raise ValueError(f"任务状态不是待执行: {task.status}")

            # 更新状态
            task.status = GenerationTaskStatus.RUNNING
            task.started_at = timezone.now()
            task.save()

            # 触发 Celery 任务
            async_result = batch_section_generation_task.delay(task_id=task_id)

            # 保存 Celery 任务 ID
            task.celery_task_id = async_result.id
            task.save()

    @transaction.atomic
    def pause_task(self, task_id: int) -> dict:
        """请求暂停任务。

        Returns:
            {"success": bool, "status": str, "message": str}
        """
        task = GenerationTask.objects.select_for_update().get(pk=task_id)

        if task.status != GenerationTaskStatus.RUNNING:
            return {
                "success": False,
                "status": task.status,
                "message": "只有运行中的任务才能暂停",
            }

        task.status = GenerationTaskStatus.PAUSE_REQUESTED
        task.save()

        return {
            "success": True,
            "status": task.status,
            "message": "系统将在当前章节完成后暂停",
        }

    @transaction.atomic
    def resume_task(self, task_id: int) -> dict:
        """恢复暂停的任务。

        Returns:
            {"success": bool, "status": str, "message": str}
        """
        from apps.outline.tasks import batch_section_generation_task

        task = GenerationTask.objects.select_for_update().get(pk=task_id)

        if task.status != GenerationTaskStatus.PAUSED:
            return {
                "success": False,
                "status": task.status,
                "message": "只有已暂停的任务才能恢复",
            }

        # 更新任务状态
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 更新待执行的子项状态
        BatchGenerationTaskItem.objects.filter(
            task=task,
            status="pending",
        ).update(status="pending")

        # 重新触发 Celery 任务
        async_result = batch_section_generation_task.delay(task_id=task_id)
        task.celery_task_id = async_result.id
        task.save()

        return {
            "success": True,
            "status": task.status,
            "message": "任务已恢复执行",
        }

    @transaction.atomic
    def cancel_task(self, task_id: int) -> dict:
        """取消任务。

        - RUNNING -> CANCEL_REQUESTED (等待 Celery 停止)
        - PAUSED -> CANCELLED (直接取消，无 Celery 运行)

        Returns:
            {"success": bool, "status": str, "message": str}
        """
        task = GenerationTask.objects.select_for_update().get(pk=task_id)

        if task.status == GenerationTaskStatus.RUNNING:
            task.status = GenerationTaskStatus.CANCEL_REQUESTED
            task.save()
            return {
                "success": True,
                "status": task.status,
                "message": "系统将停止后续章节生成，当前正在生成的章节可能会继续完成",
            }

        if task.status == GenerationTaskStatus.PAUSED:
            task.status = GenerationTaskStatus.CANCELLED
            task.finished_at = timezone.now()
            task.save()

            # 将所有待执行的子项标记为已取消
            BatchGenerationTaskItem.objects.filter(
                task=task,
                status__in=["pending", "running"],
            ).update(status="cancelled")

            return {
                "success": True,
                "status": task.status,
                "message": "任务已取消",
            }

        if task.status in [GenerationTaskStatus.PENDING, GenerationTaskStatus.PAUSE_REQUESTED]:
            return {
                "success": False,
                "status": task.status,
                "message": "任务状态异常，请稍后重试",
            }

        return {
            "success": False,
            "status": task.status,
            "message": "任务已完成，无法取消",
        }

    @transaction.atomic
    def retry_failed(self, task_id: int) -> dict:
        """重试失败的章节。

        Returns:
            {"success": bool, "retried_count": int, "message": str}
        """
        from apps.outline.tasks import batch_section_generation_task

        task = GenerationTask.objects.select_for_update().get(pk=task_id)

        if task.status not in [
            GenerationTaskStatus.COMPLETED,
            GenerationTaskStatus.FAILED,
            GenerationTaskStatus.PARTIAL_SUCCESS,
        ]:
            return {
                "success": False,
                "retried_count": 0,
                "message": "只有已完成/失败/部分成功的任务才能重试",
            }

        # 查找失败的子项
        failed_items = BatchGenerationTaskItem.objects.filter(
            task=task,
            status="failed",
        )

        if not failed_items.exists():
            return {
                "success": False,
                "retried_count": 0,
                "message": "没有失败的章节需要重试",
            }

        # 重置失败子项状态
        failed_count = failed_items.update(
            status="pending",
            error_message="",
            started_at=None,
            finished_at=None,
        )

        # 更新任务状态
        task.status = GenerationTaskStatus.RUNNING
        task.error_message = ""
        task.save()

        # 重新触发 Celery 任务
        async_result = batch_section_generation_task.delay(task_id=task_id)
        task.celery_task_id = async_result.id
        task.save()

        return {
            "success": True,
            "retried_count": failed_count,
            "message": f"已重试 {failed_count} 个失败章节",
        }

    def get_batch_progress(self, task_id: int) -> dict:
        """获取批量生成进度。

        Returns:
            {
                "task_id": int,
                "status": str,
                "total": int,
                "success": int,
                "failed": int,
                "skipped": int,
                "running": int,
                "pending": int,
                "progress_percent": int,
                "current_section": {...},
                "sections": [...],
                "errors": [...],
                "paused_at_index": int,
            }
        """
        task = GenerationTask.objects.get(pk=task_id)

        # 从 BatchGenerationTaskItem 统计（select_related 避免逐条查询章节，消除 N+1）
        items = BatchGenerationTaskItem.objects.filter(task=task).select_related(
            "section"
        ).order_by("sort_index")

        status_counts = {
            "pending": 0,
            "running": 0,
            "success": 0,
            "failed": 0,
            "skipped": 0,
            "cancelled": 0,
        }

        section_status_list = []
        for item in items:
            status_counts[item.status] = status_counts.get(item.status, 0) + 1
            section_status_list.append({
                "id": item.section.id,
                "title": item.section.title,
                "status": item.status,
                "sort_index": item.sort_index,
                "word_count": item.word_count,
                "error": item.error_message[:200] if item.error_message else "",
                "started_at": item.started_at,
                "finished_at": item.finished_at,
                "retry_count": item.retry_count,
            })

        total = task.total_count
        success = status_counts.get("success", 0)
        failed = status_counts.get("failed", 0)
        skipped = status_counts.get("skipped", 0)
        running = status_counts.get("running", 0)
        pending = status_counts.get("pending", 0)
        cancelled = status_counts.get("cancelled", 0)

        progress_percent = int((success + failed + skipped + cancelled) / total * 100) if total > 0 else 0

        return {
            "task_id": task.id,
            "status": task.status,
            "total": total,
            "success": success,
            "failed": failed,
            "skipped": skipped,
            "running": running,
            "pending": pending,
            "cancelled": cancelled,
            "progress_percent": progress_percent,
            "current_section": {
                "id": task.current_section_id,
                "title": task.current_section_title,
            } if task.current_section_id else None,
            "sections": section_status_list,
            "error_message": task.error_message,
            "started_at": task.created_at,
            "finished_at": task.finished_at,
            "paused_at_index": task.paused_at_index,
        }
