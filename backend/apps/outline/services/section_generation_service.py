# backend/apps/outline/services/section_generation_service.py
"""章节生成编排服务。"""

import json
import logging
from django.contrib.auth import get_user_model
from django.db import models, transaction

from apps.common.models import AsyncTask
from apps.outline.constants import (
    GenerationRecordStatus,
    OutlineStatus,
    SectionGenerationStatus,
    SectionStatus,
    SectionVersionSource,
)
from apps.outline.models import Outline, Section, SectionVersion, SectionGenerationRecord
from apps.outline.services.section_tree_service import SectionTreeService

User = get_user_model()
logger = logging.getLogger(__name__)


class SectionGenerationService:
    """章节生成编排服务。"""

    def analyze_section_needs(self, section_id: int) -> dict:
        """分析章节生成需求（同步调用）。

        Returns:
            {
                "keywords": ["资质证书", "项目经验"],
                "knowledge_types": ["company_qualification", "past_cases"],
                "requirement_types": ["qualification", "scoring"],
                "background": "本章节需要展示公司的技术资质...",
                "suggested_prompt": "请重点展示ISO9001认证..."
            }

        注意：分析失败返回默认建议，不影响用户手动填写提示词。
        """
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
            PromptVersionNotFoundError,
        )

        section = Section.objects.select_related("outline", "outline__lot").get(
            pk=section_id
        )

        try:
            # 调用 AI 分析（使用 section_needs_analysis scenario）
            prompt_run = AiTaskExecutionService().execute(
                scenario="section_needs_analysis",
                variables={
                    "section_title": section.title,
                    "section_level": section.level,
                    "outline_name": section.outline.name,
                    "lot_name": section.outline.lot.name,
                },
                created_by=section.outline.created_by,
                business_context={"project_id": section.outline.project_id} if section.outline.project_id else {},
            )

            if prompt_run.status == "succeeded":
                return prompt_run.output_json or {}
            else:
                logger.warning(
                    f"Section needs analysis failed: {prompt_run.error_message}"
                )
                return self._get_default_analysis(section)

        except PromptVersionNotFoundError as e:
            logger.warning(f"PromptVersion not found: {e}")
            return self._get_default_analysis(section)
        except Exception as e:
            logger.warning(f"Section needs analysis error: {e}")
            return self._get_default_analysis(section)

    def _get_default_analysis(self, section: Section) -> dict:
        """返回默认分析结果（当 AI 分析失败时）。"""
        return {
            "keywords": [section.title],
            "knowledge_types": [],
            "requirement_types": [],
            "background": f"本章为{section.title}",
            "suggested_prompt": "",
        }

    # ==================================================================
    # 正文编排决策（借鉴 OpenBidKit buildChapterContentPlanMessages）
    # ==================================================================

    def plan_section_content(self, section_id: int, user) -> dict:
        """生成章节正文编排决策（同步）。

        调 section_content_plan scenario，返回并持久化 content_plan：
        {writing_focus, knowledge:{item_ids}, facts:{titles},
         table:{needed,purpose}, mermaid:{...}, image:{...}}

        失败回退默认 plan，不阻断后续正文生成。
        """
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
            PromptVersionNotFoundError,
        )
        from django.utils import timezone

        section = Section.objects.select_related("outline__lot").get(pk=section_id)

        # 构建编排决策的输入变量
        knowledge_items = self._collect_knowledge_items_for_plan(section)
        bid_key_info = self._collect_bid_key_info(section)
        global_fact_titles = self._collect_global_fact_titles(section.outline)
        parent_chapters = self._get_parent_chapters_text(section)
        sibling_chapters = self._get_sibling_chapters_text(section)

        from django.conf import settings

        mermaid_available = bool(getattr(settings, "MERMAID_RENDER_URL", ""))
        image_available = bool(getattr(settings, "IMAGE_GEN_MODEL", ""))
        image_limit_instruction = (
            f"image.needed 表示进入 AI 生图候选池，不代表最终一定生成；本次 AI 生图上限由系统配置决定，系统后续会全局择优。"
            if image_available
            else "由于 AI 生图不可用，image 字段只需返回不需要。"
        )

        try:
            prompt_run = AiTaskExecutionService().execute(
                scenario="section_content_plan",
                variables={
                    "chapter_id": str(section.id),
                    "chapter_title": section.title,
                    "chapter_description": section.content[:500] if section.content else "",
                    "knowledge_items_json": json.dumps(knowledge_items, ensure_ascii=False),
                    "bid_key_info": bid_key_info,
                    "global_fact_titles": global_fact_titles,
                    "parent_chapters": parent_chapters,
                    "sibling_chapters": sibling_chapters,
                    "regenerate_requirement": "",
                    "table_instruction": "由你自行判断是否适合使用表格或配图，判断要克制、合情合理，不要为了形式而硬插。",
                    "table_limit_instruction": "table.needed 表示进入表格候选池，不代表最终一定生成。",
                    # 全文表格上限暂无系统配置来源，传空字符串由模板降级处理
                    "max_tables": "",
                    "mermaid_generation_available": mermaid_available,
                    "image_generation_available": image_available,
                    "image_limit_instruction": image_limit_instruction,
                },
                created_by=user,
                business_context={"project_id": section.outline.project_id} if section.outline.project_id else {},
            )

            if prompt_run.status == "succeeded":
                plan = prompt_run.output_json or self._get_default_plan(section)
            else:
                logger.warning(f"Section content plan failed: {prompt_run.error_message}")
                plan = self._get_default_plan(section)
        except PromptVersionNotFoundError as e:
            logger.warning(f"PromptVersion not found for section_content_plan: {e}")
            plan = self._get_default_plan(section)
        except Exception as e:
            logger.warning(f"Section content plan error: {e}")
            plan = self._get_default_plan(section)

        # 持久化
        section.content_plan = plan
        section.content_plan_updated_at = timezone.now()
        section.save(update_fields=["content_plan", "content_plan_updated_at", "updated_at"])
        return plan

    def _get_default_plan(self, section: Section) -> dict:
        """编排决策失败时的默认 plan。"""
        return {
            "writing_focus": f"围绕{section.title}展开技术方案正文",
            "knowledge": {"item_ids": []},
            "facts": {"titles": []},
            "table": {"needed": False, "purpose": ""},
            "mermaid": {"needed": False, "title": "", "code": "", "priority": 0, "reason": ""},
            "image": {"needed": False, "style": "", "title": "", "prompt": "", "priority": 0, "reason": ""},
        }

    def _collect_knowledge_items_for_plan(self, section: Section) -> list[dict]:
        """收集编排决策可引用的知识库轻量条目（id+title+简介）。"""
        try:
            from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
            orchestrator = RetrievalOrchestrator()
            ctx = orchestrator.retrieve_for_section(
                outline=section.outline, section=section, user=None,
                generation_mode=None, analysis_result=None,
            )
            items = []
            for src in (ctx.sources or [])[:10]:
                items.append({
                    "id": getattr(src, "chunk_id", str(getattr(src, "id", ""))),
                    "title": getattr(src, "title", "")[:80],
                    "resume": (getattr(src, "content", "") or "")[:200],
                })
            return items
        except Exception as e:
            logger.warning(f"knowledge items collect failed: {e}")
            return []

    def _collect_bid_key_info(self, section: Section) -> str:
        """收集招标文件关键信息（项目概述+甲方+交货要求）。"""
        outline = section.outline
        parts = [f"项目名称：{outline.project.name}"]
        tender_file = getattr(outline, "source_tender_file", None)
        if tender_file:
            parts.append(f"招标文件：{tender_file.original_name}")
        return "\n".join(parts)

    def _collect_global_fact_titles(self, outline) -> str:
        """收集大纲下全局事实变量标题清单。"""
        from apps.outline.models import GlobalFactGroup
        titles = list(
            GlobalFactGroup.objects.filter(outline=outline).values_list("title", flat=True)
        )
        return "\n".join(titles) if titles else ""

    def _get_parent_chapters_text(self, section: Section) -> str:
        """父章节信息文本。"""
        if not section.parent_id:
            return ""
        parent = Section.objects.filter(pk=section.parent_id).first()
        if not parent:
            return ""
        return f"- {parent.id} {parent.title}\n  {parent.content[:200] if parent.content else ''}"

    def _get_sibling_chapters_text(self, section: Section) -> str:
        """同级章节信息文本（避免重复）。"""
        siblings = Section.objects.filter(
            outline=section.outline, parent_id=section.parent_id,
        ).exclude(pk=section.id).values("id", "title", "content")[:5]
        if not siblings:
            return ""
        lines = ["同级章节信息："]
        for s in siblings:
            lines.append(f"- {s['id']} {s['title']}\n  {(s['content'] or '')[:200]}")
        return "\n".join(lines)

    def resolve_selected_facts(self, section: Section) -> str:
        """根据编排决策的 facts.titles 解析实际事实内容，供正文 prompt 引用。

        借鉴 OpenBidKit resolveGlobalFactsByTitles + formatSelectedGlobalFactsForPrompt。
        """
        from apps.outline.models import GlobalFactGroup

        plan = section.content_plan or {}
        titles = (plan.get("facts") or {}).get("titles") or []
        if not titles:
            return ""
        qs = GlobalFactGroup.objects.filter(outline=section.outline, title__in=titles)
        if not qs.exists():
            return ""
        lines = []
        for f in qs:
            lines.append(f"【{f.title}】\n{f.content}")
        return "\n\n".join(lines)

    def prepare_generation_context(
        self,
        section_id: int,
        analysis_result: dict,
        user_prompt: str,
        user_id: int,
    ) -> dict:
        """准备生成上下文（检索知识库 + 条款）。

        注意：此方法在 Celery 任务内部调用，不传递大段正文。
        """
        from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
        from apps.outline.services.generation_context_service import GenerationContextService
        from apps.outline.services.generation_mode_service import GenerationModeService

        section = Section.objects.select_related("outline__lot").get(pk=section_id)
        user = User.objects.get(pk=user_id)

        generation_mode = GenerationModeService().get_generation_mode(section)

        # 1. RAG 检索（改用 Orchestrator）
        orchestrator = RetrievalOrchestrator()
        rag_context = None
        try:
            rag_context = orchestrator.retrieve_for_section(
                outline=section.outline,
                section=section,
                user=user,
                generation_mode=generation_mode,
                analysis_result=analysis_result,
            )
            rag_materials = self._context_to_legacy_dict(rag_context)
        except Exception as e:
            logger.warning(f"RAG retrieval failed: {e}")
            rag_materials = {}

        # 2. 构建完整生成上下文
        context_service = GenerationContextService()
        context = context_service.build_generation_context(
            section=section, rag_materials=rag_materials,
        )

        # 3. 从最终进 prompt 的 rag_materials 反推 prompt_sources
        prompt_sources = self._extract_prompt_sources(context.get("rag_materials", {}))
        prompt_context = context_service.build_prompt_context(context)
        retrieval_meta = self._build_retrieval_meta(
            rag_context, generation_mode,
            retrieved_count=len(rag_context.sources) if rag_context else 0,
            prompt_count=len(prompt_sources),
        )

        return {
            "section_info": context["current_section"],
            "content_matrix": context["content_matrix"],
            "analysis_points": context["analysis_points"],
            "rag_materials": context["rag_materials"],
            "context_sections": context["context_sections"],
            "outline_structure": context["outline_structure"],
            "project_info": context["project_info"],
            "prompt_context": prompt_context,
            "user_prompt": user_prompt,
            "analysis_result": analysis_result,
            "generation_mode": generation_mode,
            "content_structure_policy": context.get("content_structure_policy"),
            "rag_sources": prompt_sources,
            "retrieval_meta": retrieval_meta,
        }

    def _context_to_legacy_dict(self, context) -> dict[str, list[dict]]:
        """基于 context.fused 分组（保证跨通道融合结果真正进 prompt）。"""
        grouped: dict[str, list[dict]] = {}
        for chunk in context.fused:
            grouped.setdefault(chunk.channel, []).append({
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "document_title": chunk.document_title,
                "title": chunk.document_title,
                "kb_id": chunk.kb_id,
                "knowledge_base_id": chunk.kb_id,
                "kb_name": chunk.kb_name,
                "channel": chunk.channel,
                "score": chunk.score,
                "rank": chunk.rank,
                "content": chunk.content,
                "content_preview": chunk.content_preview,
                "section_path": chunk.section_path,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
            })
        return grouped

    def _extract_prompt_sources(self, rag_materials: dict[str, list[dict]]) -> list[dict]:
        """从最终进 prompt 的 rag_materials 反推来源（Strategy 裁剪后）。"""
        sources = []
        rank = 1
        for channel, materials in rag_materials.items():
            for m in materials:
                sources.append({
                    "chunk_id": m.get("chunk_id"),
                    "document_id": m.get("document_id"),
                    "document_title": m.get("document_title", ""),
                    "kb_id": m.get("kb_id") or m.get("knowledge_base_id"),
                    "kb_name": m.get("kb_name", ""),
                    "channel": channel,
                    "score": round(float(m.get("score", 0.5)), 4),
                    "rank": rank,
                    "section_path": m.get("section_path", ""),
                    "page_start": m.get("page_start"),
                    "page_end": m.get("page_end"),
                })
                rank += 1
        return sources

    def _build_retrieval_meta(self, rag_context, generation_mode,
                              retrieved_count: int, prompt_count: int) -> dict:
        if not rag_context:
            return {
                "retrieval_run_id": "",
                "mode": "retrieval",
                "generation_mode": generation_mode,
                "channels": [],
                "fused_count": 0,
                "retrieved_source_count": 0,
                "prompt_source_count": prompt_count,
                "used_fused_context": True,
                "fallback_to_global": False,
                "fallback_reason": None,
                "warnings": ["rag_context is None"],
                "latency_ms": 0,
            }
        return {
            "retrieval_run_id": rag_context.retrieval_run_id,
            "mode": rag_context.plan.mode,
            "generation_mode": generation_mode,
            "channels": [
                {
                    "channel": cq.channel,
                    "query": cq.query,
                    "kb_ids": cq.kb_ids,
                    "weight": cq.weight,
                    "result_count": len(rag_context.by_channel.get(cq.channel, [])),
                    "fallback": None,
                }
                for cq in rag_context.plan.channel_queries
            ],
            "fused_count": len(rag_context.fused),
            "retrieved_source_count": retrieved_count,
            "prompt_source_count": prompt_count,
            "used_fused_context": True,
            "fallback_to_global": rag_context.plan.fallback_to_global,
            "fallback_reason": None,
            "warnings": rag_context.warnings,
            "latency_ms": rag_context.latency_ms,
        }

    def _get_related_requirements(
        self,
        lot_id: int,
        requirement_types: list[str],
    ) -> list[dict]:
        """获取关联的招标条款。"""
        from apps.requirements.models import TenderRequirement

        if not requirement_types:
            requirements = TenderRequirement.objects.filter(
                tender_file__lot_id=lot_id,
                is_active=True,
            ).order_by("sort_order")[:20]
        else:
            requirements = TenderRequirement.objects.filter(
                tender_file__lot_id=lot_id,
                requirement_type__in=requirement_types,
                is_active=True,
            ).order_by("sort_order")[:20]

        return [
            {
                "requirement_no": r.requirement_no,
                "title": r.title,
                "content": r.content[:500] if r.content else "",  # 摘要
                "requirement_type": r.requirement_type,
            }
            for r in requirements
        ]

    def _get_parent_context(self, section: Section) -> str:
        """获取父章节内容摘要。"""
        ancestors = SectionTreeService().get_ancestors(section.id)
        if not ancestors:
            return ""

        # 只取直接父章节的内容摘要
        parent = ancestors[-1] if ancestors else None
        if parent and parent.content:
            return f"【父章节：{parent.title}】\n{parent.content[:1000]}"

        return ""

    def _get_sibling_context(self, section: Section) -> str:
        """获取同级前置章节摘要（避免内容重复）。"""
        siblings = Section.objects.filter(
            outline=section.outline,
            parent=section.parent,
            sort_order__lt=section.sort_order,
            generation_status=SectionGenerationStatus.SUCCESS,
        ).order_by("sort_order")[:3]

        if not siblings:
            return ""

        context_parts = []
        for s in siblings:
            if s.content:
                context_parts.append(f"【{s.title}】已涵盖：{s.content[:300]}...")

        return "\n".join(context_parts)

    @transaction.atomic
    def generate_section(
        self,
        section_id: int,
        analysis_result: dict,
        user_prompt: str,
        created_by,
        force: bool = False,
    ) -> AsyncTask:
        """生成章节内容（异步）。

        Args:
            section_id: 章节ID
            analysis_result: AI分析结果
            user_prompt: 用户补充提示词
            created_by: 创建人
            force: 是否强制重新生成

        防重逻辑：
        - 如果 generation_status in ["pending", "running"] 且 force=False
          - 返回已有 AsyncTask
        - 如果 generation_status == "running" 且 force=True
          - 不允许覆盖正在运行的任务，抛出异常

        Returns:
            AsyncTask 实例
        """
        from apps.outline.tasks import generate_section_task

        section = Section.objects.select_for_update().get(pk=section_id)

        # 并发防重
        if section.generation_status in [
            SectionGenerationStatus.PENDING,
            SectionGenerationStatus.RUNNING,
        ]:
            if not force:
                # 返回已有任务
                existing_record = SectionGenerationRecord.objects.filter(
                    section=section,
                    status__in=[
                        GenerationRecordStatus.PENDING,
                        GenerationRecordStatus.RUNNING,
                    ],
                ).first()

                if existing_record and existing_record.async_task:
                    return existing_record.async_task

            if section.generation_status == SectionGenerationStatus.RUNNING:
                # force=true 也不得覆盖 running 任务
                raise ValueError("章节正在生成中，请等待完成后再重新生成")

        # 创建 AsyncTask
        async_task = AsyncTask.objects.create(
            task_type="section_generate",
            related_object_type="Section",
            related_object_id=str(section_id),
            input_payload={
                "section_id": section_id,
                "has_analysis": bool(analysis_result),
                "has_user_prompt": bool(user_prompt),
            },
            created_by=created_by,
        )

        # 创建生成记录
        record = SectionGenerationRecord.objects.create(
            section=section,
            async_task=async_task,
            input_summary={
                "keywords": analysis_result.get("keywords", []),
                "requirement_types": analysis_result.get("requirement_types", []),
                "has_user_prompt": bool(user_prompt),
            },
            status=GenerationRecordStatus.PENDING,
            created_by=created_by,
        )

        # 更新章节状态
        section.generation_status = SectionGenerationStatus.PENDING
        section.user_prompt = user_prompt
        section.save()

        # 触发 Celery 任务（不传递大段正文）
        from apps.common.tasks_utils import dispatch_async_task

        dispatch_async_task(
            async_task,
            generate_section_task,
            section_id=section_id,
            record_id=record.id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=created_by.id,
        )

        return async_task

    def get_batch_generation_status(self, outline_id: int) -> dict:
        """获取批量生成状态。

        Args:
            outline_id: 大纲ID

        Returns:
            {
                "task_id": int,
                "status": str,
                "progress": int,
                "current_step": str,
                "total": int,
                "completed": int,
                "failed": int,
                "running": int,
                "sections": [...]
            }
        """
        outline = Outline.objects.get(pk=outline_id)

        # 查找最近的批量生成任务
        latest_record = (
            SectionGenerationRecord.objects.filter(section__outline=outline)
            .exclude(async_task=None)
            .select_related("async_task")
            .order_by("-created_at")
            .first()
        )

        if not latest_record or not latest_record.async_task:
            return {
                "task_id": 0,
                "status": "not_started",
                "progress": 0,
                "current_step": "无任务",
                "total": 0,
                "completed": 0,
                "failed": 0,
                "running": 0,
                "sections": [],
            }

        async_task = latest_record.async_task

        # 统计各状态数量
        records = SectionGenerationRecord.objects.filter(async_task=async_task)
        total = records.count()
        completed = records.filter(status=GenerationRecordStatus.SUCCESS).count()
        failed = records.filter(status=GenerationRecordStatus.FAILED).count()
        running = records.filter(status=GenerationRecordStatus.RUNNING).count()
        pending = records.filter(status=GenerationRecordStatus.PENDING).count()

        # 构建章节状态列表
        sections = [
            {
                "id": r.section_id,
                "title": r.section.title,
                "status": r.status,
            }
            for r in records.select_related("section")
        ]

        return {
            "task_id": async_task.id,
            "status": async_task.status,
            "progress": async_task.progress,
            "current_step": async_task.current_step or f"已完成 {completed}/{total}",
            "total": total,
            "completed": completed,
            "failed": failed,
            "running": running + pending,
            "sections": sections,
        }