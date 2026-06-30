# backend/apps/outline/services/outline_expand_service.py
"""字数补目录服务（P3 正文增强）。

大纲级字数不达标时，AI 补充二三四级子目录扩展生成空间。
不删现有目录，不自动生成正文。
"""
import logging

from django.db import transaction
from django.db.models import Max

from apps.outline.models import Outline, Section

logger = logging.getLogger(__name__)

MAX_LEVEL = 5


class OutlineExpandService:
    """大纲级字数补目录。"""

    def expand_outline(
        self,
        outline_id: int,
        target_total_words: int,
        user,
        async_task=None,
    ) -> dict:
        """AI 补二三四级子目录扩展生成空间。

        Returns:
            {"added": [{...}], "new_total_estimated": N, "skipped": bool}
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        outline = Outline.objects.get(pk=outline_id)
        current_word_stats = self._build_word_stats(outline)
        outline_structure = self._build_outline_structure(outline)
        project_overview = self._build_project_overview(outline)
        requirement_groups = self._format_requirement_groups(outline.requirement_groups)
        current_total = self._estimate_total(outline)

        variables = {
            "project_overview": project_overview,
            "outline_structure": outline_structure,
            "current_word_stats": current_word_stats,
            "target_total_words": int(target_total_words),
            "requirement_groups": requirement_groups,
        }

        if async_task:
            async_task.progress = 20
            async_task.current_step = "AI 生成新增子目录"
            async_task.save(update_fields=["progress", "current_step"])

        prompt_run = AiTaskExecutionService().execute(
            scenario="outline_expand",
            variables=variables,
            created_by=user,
            business_context={"project_id": outline.project_id},
        )

        if prompt_run.status != "succeeded":
            logger.warning(f"outline_expand failed for outline {outline_id}: {prompt_run.error_message}")
            return {"added": [], "new_total_estimated": current_total, "skipped": True, "reason": "AI 失败"}

        added_sections = (prompt_run.output_json or {}).get("added_sections") or []
        if not added_sections:
            return {
                "added": [],
                "new_total_estimated": self._estimate_total(outline),
                "skipped": True,
                "reason": "AI 返回空，无需补充",
            }

        # 收集所有 parent_section_id 对应的 Section（含 level），减少查询
        parent_ids = {item.get("parent_section_id") for item in added_sections if item.get("parent_section_id")}
        parent_map = {
            s.id: s
            for s in Section.objects.filter(outline_id=outline_id, id__in=parent_ids)
        }

        if async_task:
            async_task.progress = 60
            async_task.current_step = f"创建 {len(added_sections)} 个子目录"
            async_task.save(update_fields=["progress", "current_step"])

        added_records = []
        created_count = 0
        skipped_count = 0

        with transaction.atomic():
            for item in added_sections:
                parent_id = item.get("parent_section_id")
                title = (item.get("title") or "").strip()
                if not parent_id or not title:
                    skipped_count += 1
                    continue

                parent = parent_map.get(parent_id)
                if not parent:
                    skipped_count += 1
                    continue

                new_level = (parent.level or 1) + 1
                if new_level > MAX_LEVEL:
                    skipped_count += 1
                    continue

                # sort_order 排在 parent 现有 children 末尾
                max_sort = (
                    Section.objects.filter(parent=parent)
                    .aggregate(max_sort=Max("sort_order"))["max_sort"]
                )
                new_sort = (max_sort if max_sort is not None else -1) + 1

                write_scope = (item.get("write_scope") or "").strip()

                section = Section.objects.create(
                    outline=outline,
                    parent=parent,
                    title=title,
                    level=new_level,
                    sort_order=new_sort,
                    content_matrix={"write_scope": write_scope} if write_scope else {},
                )
                created_count += 1
                added_records.append({
                    "section_id": section.id,
                    "parent_section_id": parent.id,
                    "title": section.title,
                    "level": section.level,
                    "write_scope": write_scope,
                })

        if async_task:
            async_task.progress = 100
            async_task.current_step = "完成"
            async_task.save(update_fields=["progress", "current_step"])

        return {
            "added": added_records,
            "created_count": created_count,
            "skipped_count": skipped_count,
            "new_total_estimated": self._estimate_total(outline),
        }

    def _build_word_stats(self, outline: Outline) -> str:
        """构建当前字数统计文本。"""
        total = self._estimate_total(outline)
        section_count = Section.objects.filter(outline=outline).count()
        return f"当前总字数：{total}\n章节数：{section_count}"

    def _build_outline_structure(self, outline: Outline) -> str:
        """构建目录结构文本。"""
        sections = Section.objects.filter(outline=outline).order_by("sort_order")
        lines = []
        for s in sections:
            indent = "  " * (s.level - 1)
            lines.append(f"{indent}- [id={s.id}] {s.title} (level={s.level})")
        return "\n".join(lines)

    def _build_project_overview(self, outline: Outline) -> str:
        """构建项目概述。"""
        project = outline.project
        lot_name = outline.lot.name if outline.lot else ""
        return f"项目名称：{project.name}\n标段：{lot_name}"

    def _format_requirement_groups(self, groups: list) -> str:
        """格式化评分大类。"""
        if not groups:
            return "无评分大类信息"
        lines = []
        for idx, g in enumerate(groups, start=1):
            title = g.get("title") if isinstance(g, dict) else str(g)
            lines.append(f"{idx}. {title}")
        return "\n".join(lines)

    def _estimate_total(self, outline: Outline) -> int:
        """估算当前总字数。"""
        from django.db.models import Sum
        agg = Section.objects.filter(outline=outline).aggregate(total=Sum("content_word_count"))
        return agg["total"] or 0
