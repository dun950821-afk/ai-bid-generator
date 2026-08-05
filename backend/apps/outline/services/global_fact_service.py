# backend/apps/outline/services/global_fact_service.py
"""全局事实变量提取服务（借鉴 OpenBidKit globalFactsTask.cjs）。

五轮流程：
1. 招标文件分段 → 提取候选事实变量
2. 多段候选 → 合并去重
3. 知识库分段 → 补充事实
4. 原方案分段 → 补充事实（若有）
5. 最终整理 → 输出标准事实变量组

每轮调 AiTaskExecutionService.execute(scenario="global_fact_*")，
失败兜底：单段失败跳过，最终整理失败保留合并结果。
"""

import json
import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.outline.constants import GlobalFactSource, GlobalFactTaskStatus
from apps.outline.models import GlobalFactGroup, Outline

User = get_user_model()
logger = logging.getLogger(__name__)

# 分段字数上限（借鉴 OpenBidKit 单段约 4000 字）
SEGMENT_CHAR_LIMIT = 4000


class GlobalFactService:
    """全局事实变量提取与维护服务。"""

    # ------------------------------------------------------------------
    # 公共 API
    # ------------------------------------------------------------------

    def extract_global_facts(self, outline_id: int, created_by) -> AsyncTask:
        """启动全局事实提取（异步）。

        建 AsyncTask 并触发 Celery 任务。调用方应轮询 AsyncTask 状态。
        """
        from apps.outline.tasks import extract_global_facts_task

        outline = Outline.objects.get(pk=outline_id)

        async_task = AsyncTask.objects.create(
            task_type="global_fact_extract",
            status=AsyncTask.STATUS_PENDING,
            progress=0,
            current_step="初始化",
            related_object_type="Outline",
            related_object_id=str(outline_id),
            input_payload={"outline_id": outline_id},
            created_by=created_by,
        )

        from apps.common.tasks_utils import enqueue_after_commit
        enqueue_after_commit(extract_global_facts_task, outline_id, async_task.id, created_by.id, async_task=async_task)
        return async_task

    def regenerate_single_fact(self, fact_id: int, created_by) -> dict:
        """单条事实变量重新提取（基于已有招标文件全文）。

        返回最新 content；失败抛异常。
        """
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
        )
        from apps.common.services.storage import StorageService

        fact = GlobalFactGroup.objects.select_related("outline").get(pk=fact_id)
        outline = fact.outline

        tender_markdown = self._load_tender_markdown(outline)
        if not tender_markdown:
            raise ValueError("招标文件未解析或解析结果不存在，无法重新提取")

        run = AiTaskExecutionService().execute(
            scenario="global_fact_extract",
            variables={
                "segment_index": 1,
                "segment_total": 1,
                "segment_content": tender_markdown[:SEGMENT_CHAR_LIMIT],
            },
            created_by=created_by,
            business_context={"project_id": outline.project_id} if outline.project_id else {},
        )

        groups = (run.output_json or {}).get("groups", []) if run.status == "succeeded" else []
        matched = next(
            (g for g in groups if g.get("key") == fact.key or g.get("title") == fact.title),
            None,
        )
        if not matched:
            raise ValueError("未能在重新提取结果中找到匹配的事实变量")

        fact.content = matched.get("content", fact.content)
        fact.save(update_fields=["content", "updated_at"])
        return {"id": fact.id, "key": fact.key, "title": fact.title, "content": fact.content}

    def list_facts(self, outline_id: int) -> list[dict]:
        """列出大纲下所有事实变量。"""
        qs = GlobalFactGroup.objects.filter(outline_id=outline_id).order_by("sort_order", "id")
        return [
            {
                "id": f.id,
                "key": f.key,
                "title": f.title,
                "content": f.content,
                "source": f.source,
                "sort_order": f.sort_order,
            }
            for f in qs
        ]

    def update_fact(self, fact_id: int, payload: dict) -> dict:
        """人工修正事实变量（title/content/sort_order）。"""
        update_fields = []
        fact = GlobalFactGroup.objects.get(pk=fact_id)
        if "title" in payload:
            fact.title = payload["title"]
            update_fields.append("title")
        if "content" in payload:
            fact.content = payload["content"]
            update_fields.append("content")
        if "sort_order" in payload:
            fact.sort_order = payload["sort_order"]
            update_fields.append("sort_order")
        if update_fields:
            update_fields.append("updated_at")
            fact.save(update_fields=update_fields)
        return {
            "id": fact.id,
            "key": fact.key,
            "title": fact.title,
            "content": fact.content,
            "source": fact.source,
            "sort_order": fact.sort_order,
        }

    # ------------------------------------------------------------------
    # 分段工具（供 Celery 任务调用）
    # ------------------------------------------------------------------

    def load_tender_segments(self, outline) -> list[dict]:
        """读取招标文件 markdown 并分段。返回 [{index,total,content}]。"""
        markdown = self._load_tender_markdown(outline)
        if not markdown:
            return []
        return self._split_text(markdown, SEGMENT_CHAR_LIMIT)

    def load_knowledge_segments(self, outline) -> list[dict]:
        """从知识库拉取相关条目并分段。

        借鉴 OpenBidKit knowledgeBaseService：检索与项目/大纲相关的知识条目。
        本期简化：通过 RetrievalOrchestrator 检索项目知识库，按 chunk 拼接分段。
        """
        try:
            from apps.knowledge.services.retrieval_orchestrator import (
                RetrievalOrchestrator,
            )
        except ImportError:
            logger.warning("knowledge 模块不可用，跳过知识库补充")
            return []

        try:
            orchestrator = RetrievalOrchestrator()
            # 用大纲名称作为检索 query，拉取项目级知识库片段
            context = orchestrator.retrieve_for_outline(
                outline=outline,
                query=outline.name,
            ) if hasattr(orchestrator, "retrieve_for_outline") else None
        except Exception as e:
            logger.warning(f"知识库检索失败：{e}")
            return []

        if not context or not getattr(context, "sources", None):
            return []

        text = "\n\n".join(
            getattr(src, "content", "") for src in context.sources
        )
        return self._split_text(text, SEGMENT_CHAR_LIMIT) if text.strip() else []

    def load_original_plan_segments(self, outline) -> list[dict] | None:
        """若大纲关联原方案，分块返回；否则返回 None。"""
        # 本期大纲未直接关联原方案，预留接口
        return None

    # ------------------------------------------------------------------
    # 持久化
    # ------------------------------------------------------------------

    @transaction.atomic
    def persist_facts(self, outline_id: int, groups: list[dict], source: str = GlobalFactSource.TENDER):
        """把事实变量组写入数据库（全量替换）。"""
        GlobalFactGroup.objects.filter(outline_id=outline_id).delete()
        objs = [
            GlobalFactGroup(
                outline_id=outline_id,
                key=g.get("key") or g.get("title", "").lower().replace(" ", "_"),
                title=g.get("title", ""),
                content=g.get("content", ""),
                source=source,
                sort_order=idx,
            )
            for idx, g in enumerate(groups)
        ]
        GlobalFactGroup.objects.bulk_create(objs)

    # ------------------------------------------------------------------
    # 内部工具
    # ------------------------------------------------------------------

    def _load_tender_markdown(self, outline) -> str:
        """读取大纲关联招标文件的解析 markdown。"""
        from apps.common.services.storage import StorageService
        from apps.tender.models import ParsedDocument

        tender_file = getattr(outline, "source_tender_file", None)
        if not tender_file:
            return ""
        parsed = ParsedDocument.objects.filter(
            tender_file=tender_file, is_active=True
        ).first()
        if not parsed or not parsed.markdown_uri:
            return ""
        storage = StorageService()
        content = storage.get_object(parsed.markdown_uri)
        return content.decode("utf-8") if content else ""

    def _split_text(self, text: str, limit: int) -> list[dict]:
        """按字符数分块（简单实现，按段落尽量不切断）。"""
        if not text:
            return []
        paragraphs = text.split("\n\n")
        segments: list[str] = []
        current = ""
        for para in paragraphs:
            if len(current) + len(para) + 2 <= limit:
                current = f"{current}\n\n{para}" if current else para
            else:
                if current:
                    segments.append(current)
                # 超长段落硬切
                for i in range(0, len(para), limit):
                    segments.append(para[i : i + limit])
                current = ""
        if current:
            segments.append(current)

        return [
            {"index": idx + 1, "total": len(segments), "content": seg}
            for idx, seg in enumerate(segments)
        ]
