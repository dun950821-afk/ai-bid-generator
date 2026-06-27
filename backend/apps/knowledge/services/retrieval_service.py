# backend/apps/knowledge/services/retrieval_service.py
"""知识检索服务。"""

import jieba
import time
from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import Q, F

from apps.knowledge.constants import RetrievalMode
from apps.knowledge.models import KnowledgeChunk, KnowledgeBase, RetrievalLog


class RetrievalService:
    """知识检索服务。"""

    def search(
        self,
        query: str,
        knowledge_base_ids: list[int] | None = None,
        top_k: int = 10,
        filters: dict | None = None,
        retrieval_mode: str = RetrievalMode.HYBRID,
        created_by=None,
        retrieval_run_id: str | None = None,
        trace_meta: dict | None = None,
    ) -> dict:
        """执行检索。

        Args:
            query: 查询文本
            knowledge_base_ids: 知识库 ID 列表（可选，空则全局范围）
            top_k: 返回数量
            filters: 过滤条件（kb_type 仅作兼容二次过滤，不用于通道选择）
            retrieval_mode: 检索模式（默认 HYBRID）
            created_by: 创建人
            retrieval_run_id: Orchestrator 检索运行 ID（关联 RetrievalLog）
            trace_meta: trace 元数据（channel/kb_ids 等）

        Returns:
            {
                "query": str,
                "results": list[dict],
                "latency_ms": int,
                "log_id": int,
            }
        """
        start_time = time.time()

        # 基础查询
        if knowledge_base_ids:
            base_qs = KnowledgeChunk.objects.filter(
                document__knowledge_base_id__in=knowledge_base_ids,
                document__knowledge_base__is_active=True,
                document__knowledge_base__is_deleted=False,
                document__is_deleted=False,
            ).select_related("document", "document__knowledge_base")
        else:
            base_qs = KnowledgeChunk.objects.filter(
                document__knowledge_base__is_active=True,
                document__knowledge_base__is_deleted=False,
                document__is_deleted=False,
            ).select_related("document", "document__knowledge_base")

        # 应用过滤条件
        if filters:
            if filters.get("kb_type"):
                base_qs = base_qs.filter(document__knowledge_base__kb_type=filters["kb_type"])
            if filters.get("chunk_type"):
                base_qs = base_qs.filter(chunk_type=filters["chunk_type"])

        # 执行检索
        if retrieval_mode == RetrievalMode.HYBRID:
            results = self._hybrid_search(base_qs, query, top_k)
        elif retrieval_mode == RetrievalMode.VECTOR:
            results = self._vector_search(base_qs, query, top_k)
        elif retrieval_mode == RetrievalMode.POSTGRES_FULLTEXT:
            results = self._fulltext_search(base_qs, query, top_k)
        else:
            results = self._keyword_search(base_qs, query, top_k)

        latency_ms = int((time.time() - start_time) * 1000)

        # 记录检索日志
        log = RetrievalLog.objects.create(
            query=query,
            knowledge_bases=knowledge_base_ids or [],
            filters=filters or {},
            top_k=top_k,
            retrieval_mode=retrieval_mode,
            retrieved_chunks=[
                self._chunk_to_log_dict(chunk, i)
                for i, chunk in enumerate(results)
            ],
            latency_ms=latency_ms,
            created_by=created_by,
            retrieval_run_id=retrieval_run_id or "",
            trace_meta=trace_meta or {},
        )

        return {
            "query": query,
            "results": [self._format_result(chunk, i) for i, chunk in enumerate(results)],
            "latency_ms": latency_ms,
            "log_id": log.id,
        }

    def _hybrid_search(self, qs, query: str, top_k: int) -> list:
        """混合检索（向量 + 全文）。

        使用 RRF (Reciprocal Rank Fusion) 融合结果。
        向量生成失败时降级到 FULLTEXT 检索。
        """
        # 向量生成失败 → 降级 FULLTEXT
        query_embedding = self._get_query_embedding(query)
        if query_embedding is None:
            return self._fulltext_search(qs, query, top_k)

        # 获取更多候选以便融合
        candidates_count = min(top_k * 3, 50)

        # 向量检索
        vector_results = self._vector_search(qs, query, candidates_count)
        vector_scores = {chunk.id: rank for rank, chunk in enumerate(vector_results)}

        # 全文检索
        fulltext_results = self._fulltext_search(qs, query, candidates_count)
        fulltext_scores = {chunk.id: rank for rank, chunk in enumerate(fulltext_results)}

        # RRF 融合
        k = 60  # RRF 参数
        all_chunk_ids = set(vector_scores.keys()) | set(fulltext_scores.keys())

        # 获取所有 chunk
        chunks_map = {}
        for chunk in vector_results:
            chunks_map[chunk.id] = chunk
        for chunk in fulltext_results:
            chunks_map[chunk.id] = chunk

        # 计算 RRF 分数
        rrf_scores = []
        for chunk_id in all_chunk_ids:
            vector_rank = vector_scores.get(chunk_id, len(vector_results))
            fulltext_rank = fulltext_scores.get(chunk_id, len(fulltext_results))

            rrf_score = 1 / (k + vector_rank + 1) + 1 / (k + fulltext_rank + 1)
            rrf_scores.append((chunk_id, rrf_score))

        # 按分数排序
        rrf_scores.sort(key=lambda x: x[1], reverse=True)

        # 返回 top_k 结果
        results = []
        for chunk_id, score in rrf_scores[:top_k]:
            chunk = chunks_map.get(chunk_id)
            if chunk:
                # 附加融合分数
                chunk.hybrid_score = score
                results.append(chunk)

        return results

    def _vector_search(self, qs, query: str, top_k: int) -> list:
        """向量检索（语义相似度）。"""
        # 生成查询向量
        query_embedding = self._get_query_embedding(query)
        if query_embedding is None:
            # 向量生成失败，降级到全文检索
            return self._fulltext_search(qs, query, top_k)

        # 使用 pgvector 的余弦距离
        from pgvector.django import CosineDistance

        results = list(
            qs.filter(embedding__isnull=False)
            .annotate(
                distance=CosineDistance("embedding", query_embedding)
            )
            .order_by("distance")[:top_k]
        )

        # 将距离转换为相似度分数
        for chunk in results:
            chunk.rank = 1 - getattr(chunk, "distance", 0)

        return results

    def _get_query_embedding(self, query: str) -> list[float] | None:
        """获取查询文本的向量。"""
        try:
            from apps.knowledge.services.embedding_service import EmbeddingService
            service = EmbeddingService()
            result = service.embed([query])
            if result["vectors"]:
                return result["vectors"][0]
        except Exception:
            pass
        return None

    def _fulltext_search(self, qs, query: str, top_k: int) -> list:
        """PostgreSQL 全文检索。"""
        # 对 query 也做 jieba 增强
        enhanced_query = self._prepare_search_query_text(query)
        search_query = SearchQuery(enhanced_query, config="simple")

        # 先转 list
        results = list(
            qs.annotate(
                rank=SearchRank(F("search_vector"), search_query)
            ).filter(
                search_vector=search_query
            ).order_by("-rank")[:top_k]
        )

        # 兜底：LIKE 匹配
        if len(results) < top_k:
            existing_ids = [chunk.id for chunk in results]
            like_results = self._keyword_search(
                qs.exclude(id__in=existing_ids),
                query,
                top_k - len(results),
            )
            results.extend(like_results)

        return results

    def _keyword_search(self, qs, query: str, top_k: int) -> list:
        """关键词匹配（兜底）。"""
        # jieba 分词
        keywords = [kw for kw in jieba.lcut(query) if len(kw.strip()) >= 2]
        if not keywords:
            keywords = [query]

        # 限制关键词数量，避免 OR 条件过多
        keywords = keywords[:8]

        q_objects = Q()
        for kw in keywords:
            q_objects |= Q(content__icontains=kw) | Q(bm25_text__icontains=kw)

        return list(
            qs.filter(q_objects)
            .order_by("document_id", "chunk_index")[:top_k]
        )

    def _prepare_search_query_text(self, query: str) -> str:
        """增强搜索查询文本。"""
        words = [kw for kw in jieba.lcut(query) if kw.strip()]
        return f"{query} {' '.join(words)}"

    def _format_result(self, chunk: KnowledgeChunk, rank: int) -> dict:
        """格式化检索结果。"""
        content = chunk.content
        content_preview = content[:500] + ("..." if len(content) > 500 else "")

        return {
            "chunk_id": chunk.id,
            "document_id": chunk.document.id,
            "document_title": chunk.document.file_name,
            "knowledge_base_id": chunk.document.knowledge_base.id,
            "knowledge_base_name": chunk.document.knowledge_base.name,
            "kb_type": chunk.document.knowledge_base.kb_type,
            "score": float(getattr(chunk, "rank", 0.5) or 0),
            "rank": rank + 1,
            "title": chunk.title,
            "section_path": chunk.section_path,
            "content": content,
            "content_preview": content_preview,
            "full_content_length": len(content),
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
        }

    def _chunk_to_log_dict(self, chunk: KnowledgeChunk, rank: int) -> dict:
        """转换为日志存储格式。"""
        return {
            "chunk_id": chunk.id,
            "document_id": chunk.document.id,
            "score": float(getattr(chunk, "rank", 0.5) or 0),
            "rank": rank + 1,
            "section_path": chunk.section_path,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
        }