# backend/apps/outline/services/section_expand_service.py
"""字数不足扩写服务（借鉴 OpenBidKit expandOneSection + applyContentExpansionPatch）。

批量生成完成后统一检查字数不足的章节，逐章调 section_expand scenario 返回局部 patch，
应用 insert/replace 操作，多轮直到达标或 MAX_EXPAND_ROUNDS。
"""
import logging
import re
from typing import Optional

from django.conf import settings
from django.utils import timezone
from django.db.models import Max

from apps.outline.models import Outline, Section, SectionVersion
from apps.outline.constants import SectionVersionSource

logger = logging.getLogger(__name__)


class SectionExpandService:
    """字数不足扩写服务。"""

    def run_expand(
        self,
        outline_id: int,
        minimum_words: int,
        user,
        async_task=None,
    ) -> dict:
        """统计字数不足章节，逐章扩写，多轮直到达标或 MAX_EXPAND_ROUNDS。

        Returns:
            {"total": N, "expanded": M, "skipped": K, "rounds": R, "details": [...]}
        """
        minimum_words = minimum_words or getattr(settings, "MIN_SECTION_WORDS", 500)
        max_rounds = getattr(settings, "MAX_EXPAND_ROUNDS", 2)

        short_sections = list(
            Section.objects.filter(
                outline_id=outline_id,
                content_word_count__lt=minimum_words,
                content_word_count__gt=0,
            ).order_by("sort_order")
        )

        if not short_sections:
            return {"total": 0, "expanded": 0, "skipped": 0, "rounds": 0, "details": []}

        total = len(short_sections)
        expanded = 0
        details = []
        rounds_done = 0

        for round_idx in range(1, max_rounds + 1):
            rounds_done = round_idx
            still_short = []

            for section in short_sections:
                section.refresh_from_db()
                if section.content_word_count >= minimum_words:
                    continue

                try:
                    result = self.expand_section(section.id, user, minimum_words=minimum_words)
                    if result.get("expanded"):
                        expanded += 1
                        details.append({
                            "section_id": section.id,
                            "before": result["before_words"],
                            "after": result["after_words"],
                            "round": round_idx,
                        })
                    section.refresh_from_db()
                    if section.content_word_count < minimum_words:
                        still_short.append(section)
                except Exception as e:
                    logger.warning(f"Expand section {section.id} failed (round {round_idx}): {e}")
                    still_short.append(section)

            if not still_short:
                break
            short_sections = still_short

            if async_task:
                async_task.progress = min(90, 10 + round_idx * 30)
                async_task.current_step = f"扩写第 {round_idx}/{max_rounds} 轮"
                async_task.save(update_fields=["progress", "current_step"])

        return {
            "total": total,
            "expanded": expanded,
            "skipped": total - expanded,
            "rounds": rounds_done,
            "details": details,
        }

    def expand_section(self, section_id: int, user, minimum_words: int = None) -> dict:
        """单章扩写：调 AI 返回 patch，应用 insert/replace。

        Returns:
            {"expanded": bool, "before_words": N, "after_words": M, "operation": "..."}
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        minimum_words = minimum_words or getattr(settings, "MIN_SECTION_WORDS", 500)

        section = Section.objects.get(pk=section_id)
        before_words = section.content_word_count or 0

        if before_words >= minimum_words:
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "skip"}

        variables = self._build_expand_variables(section, before_words, minimum_words)

        prompt_run = AiTaskExecutionService().execute(
            scenario="section_expand",
            variables=variables,
            created_by=user,
            business_context={"project_id": section.outline.project_id},
        )

        if prompt_run.status != "succeeded":
            logger.warning(f"section_expand failed for section {section_id}: {prompt_run.error_message}")
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "failed"}

        patch = prompt_run.output_json or {}
        if not patch.get("operation") or not patch.get("content"):
            logger.warning(f"section_expand returned invalid patch for section {section_id}: {patch}")
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "invalid"}

        new_content = self._apply_patch(section.content or "", patch)
        after_words = self._count_words(new_content)

        section.content = new_content
        section.content_word_count = after_words
        section.word_count = after_words
        section.save(update_fields=["content", "content_word_count", "word_count", "updated_at"])

        max_version = (
            SectionVersion.objects.filter(section=section)
            .aggregate(max_version=Max("version_no"))["max_version"]
            or 0
        )
        SectionVersion.objects.create(
            section=section,
            content=new_content,
            version_no=max_version + 1,
            source=SectionVersionSource.AI,
            word_count=after_words,
            created_by=user,
        )

        return {
            "expanded": True,
            "before_words": before_words,
            "after_words": after_words,
            "operation": patch["operation"],
        }

    def _apply_patch(self, content: str, patch: dict) -> str:
        """应用 insert/replace 局部操作（移植 OpenBidKit applyContentExpansionPatch）。

        - insert anchor=end: 追加到末尾
        - insert anchor=段落摘录: 在该段落后插入
        - replace anchor=段落摘录: 替换该段落
        """
        operation = patch.get("operation")
        anchor = (patch.get("anchor") or "").strip()
        patch_content = (patch.get("content") or "").strip()

        if not patch_content:
            return content

        if operation == "insert":
            if not anchor or anchor.lower() == "end":
                if not content:
                    return patch_content
                return content.rstrip() + "\n\n" + patch_content
            if anchor in content:
                idx = content.index(anchor) + len(anchor)
                return content[:idx] + "\n\n" + patch_content + content[idx:]
            return content.rstrip() + "\n\n" + patch_content

        if operation == "replace":
            if not anchor:
                return content
            if anchor in content:
                return content.replace(anchor, patch_content, 1)
            logger.warning(f"replace anchor not found in content, skip: {anchor[:50]}")
            return content

        return content

    def _build_expand_variables(self, section: Section, current_words: int, minimum_words: int) -> dict:
        """构建扩写 prompt 变量。"""
        from apps.outline.services.section_generation_service import SectionGenerationService

        target_words = max(current_words * 2, current_words + 200, minimum_words)

        try:
            selected_facts = SectionGenerationService().resolve_selected_facts(section)
        except Exception:
            selected_facts = ""

        path_parts = []
        node = section
        while node:
            path_parts.insert(0, node.title)
            node = node.parent
        chapter_path = " > ".join(path_parts)

        siblings_qs = Section.objects.filter(
            outline=section.outline, parent=section.parent, level=section.level
        ).exclude(pk=section.pk).order_by("sort_order")[:5]
        sibling_lines = [f"- {s.title}" for s in siblings_qs]
        sibling_chapters = "\n".join(sibling_lines) if sibling_lines else "无"

        project = section.outline.project
        project_overview = f"项目名称：{project.name}\n标段：{section.outline.lot.name if section.outline.lot else ''}"

        outline_structure = self._build_outline_structure(section.outline)

        return {
            "project_overview": project_overview,
            "outline_structure": outline_structure,
            "selected_facts": selected_facts or "无",
            "chapter_path": chapter_path,
            "chapter_description": section.content_matrix.get("write_scope", "") if section.content_matrix else "",
            "sibling_chapters": sibling_chapters,
            "current_content": section.content or "",
            "current_words": current_words,
            "target_words": target_words,
        }

    def _build_outline_structure(self, outline: Outline) -> str:
        """构建简化目录结构文本。"""
        sections = Section.objects.filter(outline=outline).order_by("sort_order")
        lines = []
        for s in sections:
            indent = "  " * (s.level - 1)
            lines.append(f"{indent}- {s.title}")
        return "\n".join(lines)

    def _count_words(self, text: str) -> int:
        """统计字数（中文按字符，英文按单词）。"""
        if not text:
            return 0
        clean = re.sub(r"[#*`\-|>]", "", text)
        clean = re.sub(r"\s+", "", clean)
        return len(clean)
