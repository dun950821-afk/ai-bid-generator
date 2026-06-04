# backend/apps/outline/services/matrix_service.py
"""内容责任矩阵生成服务。"""

import json
import logging
from typing import Optional

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.outline.constants import (
    ContentMatrixStatus,
    GenerationTaskStatus,
    GenerationTaskType,
)
from apps.outline.models import GenerationTask, Outline, Section

logger = logging.getLogger(__name__)

MATRIX_LOCK_TIMEOUT = 1800  # 30分钟


class MatrixService:
    """内容责任矩阵生成服务。"""

    def get_matrix_generation_targets(
        self,
        outline_id: int,
        force_overwrite: bool = False,
        section_ids: Optional[list[int]] = None,
    ) -> list[Section]:
        """获取本次需要生成矩阵的章节。

        Args:
            outline_id: 大纲ID
            force_overwrite: 是否强制覆盖 edited 状态
            section_ids: 指定生成的章节ID列表

        Returns:
            需要生成矩阵的章节列表
        """
        sections = Section.objects.filter(outline_id=outline_id)

        if section_ids:
            sections = sections.filter(id__in=section_ids)

        if force_overwrite:
            return list(sections)

        # 默认保留 edited 状态的章节
        return list(
            sections.filter(
                content_matrix_status__in=[
                    ContentMatrixStatus.PENDING,
                    ContentMatrixStatus.FAILED,
                    ContentMatrixStatus.GENERATED,
                ]
            )
        )

    def acquire_matrix_generation_lock(self, outline_id: int) -> bool:
        """获取矩阵生成锁。"""
        cache_key = f"matrix_gen_lock:{outline_id}"
        return cache.add(cache_key, "1", timeout=MATRIX_LOCK_TIMEOUT)

    def release_matrix_generation_lock(self, outline_id: int) -> None:
        """释放矩阵生成锁。"""
        cache_key = f"matrix_gen_lock:{outline_id}"
        cache.delete(cache_key)

    def can_start_matrix_generation(self, outline_id: int) -> tuple[bool, str]:
        """检查是否可以启动新的矩阵生成任务。"""
        generating_count = Section.objects.filter(
            outline_id=outline_id,
            content_matrix_status=ContentMatrixStatus.GENERATING,
        ).count()

        if generating_count > 0:
            return False, "矩阵正在生成中，请稍后再试"
        return True, ""

    def start_matrix_generation(
        self,
        outline_id: int,
        user,
        section_ids: Optional[list[int]] = None,
        force_overwrite: bool = False,
    ) -> GenerationTask:
        """启动矩阵生成任务。

        Args:
            outline_id: 大纲ID
            user: 发起用户
            section_ids: 指定生成的章节ID列表
            force_overwrite: 是否强制覆盖 edited 状态

        Returns:
            创建的 GenerationTask 实例
        """
        # 检查是否可以启动
        can_start, message = self.can_start_matrix_generation(outline_id)
        if not can_start:
            raise ValueError(message)

        # 获取目标章节
        targets = self.get_matrix_generation_targets(
            outline_id=outline_id,
            force_overwrite=force_overwrite,
            section_ids=section_ids,
        )

        if not targets:
            raise ValueError("没有需要生成矩阵的章节")

        # 创建任务
        task = GenerationTask.objects.create(
            task_type=GenerationTaskType.MATRIX_GENERATION,
            outline_id=outline_id,
            status=GenerationTaskStatus.PENDING,
            total_count=len(targets),
            created_by=user,
            params={
                "section_ids": section_ids,
                "force_overwrite": force_overwrite,
            },
        )

        # 启动 Celery 任务
        from apps.outline.tasks import generate_content_matrix_task

        generate_content_matrix_task.delay(
            outline_id=outline_id,
            task_id=task.id,
        )

        return task

    def get_matrix_status(self, outline_id: int) -> dict:
        """获取大纲的矩阵整体状态。"""
        from django.db.models import Count

        status_counts = dict(
            Section.objects.filter(outline_id=outline_id)
            .values("content_matrix_status")
            .annotate(count=Count("id"))
            .values_list("content_matrix_status", "count")
        )

        total = sum(status_counts.values())
        is_generating = status_counts.get(ContentMatrixStatus.GENERATING, 0) > 0

        # 获取当前运行中的任务
        current_task = None
        if is_generating:
            task = GenerationTask.objects.filter(
                outline_id=outline_id,
                task_type=GenerationTaskType.MATRIX_GENERATION,
                status=GenerationTaskStatus.RUNNING,
            ).first()
            if task:
                current_task = task.id

        return {
            "total": total,
            "pending": status_counts.get(ContentMatrixStatus.PENDING, 0),
            "generating": status_counts.get(ContentMatrixStatus.GENERATING, 0),
            "generated": status_counts.get(ContentMatrixStatus.GENERATED, 0),
            "edited": status_counts.get(ContentMatrixStatus.EDITED, 0),
            "failed": status_counts.get(ContentMatrixStatus.FAILED, 0),
            "is_generating": is_generating,
            "current_task_id": current_task,
        }

    def update_section_matrix(
        self,
        section: Section,
        matrix_data: dict,
        is_user_edit: bool = False,
    ) -> Section:
        """写入矩阵数据，统一处理版本和时间更新。

        Args:
            section: 章节实例
            matrix_data: 矩阵数据
            is_user_edit: 是否为用户编辑

        Returns:
            更新后的章节实例
        """
        section.content_matrix = matrix_data
        section.content_matrix_version += 1
        section.content_matrix_updated_at = timezone.now()

        if is_user_edit:
            section.content_matrix_status = ContentMatrixStatus.EDITED
        else:
            section.content_matrix_status = ContentMatrixStatus.GENERATED

        section.content_matrix_error = ""
        section.save(
            update_fields=[
                "content_matrix",
                "content_matrix_version",
                "content_matrix_updated_at",
                "content_matrix_status",
                "content_matrix_error",
            ]
        )
        return section

    def build_outline_structure(self, outline: Outline) -> str:
        """构建大纲结构文本，用于 AI 提示词。"""
        sections = Section.objects.filter(outline=outline).order_by("sort_order", "id")

        lines = []
        for section in sections:
            indent = "  " * (section.level - 1)
            lines.append(
                f"{indent}[ID:{section.id}] {section.section_number} {section.title}"
            )

        return "\n".join(lines)

    def validate_matrix_output(
        self,
        output_data: dict,
        outline_id: int,
    ) -> tuple[dict, list[str]]:
        """校验 AI 输出的矩阵数据。

        Args:
            output_data: AI 输出的 JSON 数据
            outline_id: 大纲ID

        Returns:
            (校验后的数据, 警告列表)
        """
        warnings = []

        # 校验 sections 是否为数组
        sections = output_data.get("sections", [])
        if not isinstance(sections, list):
            raise ValueError("AI 输出缺少 sections 数组")

        # 获取大纲所有章节 ID
        valid_section_ids = set(
            Section.objects.filter(outline_id=outline_id).values_list("id", flat=True)
        )

        # 收集有效的章节
        valid_sections = []
        returned_ids = set()

        for section_data in sections:
            section_id = section_data.get("section_id")
            if not section_id:
                warnings.append("发现缺少 section_id 的章节，已跳过")
                continue

            if section_id not in valid_section_ids:
                warnings.append(f"章节 ID {section_id} 不属于当前大纲，已跳过")
                continue

            # 校验必填字段
            if not section_data.get("write_scope"):
                warnings.append(f"章节 {section_id} 缺少 write_scope，标记为失败")
                continue

            returned_ids.add(section_id)
            valid_sections.append(section_data)

        # 检查遗漏的章节
        missing_ids = valid_section_ids - returned_ids
        if missing_ids:
            warnings.append(f"缺少章节: {missing_ids}")

        return {"sections": valid_sections}, warnings

    def enrich_section_references(
        self,
        section_data: dict,
        outline_id: int,
    ) -> dict:
        """补全章节引用信息（ID 数组转对象数组）。

        Args:
            section_data: AI 输出的章节数据
            outline_id: 大纲ID

        Returns:
            补全后的章节数据
        """
        result = section_data.copy()

        # 获取所有引用章节 ID
        ref_field_names = [
            "reference_sections",
            "no_duplicate_sections",
            "dependency_sections",
        ]

        for field_name in ref_field_names:
            ids = section_data.get(field_name, [])
            if not ids:
                result[field_name] = []
                continue

            # ID 转对象数组
            sections = Section.objects.filter(id__in=ids, outline_id=outline_id)
            section_map = {s.id: s for s in sections}

            enriched = []
            for sid in ids:
                if sid in section_map:
                    s = section_map[sid]
                    enriched.append({
                        "id": s.id,
                        "section_number": s.section_number,
                        "title": s.title,
                    })

            result[field_name] = enriched

        # 处理 related_requirements（保持 ID 数组）
        if "related_requirements" not in result:
            result["related_requirements"] = []

        return result
