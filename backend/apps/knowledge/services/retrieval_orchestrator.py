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
        """正文模式：plan + execute。"""
        run_id = str(uuid.uuid4())
        start = time.time()
        warnings: list[str] = []

        plan = self._plan_retrieval(
            outline, section, user, generation_mode, analysis_result, override_kb_ids
        )
        if plan.fallback_to_global:
            warnings.append(f"fallback: {plan.reason}")

        ctx = self._execute(plan, user, run_id, manual_sources, manual_source_mode)
        ctx.warnings.extend(warnings)
        ctx.latency_ms = int((time.time() - start) * 1000)
        return ctx

    def _plan_retrieval(self, outline, section, user, generation_mode,
                       analysis_result, override_kb_ids) -> RetrievalPlan:
        from apps.knowledge.services.retrieval_constants import (
            SECTION_ROLE_TO_CHANNELS, KEYWORD_TO_CHANNEL, STRICT_MODE_CHANNELS,
            CHANNEL_WEIGHTS,
        )

        if override_kb_ids:
            kb_ids = override_kb_ids
            fallback = False
        else:
            kb_ids, fallback = self._get_outline_kb_ids(outline)

        kbs = self._fetch_bound_kbs(kb_ids)
        kb_by_channel: dict[str, list[int]] = {}
        for kb in kbs:
            ch = self.resolve_channel(kb)
            if ch:
                kb_by_channel.setdefault(ch, []).append(kb.id)

        channels = self._determine_channels(section, generation_mode, kb_by_channel)
        query = self._build_search_query(section, analysis_result)

        channel_queries = []
        for ch in channels:
            kb_ids_for_channel = kb_by_channel.get(ch, [kb.id for kb in kbs])
            channel_queries.append(ChannelQuery(
                channel=ch,
                query=query,
                top_k=5,
                kb_ids=kb_ids_for_channel,
                weight=CHANNEL_WEIGHTS.get(ch, 1.0),
            ))

        return RetrievalPlan(
            mode=OrchestratorMode.RETRIEVAL,
            channel_queries=channel_queries,
            outline_kb_ids=kb_ids,
            fallback_to_global=fallback,
            reason=f"channels={channels}, mode={generation_mode or 'default'}",
        )

    def _determine_channels(self, section, generation_mode, kb_by_channel) -> list[str]:
        from apps.knowledge.services.retrieval_constants import (
            SECTION_ROLE_TO_CHANNELS, KEYWORD_TO_CHANNEL, STRICT_MODE_CHANNELS,
        )
        if generation_mode and generation_mode in STRICT_MODE_CHANNELS:
            return STRICT_MODE_CHANNELS[generation_mode]
        if generation_mode == "strict_table":
            title = section.title or ""
            if any(k in title for k in ["营业执照", "法人证书", "资格", "证书", "基本信息"]):
                return ["company_info", "certificate"]
            if any(k in title for k in ["人员", "简历"]):
                return ["personnel"]
            return ["company_info"]
        channels = set()
        matrix = section.content_matrix or {}
        role = matrix.get("section_role", "other")
        if role in SECTION_ROLE_TO_CHANNELS:
            channels.update(SECTION_ROLE_TO_CHANNELS[role])
        title = section.title or ""
        write_scope = matrix.get("write_scope", "")
        for kw, ch in KEYWORD_TO_CHANNEL.items():
            if kw in title or kw in write_scope:
                channels.add(ch)
        if not channels:
            channels = {"company_info", "historical_bid"}
        if kb_by_channel:
            channels = {ch for ch in channels if ch in kb_by_channel} or channels
        return list(channels)

    def _build_search_query(self, section, analysis_result) -> str:
        parts = [section.title or ""]
        matrix = section.content_matrix or {}
        write_scope = matrix.get("write_scope", "")
        if write_scope:
            parts.append(write_scope[:200])
        if analysis_result:
            keywords = analysis_result.get("keywords", [])
            parts.extend(keywords[:10])
        return " ".join(p for p in parts if p)

    def _execute(self, plan: RetrievalPlan, user, run_id, manual_sources,
                 manual_source_mode) -> RetrievedContext:
        from apps.knowledge.services.retrieval_service import RetrievalService

        if manual_source_mode == ManualSourceMode.ONLY and manual_sources:
            return self._build_manual_only_context(plan, run_id, manual_sources)

        retrieval_service = RetrievalService()
        by_channel: dict[str, list[RetrievedChunk]] = {}

        for cq in plan.channel_queries:
            if not cq.kb_ids:
                continue
            try:
                result = retrieval_service.search(
                    query=cq.query,
                    knowledge_base_ids=cq.kb_ids,
                    top_k=cq.top_k,
                    retrieval_mode=RetrievalMode.HYBRID,
                    created_by=user,
                    retrieval_run_id=run_id,
                    trace_meta={"channel": cq.channel, "kb_ids": cq.kb_ids},
                )
                by_channel[cq.channel] = self._to_retrieved_chunks(
                    result.get("results", []), cq.channel
                )
            except Exception as e:
                logger.warning(f"Channel {cq.channel} retrieval failed: {e}")
                by_channel[cq.channel] = []

        fused = self._fuse_channels(by_channel, plan.channel_queries)
        fused = self._dedup(fused)[:8]

        if manual_source_mode == ManualSourceMode.PREFER and manual_sources:
            manual_chunks = self._manual_to_chunks(manual_sources)
            existing_ids = {c.chunk_id for c in fused}
            for mc in manual_chunks:
                if mc.chunk_id not in existing_ids:
                    fused.insert(0, mc)

        return RetrievedContext(
            retrieval_run_id=run_id,
            plan=plan,
            by_channel=by_channel,
            fused=fused,
            sources=self._build_sources(fused),
            metadata_snapshot={},
            latency_ms=0,
            warnings=[],
        )

    def _to_retrieved_chunks(self, results: list[dict], channel: str) -> list[RetrievedChunk]:
        chunks = []
        for r in results:
            chunks.append(RetrievedChunk(
                chunk_id=r.get("chunk_id", 0),
                document_id=r.get("document_id", 0),
                document_title=r.get("document_title", ""),
                kb_id=r.get("knowledge_base_id", 0),
                kb_name=r.get("knowledge_base_name", ""),
                channel=channel,
                score=float(r.get("score", 0.5)),
                rank=r.get("rank", 0),
                content=r.get("content", ""),
                content_preview=r.get("content_preview", ""),
                section_path=r.get("section_path", ""),
                page_start=r.get("page_start"),
                page_end=r.get("page_end"),
            ))
        return chunks

    def _fuse_channels(self, by_channel, channel_queries) -> list[RetrievedChunk]:
        """跨通道 weighted RRF。"""
        weights = {cq.channel: cq.weight for cq in channel_queries}
        k = 60
        rrf: dict[int, float] = {}
        chunk_map: dict[int, RetrievedChunk] = {}
        for channel, chunks in by_channel.items():
            weight = weights.get(channel, 1.0)
            for rank, chunk in enumerate(chunks):
                rrf[chunk.chunk_id] = rrf.get(chunk.chunk_id, 0) + weight / (k + rank + 1)
                chunk_map[chunk.chunk_id] = chunk
        sorted_ids = sorted(rrf.items(), key=lambda x: x[1], reverse=True)
        result = []
        for i, (chunk_id, score) in enumerate(sorted_ids):
            chunk = chunk_map[chunk_id]
            chunk.score = score
            chunk.rank = i + 1
            result.append(chunk)
        return result

    def _dedup(self, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        seen = set()
        result = []
        for chunk in chunks:
            if chunk.chunk_id in seen:
                continue
            seen.add(chunk.chunk_id)
            result.append(chunk)
        return result

    def _build_sources(self, fused: list[RetrievedChunk]) -> list[dict]:
        return [{
            "chunk_id": c.chunk_id,
            "document_id": c.document_id,
            "document_title": c.document_title,
            "kb_id": c.kb_id,
            "kb_name": c.kb_name,
            "channel": c.channel,
            "score": round(c.score, 4),
            "rank": c.rank,
            "section_path": c.section_path,
            "page_start": c.page_start,
            "page_end": c.page_end,
        } for c in fused]

    def _manual_to_chunks(self, manual_sources: list[dict]) -> list[RetrievedChunk]:
        chunks = []
        for i, m in enumerate(manual_sources):
            chunks.append(RetrievedChunk(
                chunk_id=m.get("chunk_id", 0),
                document_id=m.get("document_id", 0),
                document_title=m.get("document_title", ""),
                kb_id=m.get("kb_id", 0),
                kb_name=m.get("kb_name", ""),
                channel=m.get("channel", "company_info"),
                score=float(m.get("score", 1.0)),
                rank=i + 1,
                content=m.get("content", ""),
                content_preview=m.get("content_preview", ""),
                section_path=m.get("section_path", ""),
                page_start=m.get("page_start"),
                page_end=m.get("page_end"),
            ))
        return chunks

    def _build_manual_only_context(self, plan, run_id, manual_sources) -> RetrievedContext:
        chunks = self._manual_to_chunks(manual_sources)
        by_channel: dict[str, list[RetrievedChunk]] = {}
        for c in chunks:
            by_channel.setdefault(c.channel, []).append(c)
        return RetrievedContext(
            retrieval_run_id=run_id,
            plan=plan,
            by_channel=by_channel,
            fused=chunks,
            sources=self._build_sources(chunks),
            metadata_snapshot={},
            latency_ms=0,
            warnings=["manual_only mode, vector search skipped"],
        )

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
