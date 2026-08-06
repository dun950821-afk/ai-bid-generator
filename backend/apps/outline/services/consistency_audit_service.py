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
        """单章同步修复：读该章 conflicts，调 consistency_repair 生成 patches，逐个应用。

        patch 应用规则（借鉴 OpenBidKit applyExactConsistencyPatch）：
        - 优先用 start_line/end_line 在带行号正文中定位，行号区间文本与 old_text 完全一致才替换
        - 否则用 old_text 在正文中查找，必须唯一匹配（0 次或多次都报错）
        - old_text/new_text 相同报错

        修复成功后，对每条 fact_title ∈ fixed_conflicts 的 conflict 写入：
        - repaired_at: ISO 时间戳
        - repaired_diff: 修复前后正文片段对比（基于 patch.old_text/new_text 精确定位）
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        section = Section.objects.get(pk=section_id)
        meta = section.content_generation_meta or {}
        conflicts = meta.get("consistency_conflicts", [])
        unresolved = [c for c in conflicts if not c.get("resolved")]
        if not unresolved:
            return {"section_id": section_id, "fixed_count": 0, "repaired_count": 0, "message": "无未解决冲突"}

        outline = section.outline
        global_facts_text = self._load_global_facts_text(outline)
        old_content = section.content or ""
        section_number = section.section_number or str(section.id)
        content_with_line_numbers = self._format_content_with_line_numbers(old_content)

        try:
            run = AiTaskExecutionService().execute(
                scenario="consistency_repair",
                variables={
                    "section_id": section_number,
                    "section_content": old_content,
                    "section_content_with_line_numbers": content_with_line_numbers,
                    "conflicts_json": json.dumps(unresolved, ensure_ascii=False),
                    "global_facts_text": global_facts_text,
                },
                created_by=user,
                business_context={"project_id": outline.project_id} if outline.project_id else {},
            )
            if run.status != "succeeded":
                raise Exception(run.error_message or "修复调用失败")
            output_json = run.output_json or {}
            patches = output_json.get("patches")
            # 兼容旧版整章重写 prompt（返回 {content, fixed_conflicts}）：
            # 线上 PromptTemplate 未升级到 patch 模式时走降级路径，整体替换并标记全部 unresolved 已修复
            if not patches and output_json.get("content"):
                logger.warning(
                    f"章节 {section_id} 修复返回旧版整章格式（无 patches 字段），走降级整体替换"
                )
                new_content = output_json["content"]
                fixed_titles = output_json.get("fixed_conflicts") or [
                    c.get("fact_title", "") for c in unresolved
                ]
                section.content = new_content
                repaired_at = timezone.now().isoformat()
                repaired_count = 0
                for c in conflicts:
                    if c.get("fact_title") in fixed_titles and not c.get("resolved"):
                        c["resolved"] = True
                        c["repaired_at"] = repaired_at
                        c["repaired_diff"] = self._build_repair_diff(
                            c.get("evidence", ""), old_content, new_content,
                        )
                        repaired_count += 1
                section.content_generation_meta = meta
                section.save(update_fields=["content", "content_generation_meta", "updated_at"])
                return {
                    "section_id": section_id,
                    "fixed_count": len(fixed_titles),
                    "repaired_count": repaired_count,
                    "applied_patches": 0,
                    "failed_patches": 0,
                    "degraded": True,
                    "new_content": new_content,
                }
            if not patches:
                raise ValueError("修复返回空 patches")

            new_content, applied_patches, errors = self._apply_patches(old_content, patches)

            # 第一轮有 patch 应用失败：带上失败原因再调一次 consistency_repair 重试
            if errors:
                retry_patches = self._retry_repair_with_feedback(
                    section_number=section_number,
                    old_content=old_content,
                    content_with_line_numbers=content_with_line_numbers,
                    unresolved=unresolved,
                    global_facts_text=global_facts_text,
                    previous_attempt_errors=errors,
                    user=user,
                    outline=outline,
                )
                if retry_patches:
                    new_content, retry_applied, retry_errors = self._apply_patches(new_content, retry_patches)
                    applied_patches.extend(retry_applied)
                    errors = retry_errors

            if not applied_patches:
                # 两轮后仍全部失败：降级为记录日志返回部分成功结果，不再抛错
                logger.warning(f"章节 {section_id} 修复所有 patch 应用失败（含反馈重试），已跳过：{errors}")
                return {
                    "section_id": section_id,
                    "fixed_count": 0,
                    "repaired_count": 0,
                    "applied_patches": 0,
                    "failed_patches": len(errors),
                    "new_content": old_content,
                    "message": "所有 patch 应用失败，已跳过",
                }

            fixed_titles = self._collect_fixed_titles(unresolved, applied_patches)

            section.content = new_content
            repaired_at = timezone.now().isoformat()
            repaired_count = 0
            for c in conflicts:
                if c.get("fact_title") in fixed_titles and not c.get("resolved"):
                    c["resolved"] = True
                    c["repaired_at"] = repaired_at
                    c["repaired_diff"] = self._build_repair_diff_from_patches(c.get("fact_title", ""), applied_patches)
                    repaired_count += 1
            section.content_generation_meta = meta
            section.save(update_fields=["content", "content_generation_meta", "updated_at"])
            return {
                "section_id": section_id,
                "fixed_count": len(fixed_titles),
                "repaired_count": repaired_count,
                "applied_patches": len(applied_patches),
                "failed_patches": len(errors),
                "new_content": new_content,
            }
        except Exception as e:
            logger.warning(f"章节 {section_id} 修复失败：{e}")
            raise

    def _retry_repair_with_feedback(
        self,
        section_number: str,
        old_content: str,
        content_with_line_numbers: str,
        unresolved: list[dict],
        global_facts_text: str,
        previous_attempt_errors: list[str],
        user,
        outline,
    ) -> list[dict]:
        """带上一轮失败反馈重试一次 consistency_repair，返回新的 patches（调用失败返回 []）。"""
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        errors_text = "\n".join(f"- {e}" for e in previous_attempt_errors)
        try:
            run = AiTaskExecutionService().execute(
                scenario="consistency_repair",
                variables={
                    "section_id": section_number,
                    "section_content": old_content,
                    "section_content_with_line_numbers": content_with_line_numbers,
                    "conflicts_json": json.dumps(unresolved, ensure_ascii=False),
                    "global_facts_text": global_facts_text,
                    "previous_attempt_errors": f"上一轮修复 patch 应用失败，请修正后重新输出：\n{errors_text}",
                },
                created_by=user,
                business_context={"project_id": outline.project_id} if outline.project_id else {},
            )
            if run.status != "succeeded":
                logger.warning(f"修复重试调用失败：{run.error_message}")
                return []
            return (run.output_json or {}).get("patches") or []
        except Exception as e:
            logger.warning(f"修复重试异常：{e}")
            return []

    def _format_content_with_line_numbers(self, content: str) -> str:
        """把正文按行加上 1-based 行号前缀，供 AI 返回 start_line/end_line 用。"""
        if not content:
            return ""
        lines = content.split("\n")
        return "\n".join(f"{i + 1}|{line}" for i, line in enumerate(lines))

    def _apply_patches(self, content: str, patches: list[dict]) -> tuple[str, list[dict], list[str]]:
        """逐个应用 patch 到 content。

        Returns:
            (new_content, applied_patches, errors)
            - applied_patches: 成功应用的 patch 列表（含 old_text/new_text/reason）
            - errors: 失败 patch 的错误信息列表
        """
        new_content = content
        applied = []
        errors = []
        for idx, patch in enumerate(patches):
            try:
                old_text = (patch.get("old_text") or "").strip("\n")
                new_text = (patch.get("new_text") or "").strip("\n")
                if not old_text:
                    raise ValueError("old_text 为空")
                if not new_text:
                    raise ValueError("new_text 为空")
                if old_text == new_text:
                    raise ValueError("old_text 与 new_text 相同")

                # 优先用 start_line/end_line 定位（行号区间文本必须与 old_text 完全一致）
                start_line = patch.get("start_line") or 0
                end_line = patch.get("end_line") or 0
                if isinstance(start_line, int) and isinstance(end_line, int) and start_line > 0 and end_line >= start_line:
                    lines = new_content.split("\n")
                    if end_line <= len(lines):
                        candidate = "\n".join(lines[start_line - 1: end_line])
                        if candidate == old_text:
                            new_content = "\n".join(
                                lines[: start_line - 1] + new_text.split("\n") + lines[end_line:]
                            )
                            applied.append({**patch, "old_text": old_text, "new_text": new_text})
                            continue

                # fallback: old_text 全文唯一匹配
                occurrences = []
                start = 0
                while True:
                    idx_pos = new_content.find(old_text, start)
                    if idx_pos == -1:
                        break
                    occurrences.append(idx_pos)
                    start = idx_pos + 1
                if not occurrences:
                    raise ValueError("old_text 未在当前小节正文中找到")
                if len(occurrences) > 1:
                    raise ValueError("old_text 在当前小节正文中出现多次，请提供更多上下文确保唯一定位")
                pos = occurrences[0]
                new_content = new_content[:pos] + new_text + new_content[pos + len(old_text):]
                applied.append({**patch, "old_text": old_text, "new_text": new_text})
            except Exception as e:
                errors.append(f"patch[{idx}] {e}")
        return new_content, applied, errors

    def _collect_fixed_titles(self, unresolved: list[dict], applied_patches: list[dict]) -> list[str]:
        """从应用成功的 patch.reason 反推本次修复的 fact_title 列表。

        patch.reason 是自由文本，无法精确匹配 fact_title；
        保守策略：只要本章有任意 patch 应用成功，把所有 unresolved conflict 标记为已修复。
        若 AI 在 patch.reason 中明确提到 fact_title，优先按 reason 匹配。
        """
        if not applied_patches:
            return []
        reasons = "\n".join(p.get("reason", "") for p in applied_patches)
        fixed = []
        for c in unresolved:
            title = c.get("fact_title", "")
            if title and title in reasons:
                fixed.append(title)
        # reason 未明确提到时，保守标记全部 unresolved 为已修复
        if not fixed:
            fixed = [c.get("fact_title", "") for c in unresolved]
        return fixed

    def _build_repair_diff_from_patches(self, fact_title: str, applied_patches: list[dict]) -> dict:
        """基于应用成功的 patch 构建 diff。

        优先取 reason 中提到 fact_title 的 patch；否则取第一个 patch。
        返回 {before: old_text, after: new_text, note?}。
        """
        if not applied_patches:
            return {"before": "", "after": "", "note": "无应用成功的 patch"}
        target = None
        for p in applied_patches:
            if fact_title and fact_title in (p.get("reason") or ""):
                target = p
                break
        if target is None:
            target = applied_patches[0]
        return {
            "before": target.get("old_text", ""),
            "after": target.get("new_text", ""),
            "note": target.get("reason", ""),
        }

    def _build_repair_diff(self, evidence: str, old_content: str, new_content: str) -> dict:
        """旧版整章重写降级路径用：按 evidence 在 old/new content 中定位前后窗口。"""
        WINDOW = 80
        if not evidence:
            return {"before": "", "after": "", "note": "无证据片段，无法定位对比"}

        old_idx = old_content.find(evidence)
        new_idx = new_content.find(evidence)

        if old_idx >= 0 and new_idx < 0:
            before = old_content[max(0, old_idx - WINDOW): old_idx + len(evidence) + WINDOW]
            return {
                "before": before,
                "after": new_content[:WINDOW * 2] if new_content else "",
                "note": "原片段已替换为新内容",
            }

        if old_idx >= 0 and new_idx >= 0:
            before = old_content[max(0, old_idx - WINDOW): old_idx + len(evidence) + WINDOW]
            after = new_content[max(0, new_idx - WINDOW): new_idx + len(evidence) + WINDOW]
            return {"before": before, "after": after}

        return {
            "before": old_content[:WINDOW * 2] if old_content else "",
            "after": new_content[:WINDOW * 2] if new_content else "",
            "note": "证据片段已重写，展示章节首段对比",
        }

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
        repaired_details = []
        for idx, section in enumerate(to_repair):
            if async_task:
                async_task.progress = int(10 + 85 * (idx + 1) / total) if total else 100
                async_task.current_step = f"修复章节 {idx + 1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])
            try:
                result = self.repair_section(section.id, user)
                fixed += 1
                repaired_count = result.get("repaired_count", 0)
                if repaired_count > 0:
                    repaired_details.append({
                        "section_id": section.id,
                        "section_title": section.title,
                        "repaired_count": repaired_count,
                    })
            except Exception as e:
                logger.warning(f"章节 {section.id} 批量修复失败：{e}")
        if async_task:
            async_task.result_payload = {
                "outline_id": outline_id,
                "total": total,
                "fixed": fixed,
                "repaired_details": repaired_details,
                "total_repaired": sum(d["repaired_count"] for d in repaired_details),
            }

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
