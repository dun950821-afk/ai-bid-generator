# backend/apps/outline/services/rag_service.py
"""RAG 检索兼容层。

⚠️ 禁止新增检索编排逻辑。通道规划、查询词生成、跨通道融合、元数据快照
   统一进入 RetrievalOrchestrator。本文件仅做旧接口兼容与格式转换。
"""

import logging

from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
from apps.outline.models import Section

logger = logging.getLogger(__name__)


class RagService:
    """兼容旧接口的薄封装。

    保留 retrieve_for_section 旧签名，内部转调 RetrievalOrchestrator，
    返回 dict[str, list[dict]] 供 GenerationContextService 各 Strategy 使用。
    """

    def retrieve_for_section(
        self,
        section: Section,
        knowledge_base_ids: list[int] | None = None,
        user=None,
        top_k_per_channel: int = 5,
        generation_mode: str | None = None,
    ) -> dict[str, list[dict]]:
        orchestrator = RetrievalOrchestrator()
        try:
            context = orchestrator.retrieve_for_section(
                outline=section.outline,
                section=section,
                user=user,
                generation_mode=generation_mode,
                override_kb_ids=knowledge_base_ids,
            )
        except Exception as e:
            logger.warning(f"Orchestrator retrieval failed: {e}")
            return {}
        return self._context_to_legacy_dict(context)

    def retrieve_by_keywords(
        self,
        keywords: list[str],
        knowledge_base_ids: list[int],
        channels: list[str] | None = None,
        user=None,
        top_k: int = 10,
    ) -> dict[str, list[dict]]:
        """旧接口：按关键词检索（直接走 RetrievalService）。"""
        from apps.knowledge.services.retrieval_service import RetrievalService
        from apps.knowledge.constants import RetrievalMode

        query = " ".join(keywords)
        service = RetrievalService()
        result = service.search(
            query=query,
            knowledge_base_ids=knowledge_base_ids,
            top_k=top_k,
            retrieval_mode=RetrievalMode.HYBRID,
            created_by=user,
        )
        return {"_default": result.get("results", [])}

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
