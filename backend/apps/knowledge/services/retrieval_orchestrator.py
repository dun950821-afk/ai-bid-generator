# backend/apps/knowledge/services/retrieval_orchestrator.py
"""检索编排服务。

统一收敛 RAG 检索编排：通道规划、查询词生成、跨通道 weighted RRF 融合、
去重、溯源。矩阵阶段用 metadata 模式（零向量），正文阶段用 retrieval 模式。
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

from apps.knowledge.constants import RetrievalMode
from apps.knowledge.services.retrieval_constants import KB_TYPE_TO_CHANNEL

logger = logging.getLogger(__name__)


class ManualSourceMode:
    """手动选源模式。"""
    AUTO = "auto"
    PREFER = "prefer"
    ONLY = "only"


class OrchestratorMode:
    """Orchestrator 模式（区别于 RetrievalMode 检索模式）。"""
    METADATA = "metadata"
    RETRIEVAL = "retrieval"


@dataclass
class ChannelQuery:
    """单通道检索计划。"""
    channel: str
    query: str
    top_k: int
    kb_ids: list[int]
    weight: float = 1.0


@dataclass
class RetrievalPlan:
    """检索计划。"""
    mode: str
    channel_queries: list[ChannelQuery]
    outline_kb_ids: list[int]
    fallback_to_global: bool
    reason: str


@dataclass
class RetrievedChunk:
    """检索结果项。"""
    chunk_id: int
    document_id: int
    document_title: str
    kb_id: int
    kb_name: str
    channel: str
    score: float
    rank: int
    content: str
    content_preview: str
    section_path: str
    page_start: int | None
    page_end: int | None


@dataclass
class RetrievedContext:
    """检索上下文（Orchestrator 统一输出）。"""
    retrieval_run_id: str
    plan: RetrievalPlan
    by_channel: dict[str, list[RetrievedChunk]]
    fused: list[RetrievedChunk]
    sources: list[dict]
    metadata_snapshot: dict
    latency_ms: int
    warnings: list[str] = field(default_factory=list)


class RetrievalOrchestrator:
    """检索编排服务。

    矩阵阶段调 collect_metadata_snapshot（零向量调用）；
    正文阶段调 retrieve_for_section（HYBRID 检索）。
    """

    def resolve_channel(self, knowledge_base) -> str | None:
        """通道解析：kb.rag_channel 优先，否则 KB_TYPE_TO_CHANNEL[kb.kb_type]。"""
        if knowledge_base.rag_channel:
            return knowledge_base.rag_channel
        return KB_TYPE_TO_CHANNEL.get(knowledge_base.kb_type)

    def collect_metadata_snapshot(self, outline, user=None) -> RetrievedContext:
        """矩阵模式：读材料包快照 + RAG 库/文档标题清单，零向量调用。"""
        run_id = str(uuid.uuid4())
        start = time.time()
        warnings: list[str] = []

        kb_ids, fallback = self._get_outline_kb_ids(outline)
        if fallback:
            warnings.append("outline 未绑定知识库，已回退使用全局活跃知识库")

        kbs = self._fetch_bound_kbs(kb_ids)
        available_kbs = self._build_available_kbs(kbs)
        available_doc_titles = self._build_doc_titles(kbs)
        company_snapshot, has_package = self._read_material_package(outline)

        metadata_snapshot = {
            "company_snapshot": company_snapshot,
            "available_knowledge_bases": available_kbs,
            "available_document_titles": available_doc_titles["list"],
            "document_title_truncated": available_doc_titles["truncated"],
            "document_title_total_count": available_doc_titles["total"],
            "document_title_included_count": available_doc_titles["included"],
            "missing_materials": [],
            "has_material_package": has_package,
            "has_kb_bindings": not fallback,
        }

        return RetrievedContext(
            retrieval_run_id=run_id,
            plan=RetrievalPlan(
                mode=OrchestratorMode.METADATA,
                channel_queries=[],
                outline_kb_ids=kb_ids,
                fallback_to_global=fallback,
                reason="metadata snapshot",
            ),
            by_channel={},
            fused=[],
            sources=[],
            metadata_snapshot=metadata_snapshot,
            latency_ms=int((time.time() - start) * 1000),
            warnings=warnings,
        )

    def retrieve_for_section(
        self, outline, section, user=None,
        generation_mode=None, analysis_result=None,
        override_kb_ids=None,
        manual_sources=None, manual_source_mode=ManualSourceMode.AUTO,
    ) -> RetrievedContext:
        """正文模式：plan + execute（Task 7 实现）。"""
        raise NotImplementedError

    def _get_outline_kb_ids(self, outline) -> tuple[list[int], bool]:
        """读取大纲绑定 KB，空则 fallback 全局活跃库。"""
        from apps.outline.models import OutlineKnowledgeBase
        bindings = OutlineKnowledgeBase.objects.filter(
            outline=outline, is_active=True
        ).select_related("knowledge_base")
        kb_ids = [b.knowledge_base_id for b in bindings]
        if kb_ids:
            return kb_ids, False
        fallback_enabled = getattr(settings, "RETRIEVAL_FALLBACK_TO_GLOBAL", True)
        if not fallback_enabled:
            return [], False
        from apps.knowledge.models import KnowledgeBase
        global_ids = list(
            KnowledgeBase.objects.filter(
                is_active=True, is_deleted=False
            ).values_list("id", flat=True)[:10]
        )
        return global_ids, True

    def _fetch_bound_kbs(self, kb_ids: list[int]) -> list:
        from apps.knowledge.models import KnowledgeBase
        return list(KnowledgeBase.objects.filter(id__in=kb_ids, is_deleted=False))

    def _build_available_kbs(self, kbs) -> list[dict]:
        result = []
        for kb in kbs:
            result.append({
                "kb_id": kb.id,
                "kb_name": kb.name,
                "kb_type": kb.kb_type,
                "rag_channel": self.resolve_channel(kb) or "",
                "document_count": kb.document_count,
                "chunk_count": kb.chunk_count,
            })
        return result

    def _build_doc_titles(self, kbs) -> dict:
        from apps.knowledge.models import KnowledgeDocument
        max_per_kb = getattr(settings, "MAX_DOC_TITLES_PER_KB", 10)
        max_total = getattr(settings, "MAX_DOC_TITLES_TOTAL", 80)
        titles = []
        for kb in kbs:
            docs = KnowledgeDocument.objects.filter(
                knowledge_base=kb, is_deleted=False
            ).order_by("-updated_at")[:max_per_kb]
            for doc in docs:
                titles.append({
                    "kb_id": kb.id,
                    "document_id": doc.id,
                    "file_name": doc.file_name,
                    "kb_type": kb.kb_type,
                })
                if len(titles) >= max_total:
                    return {"list": titles, "truncated": True,
                            "total": len(titles), "included": len(titles)}
        return {"list": titles, "truncated": False, "total": len(titles),
                "included": len(titles)}

    def _read_material_package(self, outline) -> tuple:
        """读材料包快照，返回 (company_snapshot, has_package)。

        missing_materials 矩阵阶段为空：材料包模型本身不存 missing，
        missing 是 content_matrix.required_materials 与材料包 items 对比的产物，
        矩阵生成阶段矩阵未生成，对比无意义。正文阶段由 GenerationContextService 单独计算。
        """
        try:
            package = outline.material_package
        except Exception:
            return {}, False
        if not package:
            return {}, False
        return package.company_snapshot or {}, True
