# backend/apps/outline/services/table_cleanup_service.py
"""表格清理服务（P3 正文增强）。

逐表调 AI 判断 keep/convert，convert 时用 AI 生成的纯文字描述替换原表格。
单表失败跳过不阻断其他表。
"""
import logging
import re
from typing import Iterator

from django.db.models import Max
from django.utils import timezone

from apps.outline.constants import SectionVersionSource
from apps.outline.models import Section, SectionVersion

logger = logging.getLogger(__name__)


TABLE_PATTERN = re.compile(
    r"(?:^[ \t]*\|[^\n]+\|[ \t]*\n)"        # 表头行
    r"(?:[ \t]*\|[\s:|-]+?\|[ \t]*\n)"      # 分隔行
    r"(?:[ \t]*\|[^\n]+\|[ \t]*\n)+",       # 数据行（至少 1 行）
    re.MULTILINE,
)


class TableCleanupService:
    """单章表格清理。"""

    def cleanup_section(self, section_id: int, user, async_task=None) -> dict:
        """逐表调 AI 判断 keep/convert，convert 的替换为文字描述。

        Returns:
            {"total_tables": N, "kept": M, "converted": K, "failed": L, "section_id": ...}
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        section = Section.objects.get(pk=section_id)
        content = section.content or ""
        tables = list(self._extract_tables(content))

        if not tables:
            return {
                "section_id": section.id,
                "total_tables": 0,
                "kept": 0,
                "converted": 0,
                "failed": 0,
            }

        ai_service = AiTaskExecutionService()
        write_scope = self._get_write_scope(section)

        new_content = content
        kept = 0
        converted = 0
        failed = 0

        for idx, table_md in enumerate(tables, start=1):
            try:
                variables = {
                    "chapter_title": section.title,
                    "write_scope": write_scope,
                    "table_markdown": table_md,
                }
                prompt_run = ai_service.execute(
                    scenario="table_cleanup",
                    variables=variables,
                    created_by=user,
                    business_context={"project_id": section.outline.project_id},
                )
                if prompt_run.status != "succeeded":
                    failed += 1
                    logger.warning(
                        f"table_cleanup section {section.id} table #{idx} failed: {prompt_run.error_message}"
                    )
                    continue

                decision = prompt_run.output_json or {}
                if decision.get("keep") is True:
                    kept += 1
                    continue

                text_alt = (decision.get("text_alternative") or "").strip()
                if not text_alt:
                    kept += 1
                    continue

                new_content = new_content.replace(table_md, text_alt, 1)
                converted += 1

                if async_task:
                    async_task.progress = min(95, 10 + int(idx / len(tables) * 85))
                    async_task.current_step = f"清理表格 {idx}/{len(tables)}"
                    async_task.save(update_fields=["progress", "current_step"])
            except Exception as e:
                failed += 1
                logger.warning(f"table_cleanup section {section.id} table #{idx} exception: {e}")
                continue

        if converted > 0:
            section.content = new_content
            new_word_count = self._count_words(new_content)
            section.content_word_count = new_word_count
            section.word_count = new_word_count
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
                word_count=new_word_count,
                created_by=user,
            )

        if async_task:
            async_task.progress = 100
            async_task.current_step = "完成"
            async_task.save(update_fields=["progress", "current_step"])

        return {
            "section_id": section.id,
            "total_tables": len(tables),
            "kept": kept,
            "converted": converted,
            "failed": failed,
        }

    def _extract_tables(self, content: str) -> Iterator[str]:
        """从 Markdown 正文中提取所有表格片段。"""
        for match in TABLE_PATTERN.finditer(content):
            yield match.group(0).rstrip("\n")

    def _get_write_scope(self, section: Section) -> str:
        """获取章节写作范围（来自 content_matrix.write_scope）。"""
        if section.content_matrix:
            return section.content_matrix.get("write_scope", "") or ""
        return ""

    def _count_words(self, text: str) -> int:
        """统计字数（中文按字符，英文按单词）。"""
        if not text:
            return 0
        clean = re.sub(r"[#*`\-|>]", "", text)
        clean = re.sub(r"\s+", "", clean)
        return len(clean)
