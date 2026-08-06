# backend/apps/outline/services/section_expand_service.py
"""字数不足扩写服务（借鉴 OpenBidKit expandOneSection + applyContentExpansionPatch）。

批量生成完成后统一检查字数不足的章节，逐章调 section_expand scenario 返回 patches 数组，
逐个应用 insert/replace/delete 操作（锚点须唯一），多轮直到达标或 MAX_EXPAND_ROUNDS。
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

            round_total = len(short_sections)
            for idx, section in enumerate(short_sections):
                # 逐章更新进度：一轮是几十个章节串行调 AI，可能耗时十几分钟，
                # 只按轮更新会让进度条长时间停在 5%，用户误以为任务卡死
                if async_task:
                    base = 10 + round_idx * 30
                    prev = base - 30 if round_idx > 1 else 5
                    async_task.progress = min(90, prev + int((idx + 1) / round_total * 25))
                    async_task.current_step = (
                        f"扩写第 {round_idx}/{max_rounds} 轮：章节 {idx + 1}/{round_total}"
                        f"（{(section.title or '')[:20]}）"
                    )
                    async_task.save(update_fields=["progress", "current_step"])

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

        return {
            "total": total,
            "expanded": expanded,
            "skipped": total - expanded,
            "rounds": rounds_done,
            "details": details,
        }

    def expand_section(self, section_id: int, user, minimum_words: int = None) -> dict:
        """单章扩写：调 AI 返回 patches 数组，逐个应用 insert/replace/delete。

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

        output = prompt_run.output_json or {}
        patches = output.get("patches")
        if not patches and output.get("operation"):
            # 兼容旧版单操作输出（{operation, anchor, content}）
            patches = [output]
        if not patches:
            logger.warning(f"section_expand returned invalid patches for section {section_id}: {output}")
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "invalid"}

        new_content, applied_ops = self._apply_patches(section.content or "", patches)
        if not applied_ops:
            # 所有 patch 锚点校验失败：本章记为未扩写，继续下一章
            logger.warning(f"section_expand 所有 patch 应用失败，章节 {section_id} 本轮跳过")
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "failed"}
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
            "operation": ",".join(applied_ops),
        }

    def _apply_patches(self, content: str, patches: list[dict]) -> tuple[str, list[str]]:
        """逐个应用 patch，应用前校验锚点在正文中存在且唯一，不满足则丢弃该 patch 并 log。

        Returns:
            (new_content, applied_ops)：applied_ops 为成功应用的 operation 列表
        """
        applied_ops: list[str] = []
        new_content = content
        for idx, patch in enumerate(patches):
            new_content, error = self._apply_single_patch(new_content, patch)
            if error:
                logger.warning(f"expand patch[{idx}] 丢弃：{error}")
                continue
            applied_ops.append(patch.get("operation", ""))
        return new_content, applied_ops

    def _apply_patch(self, content: str, patch: dict) -> str:
        """应用单个 patch（保留旧接口），校验失败时返回原文。"""
        new_content, _ = self._apply_single_patch(content, patch)
        return new_content

    def _apply_single_patch(self, content: str, patch: dict) -> tuple[str, Optional[str]]:
        """应用单个 insert/replace/delete 局部操作。

        锚点语义：
        - insert：anchor=start/end 定位文首/文末，否则 anchor 逐字段落定位，在其后插入
        - replace：old_text（缺省回退 anchor）逐字匹配正文唯一原文块，替换为 content
        - delete：old_text 逐字匹配正文唯一原文块，删除该块

        Returns:
            (new_content, error)：error 非空表示该 patch 被丢弃
        """
        operation = patch.get("operation")
        anchor = (patch.get("anchor") or "").strip()
        old_text = (patch.get("old_text") or "").strip("\n") or anchor
        patch_content = (patch.get("content") or "").strip()

        if operation == "insert":
            if not patch_content:
                return content, "insert content 为空"
            if not anchor or anchor.lower() == "end":
                if not content:
                    return patch_content, None
                return content.rstrip() + "\n\n" + patch_content, None
            if anchor.lower() == "start":
                if not content:
                    return patch_content, None
                return patch_content + "\n\n" + content.lstrip(), None
            error = self._check_unique_anchor(content, anchor)
            if error:
                return content, error
            idx = content.index(anchor) + len(anchor)
            return content[:idx] + "\n\n" + patch_content + content[idx:], None

        if operation == "replace":
            if not patch_content:
                return content, "replace content 为空"
            if not old_text:
                return content, "replace old_text 为空"
            error = self._check_unique_anchor(content, old_text)
            if error:
                return content, error
            return content.replace(old_text, patch_content, 1), None

        if operation == "delete":
            if not old_text:
                return content, "delete old_text 为空"
            error = self._check_unique_anchor(content, old_text)
            if error:
                return content, error
            return content.replace(old_text, "", 1), None

        return content, f"未知 operation: {operation}"

    def _check_unique_anchor(self, content: str, text: str) -> Optional[str]:
        """校验锚点文本在正文中存在且唯一，不满足返回错误信息。"""
        count = content.count(text)
        if count == 0:
            return f"锚点在正文中不存在: {text[:50]}"
        if count > 1:
            return f"锚点在正文中不唯一({count}处): {text[:50]}"
        return None

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
