# backend/apps/outline/services/section_generation_service.py
"""章节生成编排服务。"""

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
        from apps.knowledge.services.retrieval_service import RetrievalService

        section = Section.objects.select_related("outline__lot").get(pk=section_id)
        outline = section.outline
        user = User.objects.get(pk=user_id)

        # 1. 检索知识库
        keywords = analysis_result.get("keywords", [])
        knowledge_base_ids = self._get_project_knowledge_bases(outline.lot.project_id)

        retrieved_knowledge = ""
        if knowledge_base_ids and keywords:
            try:
                retrieval_result = RetrievalService().search(
                    query=" ".join(keywords),
                    knowledge_base_ids=knowledge_base_ids,
                    top_k=10,
                    created_by=user,
                )
                # Build RAG context
                from apps.knowledge.services.rag_context_builder import RagContextBuilder
                retrieved_knowledge = RagContextBuilder().build(
                    retrieval_results=retrieval_result["results"],
                    max_tokens=4000,
                )["text"]
            except Exception as e:
                logger.warning(f"Knowledge retrieval failed: {e}")

        # 2. 获取关联条款
        related_requirements = self._get_related_requirements(
            outline.lot_id,
            analysis_result.get("requirement_types", []),
        )

        # 3. 获取父章节和前置章节内容（保持连贯性，避免重复）
        parent_context = self._get_parent_context(section)
        sibling_context = self._get_sibling_context(section)

        return {
            "section_info": {
                "title": section.title,
                "level": section.level,
                "sort_order": section.sort_order,
                "section_id": section_id,
            },
            "retrieved_knowledge": retrieved_knowledge,
            "related_requirements": related_requirements,
            "parent_context": parent_context,
            "sibling_context": sibling_context,
            "user_prompt": user_prompt,
            "analysis_result": analysis_result,
            "outline_name": outline.name,
            "lot_name": outline.lot.name,
        }

    def _get_project_knowledge_bases(self, project_id: int) -> list[int]:
        """获取项目关联的知识库。"""
        from apps.knowledge.models import KnowledgeBase

        # 第一版返回全局活跃知识库
        return list(
            KnowledgeBase.objects.filter(is_active=True).values_list("id", flat=True)[
                :5
            ]
        )

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
        generate_section_task.delay(
            section_id=section_id,
            record_id=record.id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=created_by.id,
        )

        return async_task

    def generate_sections_batch(
        self,
        outline_id: int,
        created_by,
    ) -> AsyncTask:
        """批量生成大纲的所有章节。

        Args:
            outline_id: 大纲ID
            created_by: 创建人

        Returns:
            AsyncTask 实例
        """
        from apps.outline.tasks import generate_sections_batch_task

        outline = Outline.objects.get(pk=outline_id)
        sections = Section.objects.filter(outline=outline).order_by("sort_order")

        if not sections.exists():
            raise ValueError("大纲没有章节")

        # 创建 AsyncTask
        async_task = AsyncTask.objects.create(
            task_type="outline_generate_batch",
            related_object_type="Outline",
            related_object_id=str(outline_id),
            input_payload={
                "outline_id": outline_id,
                "section_count": sections.count(),
            },
            created_by=created_by,
        )

        # 为每个章节创建生成记录
        for section in sections:
            SectionGenerationRecord.objects.create(
                section=section,
                async_task=async_task,
                input_summary={},
                status=GenerationRecordStatus.PENDING,
                created_by=created_by,
            )
            # 更新章节状态
            section.generation_status = SectionGenerationStatus.PENDING
            section.save()

        # 触发批量任务
        generate_sections_batch_task.delay(
            outline_id=outline_id,
            async_task_id=async_task.id,
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