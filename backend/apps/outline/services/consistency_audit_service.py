# backend/apps/outline/services/consistency_audit_service.py
"""一致性审计与修复服务（借鉴 OpenBidKit contentGenerationTask.cjs auditing 阶段）。

按一级目录分组，AI 审计正文与全局事实的冲突，冲突写入 Section.content_generation_meta。
"""

import json
import logging
from django.utils import timezone

from apps.outline.models import GlobalFactGroup, Outline, Section

logger = logging.getLogger(__name__)


class ConsistencyAuditService:
    """一致性审计与修复服务。"""

    def run_audit(self, outline_id: int, user, async_task=None) -> dict:
        """按一级目录分组审计。

        Returns:
            {"total_groups": int, "total_conflicts": int, "by_severity": {high,medium,low}}
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        outline = Outline.objects.get(pk=outline_id)
        ai = AiTaskExecutionService()

        global_facts_text = self._load_global_facts_text(outline)
        bid_key_info = self._load_bid_key_info(outline)

        # 跑前清空旧冲突
        self._clear_old_conflicts(outline)

        groups = self._group_by_top_level(outline)
        total = len(groups)
        all_conflicts = []
        by_severity = {"high": 0, "medium": 0, "low": 0}

        for idx, group in enumerate(groups):
            if async_task:
                async_task.progress = int(10 + 85 * (idx + 1) / total) if total else 100
                async_task.current_step = f"审计分组 {idx + 1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])

            try:
                run = ai.execute(
                    scenario="consistency_audit",
                    variables={
                        "global_facts_text": global_facts_text,
                        "bid_key_info": bid_key_info,
                        "allowed_section_ids": json.dumps(group["allowed_ids"], ensure_ascii=False),
                        "group_content": group["content"],
                    },
                    created_by=user,
                    business_context={"project_id": outline.project_id} if outline.project_id else {},
                )
                if run.status == "succeeded":
                    conflicts = (run.output_json or {}).get("conflicts", [])
                else:
                    logger.warning(f"审计分组 {idx + 1} 失败：{run.error_message}")
                    conflicts = []
            except Exception as e:
                logger.warning(f"审计分组 {idx + 1} 异常：{e}")
                conflicts = []

            self._write_conflicts_to_sections(group, conflicts)
            all_conflicts.extend(conflicts)
            for c in conflicts:
                sev = c.get("severity", "medium")
                by_severity[sev] = by_severity.get(sev, 0) + 1

        return {
            "total_groups": total,
            "total_conflicts": len(all_conflicts),
            "by_severity": by_severity,
        }

    def repair_section(self, section_id: int, user) -> dict:
        """单章同步修复：读该章 conflicts，调 consistency_repair，覆盖 content。"""
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        section = Section.objects.get(pk=section_id)
        meta = section.content_generation_meta or {}
        conflicts = meta.get("consistency_conflicts", [])
        unresolved = [c for c in conflicts if not c.get("resolved")]
        if not unresolved:
            return {"section_id": section_id, "fixed_count": 0, "message": "无未解决冲突"}

        outline = section.outline
        global_facts_text = self._load_global_facts_text(outline)

        try:
            run = AiTaskExecutionService().execute(
                scenario="consistency_repair",
                variables={
                    "section_content": section.content or "",
                    "conflicts_json": json.dumps(unresolved, ensure_ascii=False),
                    "global_facts_text": global_facts_text,
                },
                created_by=user,
                business_context={"project_id": outline.project_id} if outline.project_id else {},
            )
            if run.status != "succeeded":
                raise Exception(run.error_message or "修复调用失败")
            new_content = (run.output_json or {}).get("content", "")
            if not new_content:
                raise ValueError("修复返回空正文")
            fixed_titles = (run.output_json or {}).get("fixed_conflicts", [])

            section.content = new_content
            for c in conflicts:
                if c.get("fact_title") in fixed_titles:
                    c["resolved"] = True
            section.content_generation_meta = meta
            section.save(update_fields=["content", "content_generation_meta", "updated_at"])
            return {"section_id": section_id, "fixed_count": len(fixed_titles), "new_content": new_content}
        except Exception as e:
            logger.warning(f"章节 {section_id} 修复失败：{e}")
            raise

    def run_batch_repair(self, outline_id: int, user, async_task=None) -> None:
        """批量异步修复：遍历所有有未解决冲突的章节。"""
        outline = Outline.objects.get(pk=outline_id)
        sections = list(
            Section.objects.filter(outline=outline).exclude(content="").iterator()
        )
        to_repair = [
            s for s in sections
            if any(not c.get("resolved") for c in (s.content_generation_meta or {}).get("consistency_conflicts", []))
        ]
        total = len(to_repair)
        fixed = 0
        for idx, section in enumerate(to_repair):
            if async_task:
                async_task.progress = int(10 + 85 * (idx + 1) / total) if total else 100
                async_task.current_step = f"修复章节 {idx + 1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])
            try:
                self.repair_section(section.id, user)
                fixed += 1
            except Exception as e:
                logger.warning(f"章节 {section.id} 批量修复失败：{e}")
        if async_task:
            async_task.result_payload = {"outline_id": outline_id, "total": total, "fixed": fixed}

    # ------------------------------------------------------------------
    # 辅助
    # ------------------------------------------------------------------

    def _load_global_facts_text(self, outline) -> str:
        facts = GlobalFactGroup.objects.filter(outline=outline).order_by("sort_order", "id")
        if not facts:
            return ""
        lines = [f"【{f.title}】\n{f.content}" for f in facts]
        return "\n\n".join(lines)

    def _load_bid_key_info(self, outline) -> str:
        parts = [f"项目名称：{outline.project.name}"]
        tf = getattr(outline, "source_tender_file", None)
        if tf:
            parts.append(f"招标文件：{tf.original_name}")
        return "\n".join(parts)

    def _group_by_top_level(self, outline) -> list[dict]:
        """按一级目录分组叶子章节。"""
        top_sections = Section.objects.filter(
            outline=outline, parent=None, level=1,
        ).order_by("sort_order", "id")
        groups = []
        for top in top_sections:
            leaves = self._collect_leaves(top)
            if not leaves:
                continue
            allowed_ids = [s.section_number for s in leaves if s.section_number]
            content_parts = [
                f"<section id=\"{s.section_number or s.id}\" title=\"{s.title}\">\n{s.content or ''}\n</section>"
                for s in leaves
            ]
            groups.append({
                "top_id": top.id,
                "top_title": top.title,
                "leaves": leaves,
                "allowed_ids": allowed_ids,
                "content": "\n\n".join(content_parts),
            })
        return groups

    def _collect_leaves(self, section) -> list:
        """递归收集叶子章节（无 children）。"""
        children = list(Section.objects.filter(parent=section).order_by("sort_order", "id"))
        if not children:
            return [section] if section.content else []
        result = []
        for c in children:
            result.extend(self._collect_leaves(c))
        return result

    def _clear_old_conflicts(self, outline):
        """跑前清空旧冲突，避免累积。"""
        sections = Section.objects.filter(outline=outline)
        for s in sections:
            meta = s.content_generation_meta or {}
            if "consistency_conflicts" in meta:
                meta.pop("consistency_conflicts", None)
                s.content_generation_meta = meta
                s.save(update_fields=["content_generation_meta"])

    def _write_conflicts_to_sections(self, group: dict, conflicts: list[dict]):
        """把冲突按 section_id 分发到对应 Section。"""
        if not conflicts:
            return
        leaves_by_number = {s.section_number: s for s in group["leaves"] if s.section_number}
        leaves_by_id = {str(s.id): s for s in group["leaves"]}
        now = timezone.now().isoformat()

        by_section = {}
        for c in conflicts:
            sid = c.get("section_id", "")
            section = leaves_by_number.get(sid) or leaves_by_id.get(sid)
            if not section:
                continue
            by_section.setdefault(section.id, []).append({
                "fact_title": c.get("fact_title", ""),
                "evidence": c.get("evidence", ""),
                "reason": c.get("reason", ""),
                "severity": c.get("severity", "medium"),
                "audited_at": now,
                "resolved": False,
            })

        for section_id, section_conflicts in by_section.items():
            section = Section.objects.get(pk=section_id)
            meta = section.content_generation_meta or {}
            meta["consistency_conflicts"] = section_conflicts
            section.content_generation_meta = meta
            section.save(update_fields=["content_generation_meta"])
