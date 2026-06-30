# backend/apps/outline/services/mermaid_illustration_service.py
"""Mermaid 配图服务（P3 正文增强）。

批量扫描 content_plan.mermaid.needed=true 章节统一生成 Mermaid 代码。
调 mermaid.ink 外部渲染校验，失败修复 1 次（共最多 2 次渲染 + 1 次修复）。
成功后 PNG 存 MinIO + 嵌入正文（```mermaid 代码块）。
"""
import base64
import logging
from typing import Optional

import requests
from django.conf import settings
from django.db.models import Max
from django.utils import timezone

from apps.common.services.storage import StorageService
from apps.outline.constants import SectionVersionSource
from apps.outline.models import Outline, Section, SectionVersion

logger = logging.getLogger(__name__)


class MermaidIllustrationService:
    """Mermaid 配图服务。"""

    def __init__(self):
        self.storage = StorageService()
        self.render_url = getattr(settings, "MERMAID_RENDER_URL", "https://mermaid.ink")
        self.render_timeout = getattr(settings, "MERMAID_RENDER_TIMEOUT", 30)

    def run_illustration(self, outline_id: int, user, async_task=None) -> dict:
        """批量扫描 mermaid.needed=true 章节统一生成 Mermaid 配图。

        Returns:
            {"total": N, "success": M, "failed": K, "skipped": L, "details": [...]}
        """
        sections = self._collect_target_sections(outline_id)
        if not sections:
            return {"total": 0, "success": 0, "failed": 0, "skipped": 0, "details": []}

        total = len(sections)
        success = 0
        failed = 0
        details = []

        for idx, section in enumerate(sections, start=1):
            try:
                result = self._generate_for_section(section, user)
                if result.get("success"):
                    success += 1
                else:
                    failed += 1
                details.append({
                    "section_id": section.id,
                    "title": section.title,
                    "success": result.get("success"),
                    "reason": result.get("reason", ""),
                })
            except Exception as e:
                failed += 1
                logger.warning(f"mermaid_illustration section {section.id} exception: {e}")
                details.append({
                    "section_id": section.id,
                    "title": section.title,
                    "success": False,
                    "reason": str(e),
                })

            if async_task:
                async_task.progress = min(95, 10 + int(idx / total * 85))
                async_task.current_step = f"Mermaid 配图 {idx}/{total}"
                async_task.save(update_fields=["progress", "current_step"])

        if async_task:
            async_task.progress = 100
            async_task.current_step = "完成"
            async_task.save(update_fields=["progress", "current_step"])

        return {
            "total": total,
            "success": success,
            "failed": failed,
            "skipped": 0,
            "details": details,
        }

    def _collect_target_sections(self, outline_id: int) -> list:
        """收集需要 Mermaid 配图的章节。"""
        sections = Section.objects.filter(outline_id=outline_id).order_by("sort_order")
        targets = []
        for s in sections:
            plan = s.content_plan or {}
            mermaid_plan = plan.get("mermaid") or {}
            if mermaid_plan.get("needed") is True and not s.mermaid_code:
                targets.append(s)
        return targets

    def _generate_for_section(self, section: Section, user) -> dict:
        """单章：调 AI 生成 mermaid_code → 渲染校验 → 失败修复 1 次 → 存 MinIO + 嵌入正文。"""
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        ai_service = AiTaskExecutionService()
        write_scope = self._get_write_scope(section)
        chapter_summary = section.content_summary or ""

        variables = {
            "chapter_title": section.title,
            "write_scope": write_scope,
            "chapter_summary": chapter_summary,
            "render_error": "",
        }

        prompt_run = ai_service.execute(
            scenario="mermaid_illustration",
            variables=variables,
            created_by=user,
            business_context={"project_id": section.outline.project_id},
        )

        if prompt_run.status != "succeeded":
            return {"success": False, "reason": f"AI 失败：{prompt_run.error_message}"}

        data = prompt_run.output_json or {}
        code = (data.get("mermaid_code") or "").strip()
        if not code:
            return {"success": False, "reason": "AI 返回 mermaid_code 为空"}

        # 首次渲染
        png_bytes = self._render_mermaid(code)
        render_error = ""

        if png_bytes is None:
            # 修复 1 次
            render_error = "首次渲染失败"
            variables["render_error"] = render_error
            repair_run = ai_service.execute(
                scenario="mermaid_illustration",
                variables=variables,
                created_by=user,
                business_context={"project_id": section.outline.project_id},
            )
            if repair_run.status != "succeeded":
                section.mermaid_code = code  # 记录但不嵌入
                section.save(update_fields=["mermaid_code", "updated_at"])
                return {"success": False, "reason": f"修复 AI 失败：{repair_run.error_message}"}

            repair_data = repair_run.output_json or {}
            code = (repair_data.get("mermaid_code") or "").strip()
            if not code:
                return {"success": False, "reason": "修复后 mermaid_code 仍为空"}

            png_bytes = self._render_mermaid(code)
            if png_bytes is None:
                section.mermaid_code = code  # 记录但不嵌入
                section.save(update_fields=["mermaid_code", "updated_at"])
                return {"success": False, "reason": "修复后渲染仍失败"}

        # 渲染成功：存 MinIO + 嵌入正文
        object_key = f"mermaid/{section.outline_id}/{section.id}.png"
        self.storage.put_object(object_key, png_bytes, content_type="image/png")

        section.mermaid_code = code
        section.mermaid_object_key = object_key

        # 正文末尾追加 mermaid 代码块（不重复追加）
        mermaid_block = f"```mermaid\n{code}\n```"
        if mermaid_block not in (section.content or ""):
            new_content = (section.content or "").rstrip() + "\n\n" + mermaid_block
            section.content = new_content
            new_word_count = self._count_words(new_content)
            section.content_word_count = new_word_count
            section.word_count = new_word_count

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

        section.save(update_fields=["mermaid_code", "mermaid_object_key", "content", "content_word_count", "word_count", "updated_at"])

        return {"success": True, "object_key": object_key}

    def _render_mermaid(self, code: str) -> Optional[bytes]:
        """调 mermaid.ink 渲染 Mermaid 代码为 PNG。

        GET {MERMAID_RENDER_URL}/img/{base64(code)} 返回 PNG bytes，失败返回 None。
        """
        try:
            encoded = base64.urlsafe_b64encode(code.encode("utf-8")).decode("ascii")
            url = f"{self.render_url}/img/{encoded}"
            resp = requests.get(url, timeout=self.render_timeout)
            if resp.status_code == 200 and resp.content and "image" in (resp.headers.get("Content-Type") or ""):
                return resp.content
            logger.warning(f"mermaid render failed: status={resp.status_code} content-type={resp.headers.get('Content-Type')}")
            return None
        except Exception as e:
            logger.warning(f"mermaid render exception: {e}")
            return None

    def _get_write_scope(self, section: Section) -> str:
        if section.content_matrix:
            return section.content_matrix.get("write_scope", "") or ""
        return ""

    def _count_words(self, text: str) -> int:
        import re
        if not text:
            return 0
        clean = re.sub(r"[#*`\-|>]", "", text)
        clean = re.sub(r"\s+", "", clean)
        return len(clean)
