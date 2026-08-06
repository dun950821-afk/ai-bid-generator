# backend/apps/outline/services/outline_review_service.py
"""大纲目录审核服务（借鉴 OpenBidKit outlineWorkflow.ts）。

generate_with_review 只做两步：提取评分大类 + 逐大类生成目录。
审核改由用户在前端手动触发 review_outline；不通过可用 refine_with_suggestions 按建议重生成。
"""

import json
import logging

from django.db import transaction

from apps.outline.constants import OutlineStatus
from apps.outline.models import Outline, Section

logger = logging.getLogger(__name__)


def _business_context(outline) -> dict:
    """把 outline 转成 PromptRun 认可的业务关联字段（project_id/tender_file_id）。

    PromptRun 只有 project/tender_file/parsed_document 三个业务 FK，
    传 outline_id 会触发 TypeError。
    """
    ctx = {}
    if outline and getattr(outline, "project_id", None):
        ctx["project_id"] = outline.project_id
    tf = getattr(outline, "source_tender_file", None)
    if tf:
        ctx["tender_file_id"] = tf.id
    return ctx


# 目录至少三级结构
MIN_OUTLINE_DEPTH = 3


class OutlineReviewService:
    """大纲目录审核闭环服务。"""

    def review_outline(self, outline: Outline, user) -> dict:
        """对已存在大纲执行审核（不重新生成）。

        Returns:
            {"passed": bool, "suggestions": [...], "groups": [...]}
        """
        groups = self._extract_requirement_groups(outline=outline, user=user)
        outline_tree = self._build_outline_tree(outline)

        result = self._review_outline(outline, outline, groups, outline_tree, user)
        self._save_review_result(outline, groups, result)
        return {"passed": result.get("passed", False), "suggestions": result.get("suggestions", []), "groups": groups}

    def force_pass(self, outline: Outline, user) -> dict:
        """忽略 AI 建议，强制审核通过。

        保留 suggestions 作为记录，但 review_status 置 passed + review_overridden=true。
        """
        outline.review_status = "passed"
        outline.review_overridden = True
        outline.save(update_fields=["review_status", "review_overridden", "updated_at"])
        return {
            "passed": True,
            "overridden": True,
            "suggestions": outline.review_suggestions,
            "message": "已忽略建议，审核通过",
        }

    def refine_with_suggestions(self, outline: Outline, user, progress_callback=None) -> dict:
        """按现有 suggestions 重跑生成+审核，输出新旧目录 diff。

        不直接覆盖现有章节，返回 diff 供前端预览确认。
        diff 结构：{added: [...], removed: [...], new_tree: [...], review: {...}}
        """
        def _emit(progress, step):
            if progress_callback:
                progress_callback(progress, step)

        _emit(10, "完善目录：读取审核建议")
        suggestions = outline.review_suggestions or []
        if not suggestions:
            raise ValueError("当前大纲没有审核建议，无法按建议完善")

        tender_file = outline.source_tender_file
        if not tender_file:
            raise ValueError("大纲未关联招标文件，无法完善目录")

        _emit(25, "完善目录：重新提取评分大类")
        groups = self._extract_requirement_groups(
            tender_file=tender_file, outline=outline, user=user, suggestions=suggestions,
        )

        _emit(50, "完善目录：按建议生成二三级目录")
        new_tree = self._generate_aligned_outline(
            tender_file, outline, groups, user, suggestions=suggestions,
        )

        _emit(75, "完善目录：对比新旧目录")
        old_tree = self._build_outline_tree(outline)
        diff = self._diff_outline(old_tree, new_tree)

        _emit(90, "完善目录：审核新目录")
        review = self._review_outline(tender_file, outline, groups, new_tree, user)

        _emit(100, "完善目录：完成")
        return {
            "added": diff["added"],
            "removed": diff["removed"],
            "new_tree": new_tree,
            "groups": groups,
            "review": {
                "passed": review.get("passed", False),
                "suggestions": review.get("suggestions", []),
            },
        }

    def apply_refine(self, outline: Outline, new_tree: list[dict], user, review: dict = None) -> dict:
        """用户确认后，应用 refine 生成的新目录（覆盖现有章节树）。

        保留用户已编辑内容的章节（按标题匹配，content 非空的旧章节内容迁移到新树同名章节）。
        review: refine 任务已对新树完成的审核结果 {"passed": bool, "suggestions": [...]}，
            传入时同步落库，使应用后 review_status 反映新树的真实审核结论，
            避免用户按建议修好后仍一直显示"审核未通过"。
        """
        from apps.outline.models import Section
        from apps.outline.constants import SectionStatus, SectionGenerationStatus

        old_sections = list(Section.objects.filter(outline=outline))
        # 标题 -> content 映射，用于迁移用户已编辑内容
        old_content_map = {s.title: s.content for s in old_sections if s.content}

        # 清空旧章节
        Section.objects.filter(outline=outline).delete()

        # 按新树创建章节
        created_count = self._persist_tree(outline, new_tree, parent=None, old_content_map=old_content_map)

        outline.review_overridden = False
        update_fields = ["review_overridden", "updated_at"]
        if review:
            outline.review_status = "passed" if review.get("passed") else "failed"
            outline.review_suggestions = review.get("suggestions", [])
            update_fields += ["review_status", "review_suggestions"]
        outline.save(update_fields=update_fields)
        return {"applied": True, "section_count": created_count}

    def _persist_tree(self, outline, nodes, parent, old_content_map, level=1, sort_start=0) -> int:
        """递归创建章节树，迁移用户已编辑内容。"""
        from apps.outline.models import Section
        count = 0
        for idx, node in enumerate(nodes):
            title = node.get("title", "")
            section = Section.objects.create(
                outline=outline,
                parent=parent,
                title=title,
                level=level,
                sort_order=sort_start + idx,
                content=old_content_map.get(title, ""),
            )
            count += 1
            children = node.get("children") or []
            if children:
                count += self._persist_tree(outline, children, section, old_content_map, level + 1)
        return count

    def _diff_outline(self, old_tree: list[dict], new_tree: list[dict]) -> dict:
        """对比新旧一级目录，输出 added/removed。"""
        old_titles = {n.get("title", "") for n in old_tree}
        new_titles = {n.get("title", "") for n in new_tree}
        added = [n for n in new_tree if n.get("title", "") not in old_titles]
        removed = [n for n in old_tree if n.get("title", "") not in new_titles]
        return {"added": added, "removed": removed}

    def generate_with_review(self, tender_file, outline: Outline, user, progress_callback=None) -> Outline:
        """两步生成（提取评分大类 + 逐大类生成目录），不再自动审核。

        审核改由用户在前端手动触发 review_outline。
        requirement_groups 仍保存供后续手动审核比对；review_status 留空。
        """
        def _emit(progress, step):
            if progress_callback:
                progress_callback(progress, step)

        _emit(25, "提取技术评分大类")
        groups = self._extract_requirement_groups(tender_file=tender_file, outline=outline, user=user)

        _emit(60, "逐大类生成二三级子目录")
        first_outline = self._generate_aligned_outline(tender_file, outline, groups, user, suggestions=None)

        # 保存评分大类快照供后续手动审核比对；review_status 留空待用户手动审核
        outline.requirement_groups = groups
        outline.save(update_fields=["requirement_groups", "updated_at"])

        _emit(90, "大纲生成完成")
        return first_outline

    # ------------------------------------------------------------------
    # 三步实现
    # ------------------------------------------------------------------

    def _extract_requirement_groups(self, outline=None, tender_file=None, user=None, suggestions=None) -> list[dict]:
        """提取技术评分大类。

        优先复用已抽取的 TenderRequirement(extraction_type='scoring')；
        无则调 AI 从招标文件 markdown 提取。
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        # 优先复用 TenderRequirement
        groups = self._load_groups_from_requirements(tender_file or (outline.source_tender_file if outline else None))
        if groups:
            return groups

        # 无已抽取条款，调 AI 提取
        resolved_tender_file = tender_file or (outline.source_tender_file if outline else None)
        requirements_text = self._load_requirements_text(resolved_tender_file)
        if not requirements_text:
            raise ValueError("无法获取技术评分要求文本（招标文件未解析或无 scoring 条款）")

        run = AiTaskExecutionService().execute(
            scenario="outline_requirement_groups",
            variables={
                "requirements_text": requirements_text,
                "project_overview": self._load_project_overview(resolved_tender_file) or "",
                "suggestions_block": self._format_suggestions(suggestions),
            },
            created_by=user,
            business_context=_business_context(outline),
        )
        if run.status != "succeeded":
            raise Exception(run.error_message or "评分大类提取失败")
        groups = (run.output_json or {}).get("groups", [])
        if not groups:
            raise ValueError("评分大类不能为空")
        return groups

    def _generate_aligned_outline(self, tender_file, outline, groups, user, suggestions=None) -> list[dict]:
        """逐大类生成二三级子目录，拼装完整树。"""
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        ai = AiTaskExecutionService()
        project_overview = self._load_project_overview(tender_file or outline.source_tender_file)
        requirements_text = self._load_requirements_text(tender_file or outline.source_tender_file)

        assembled: list[dict] = []
        for idx, group in enumerate(groups):
            parent_id = f"{idx + 1}"
            parent_item = {
                "id": parent_id,
                "title": group.get("title", ""),
                "description": group.get("description", group.get("title", "")),
            }
            detail_points = group.get("detail_points") or []
            detail_text = "\n".join(f"- {p}" for p in detail_points if p) or "- 未提供明确细项，请根据评分大类描述合理展开"

            run = ai.execute(
                scenario="outline_children",
                variables={
                    "project_overview": project_overview,
                    "requirements_text": requirements_text or "",
                    "old_outline": "",
                    "parent_id": parent_id,
                    "parent_title": parent_item["title"],
                    "parent_description": parent_item["description"],
                    "requirement_id": group.get("requirement_id", ""),
                    "requirement_title": group.get("title", ""),
                    "requirement_description": group.get("description", ""),
                    "detail_points_text": detail_text,
                    "suggestions_block": self._format_suggestions(suggestions),
                },
                created_by=user,
                business_context=_business_context(outline),
            )
            if run.status != "succeeded":
                raise Exception(run.error_message or f"子目录生成失败：{parent_item['title']}")
            children = (run.output_json or {}).get("children", [])
            if not children:
                raise ValueError(f"子目录不能为空：{parent_item['title']}")
            assembled.append({**parent_item, "children": children})

        # 校验至少三级结构
        depth = self._outline_depth(assembled)
        if depth < MIN_OUTLINE_DEPTH:
            raise ValueError(f"完整目录至少需要三级结构，当前 {depth} 级")

        return self._renumber(assembled)

    def _review_outline(self, tender_file_or_outline, outline, groups, outline_tree, user) -> dict:
        """审核目录与评分大类一一对应。"""
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        tf = tender_file_or_outline if hasattr(tender_file_or_outline, "original_name") else None
        overview = self._load_project_overview(tf or outline.source_tender_file)
        requirements = self._load_requirements_text(tf or outline.source_tender_file)

        run = AiTaskExecutionService().execute(
            scenario="outline_review",
            variables={
                "overview": overview or "",
                "requirements": requirements or "",
                "groups_json": json.dumps({"groups": groups}, ensure_ascii=False),
                "outline_json": json.dumps({"outline": outline_tree}, ensure_ascii=False),
            },
            created_by=user,
            business_context=_business_context(outline),
        )
        if run.status != "succeeded":
            # AI 调用失败必须向上抛：不能把"调用失败"伪装成"审核未通过"落库
            raise Exception(run.error_message or "审核调用失败")
        return {
            "passed": bool((run.output_json or {}).get("passed", False)),
            "suggestions": (run.output_json or {}).get("suggestions", []),
        }

    # ------------------------------------------------------------------
    # 持久化
    # ------------------------------------------------------------------

    @transaction.atomic
    def _save_review_result(self, outline: Outline, groups: list[dict], review: dict):
        outline.requirement_groups = groups
        outline.review_status = "passed" if review.get("passed") else "failed"
        outline.review_suggestions = review.get("suggestions", [])
        outline.save(update_fields=["requirement_groups", "review_status", "review_suggestions", "updated_at"])

    # ------------------------------------------------------------------
    # 辅助
    # ------------------------------------------------------------------

    def _load_groups_from_requirements(self, tender_file) -> list[dict]:
        """从已抽取 TenderRequirement(scoring) 构建评分大类。"""
        if not tender_file:
            return []
        try:
            from apps.requirements.models import TenderRequirement
        except ImportError:
            return []
        qs = TenderRequirement.objects.filter(
            tender_file=tender_file, extraction_type="scoring",
        ).order_by("sort_order", "id")
        if not qs.exists():
            return []
        groups: list[dict] = []
        for idx, req in enumerate(qs):
            groups.append({
                "requirement_id": f"R{idx + 1}",
                "title": req.title or f"评分项{idx + 1}",
                "description": (req.content or "")[:200],
                "detail_points": [req.title] if req.title else [],
            })
        return groups

    def _load_requirements_text(self, tender_file) -> str:
        """读取招标文件 markdown 作为评分要求文本（兜底）。"""
        if not tender_file:
            return ""
        from apps.common.services.storage import StorageService
        from apps.tender.models import ParsedDocument

        parsed = ParsedDocument.objects.filter(tender_file=tender_file, is_active=True).first()
        if not parsed or not parsed.markdown_uri:
            return ""
        storage = StorageService()
        content = storage.get_object(parsed.markdown_uri)
        return content.decode("utf-8") if content else ""

    def _load_project_overview(self, tender_file) -> str:
        if not tender_file:
            return ""
        project = getattr(tender_file, "project", None)
        return f"项目名称：{project.name}" if project else ""

    def _build_outline_tree(self, outline: Outline) -> list[dict]:
        """从已持久化的 Section 构建目录树（用于审核已有大纲）。"""
        sections = list(
            Section.objects.filter(outline=outline).order_by("sort_order", "id")
        )
        by_id = {s.id: {"id": s.title and str(s.id), "title": s.title, "description": "", "children": [], "_s": s} for s in sections}
        roots: list[dict] = []
        for s in sections:
            node = by_id[s.id]
            if s.parent_id and s.parent_id in by_id:
                by_id[s.parent_id]["children"].append(node)
            else:
                roots.append(node)
        for node in by_id.values():
            node.pop("_s", None)
        return self._renumber(roots)

    def _outline_depth(self, items: list[dict]) -> int:
        if not items:
            return 0
        return 1 + max(self._outline_depth(it.get("children", [])) for it in items)

    def _renumber(self, items: list[dict], prefix: str = "") -> list[dict]:
        result = []
        for idx, it in enumerate(items):
            nid = f"{prefix}{idx + 1}" if not prefix else f"{prefix}.{idx + 1}"
            new_node = {"id": nid, "title": it.get("title", ""), "description": it.get("description", "")}
            if it.get("children"):
                new_node["children"] = self._renumber(it["children"], nid)
            result.append(new_node)
        return result

    def _format_suggestions(self, suggestions) -> str:
        if not suggestions:
            return ""
        lines = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(suggestions))
        return f"\n\n本轮修正建议：\n{lines}"
