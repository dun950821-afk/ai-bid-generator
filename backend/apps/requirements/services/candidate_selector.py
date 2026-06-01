# backend/apps/requirements/services/candidate_selector.py
"""候选分块筛选器。"""

from apps.tender.constants import ChunkType
from apps.tender.models import TenderChunk


# 候选 chunk_type 列表
CANDIDATE_CHUNK_TYPES = [
    ChunkType.QUALIFICATION,
    ChunkType.SCORING,
    ChunkType.TECH_REQ,
    ChunkType.COMMERCIAL,
    ChunkType.LEGAL,
    ChunkType.SUBMISSION,
    ChunkType.CLARIFICATION,
]

# 关键词兜底
MANDATORY_KEYWORDS = [
    "必须", "须", "应", "不得", "需提供", "证明材料", "承诺函",
    "加盖公章", "截止时间", "保证金", "评分", "分值",
    "实质性响应", "不接受偏离", "★", "※", "●",
]


class CandidateSelector:
    """候选分块筛选器。

    从 TenderChunk 中筛选可能包含条款的候选分块。
    """

    def select_candidates(
        self,
        parsed_document_id: int,
        mode: str = "hybrid",
    ) -> list[TenderChunk]:
        """筛选候选分块。

        Args:
            parsed_document_id: 解析文档 ID
            mode: 筛选模式
                - rule: 仅规则筛选
                - llm: 返回所有分块（由 LLM 决定）
                - hybrid: 规则筛选（默认）

        Returns:
            候选分块列表
        """
        base_qs = TenderChunk.objects.filter(
            parsed_document_id=parsed_document_id,
        ).select_related("parsed_document").order_by("chunk_index")

        if mode == "llm":
            # LLM 模式：返回所有分块（限制数量）
            return list(base_qs[:50])

        # rule / hybrid 模式：规则筛选
        return self._filter_by_rules(base_qs)

    def _filter_by_rules(self, qs) -> list[TenderChunk]:
        """规则筛选。

        规则：
        1. chunk_type 在候选类型列表中
        2. is_mandatory=True 或 has_score=True
        3. 内容包含强制关键词
        """
        candidates = []

        # 类型筛选
        type_filtered = qs.filter(chunk_type__in=CANDIDATE_CHUNK_TYPES)

        # 特征标记筛选
        feature_filtered = qs.filter(
            is_mandatory=True,
        ) | qs.filter(
            has_score=True,
        )

        # 合并查询结果
        chunk_ids = set()
        for chunk in type_filtered:
            chunk_ids.add(chunk.id)
            candidates.append(chunk)

        for chunk in feature_filtered:
            if chunk.id not in chunk_ids:
                chunk_ids.add(chunk.id)
                candidates.append(chunk)

        # 关关键词兜底（扫描所有分块）
        all_chunks = qs.exclude(id__in=chunk_ids)
        for chunk in all_chunks:
            if self._contains_mandatory_keywords(chunk.content):
                candidates.append(chunk)

        # 按序号排序
        candidates.sort(key=lambda x: x.chunk_index)

        # 限制数量避免过长
        return candidates[:100]

    def _contains_mandatory_keywords(self, content: str) -> bool:
        """检查内容是否包含强制关键词。"""
        for keyword in MANDATORY_KEYWORDS:
            if keyword in content:
                return True
        return False