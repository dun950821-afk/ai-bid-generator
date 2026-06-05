# backend/apps/outline/services/batch_generation_service.py
"""批量正文生成编排服务。

设计原则：
- 不重建逻辑，复用 generate_section_task 的单章生成能力
- 负责调度编排：计算顺序、分批、状态管理、进度更新
- 支持依赖优先、叶子优先、并行控制
"""

import logging
from collections import defaultdict
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models, transaction

from apps.outline.constants import (
    ContentGenerationStatus,
    ContentMatrixStatus,
    GenerationTaskStatus,
    GenerationTaskType,
    SectionGenerationStatus,
)
from apps.outline.models import GenerationTask, Outline, Section

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
        if matrix_ready_count := len(matrix_ready) == 0:
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

    def calculate_generation_order(self, outline_id: int, section_ids: list[int] = None) -> list[dict]:
        """计算章节生成顺序。

        规则：
        1. 叶子章节优先（leaf_depth 越大越先）
        2. 同层级按 sort_order 排序
        3. 父章节等待子章节完成后生成

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
            ).exclude(
                content_generation_status=ContentGenerationStatus.SUCCESS,
            ).order_by("sort_order")

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

        # 检查是否有正在运行的任务
        running_task = GenerationTask.objects.filter(
            outline=outline,
            task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
            status__in=[GenerationTaskStatus.PENDING, GenerationTaskStatus.RUNNING],
        ).first()

        if running_task:
            raise ValueError(f"大纲已有正在执行的批量生成任务 (ID: {running_task.id})")

        # 计算生成顺序
        order_list = self.calculate_generation_order(outline_id, section_ids)

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

        task = GenerationTask.objects.get(pk=task_id)

        if task.status != GenerationTaskStatus.PENDING:
            raise ValueError(f"任务状态不是待执行: {task.status}")

        # 更新状态
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 触发 Celery 任务
        async_result = batch_section_generation_task.delay(task_id=task_id)

        # 保存 Celery 任务 ID
        task.celery_task_id = async_result.id
        task.save()

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
            }
        """
        task = GenerationTask.objects.get(pk=task_id)
        outline = task.outline

        # 统计各状态
        section_ids = task.params.get("section_ids", [])
        sections = Section.objects.filter(id__in=section_ids)

        status_counts = {
            ContentGenerationStatus.PENDING: 0,
            ContentGenerationStatus.RUNNING: 0,
            ContentGenerationStatus.SUCCESS: 0,
            ContentGenerationStatus.FAILED: 0,
            ContentGenerationStatus.SKIPPED: 0,
        }

        section_status_list = []
        for section in sections:
            status_counts[section.content_generation_status] = status_counts.get(
                section.content_generation_status, 0
            ) + 1
            section_status_list.append({
                "id": section.id,
                "title": section.title,
                "status": section.content_generation_status,
                "word_count": section.content_word_count,
                "error": section.content_generation_error[:200] if section.content_generation_error else "",
            })

        total = task.total_count
        success = status_counts.get(ContentGenerationStatus.SUCCESS, 0)
        failed = status_counts.get(ContentGenerationStatus.FAILED, 0)
        skipped = status_counts.get(ContentGenerationStatus.SKIPPED, 0)
        running = status_counts.get(ContentGenerationStatus.RUNNING, 0)
        pending = status_counts.get(ContentGenerationStatus.PENDING, 0)

        progress_percent = int((success + failed + skipped) / total * 100) if total > 0 else 0

        return {
            "task_id": task.id,
            "status": task.status,
            "total": total,
            "success": success,
            "failed": failed,
            "skipped": skipped,
            "running": running,
            "pending": pending,
            "progress_percent": progress_percent,
            "current_section": {
                "id": task.current_section_id,
                "title": task.current_section_title,
            } if task.current_section_id else None,
            "sections": section_status_list,
            "error_message": task.error_message,
            "started_at": task.created_at,
            "finished_at": task.finished_at,
        }

    def cancel_task(self, task_id: int) -> dict:
        """请求取消任务。

        Returns:
            {"success": bool, "status": str, "message": str}
        """
        task = GenerationTask.objects.get(pk=task_id)

        if task.status not in [GenerationTaskStatus.PENDING, GenerationTaskStatus.RUNNING]:
            return {
                "success": False,
                "status": task.status,
                "message": "任务已完成，无法取消",
            }

        task.status = GenerationTaskStatus.CANCEL_REQUESTED
        task.save()

        return {
            "success": True,
            "status": task.status,
            "message": "系统将停止后续章节生成，当前正在生成的章节可能会继续完成",
        }