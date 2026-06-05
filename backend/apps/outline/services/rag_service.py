# backend/apps/outline/services/rag_service.py
"""正文生成 RAG 检索服务。"""

import logging
from typing import Any

from django.contrib.auth import get_user_model

from apps.knowledge.constants import RetrievalMode
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.outline.models import Section

User = get_user_model()
logger = logging.getLogger(__name__)


class RagService:
    """正文生成 RAG 检索服务。

    根据章节类型和内容，分通道检索 RAG 素材。

    通道定义：
    - historical_bid：历史标书参考
    - company_info：公司信息
    - personnel：人员资料
    - certificate：资质证书
    - project_case：项目业绩
    """

    # 知识库类型 → RAG 通道映射
    KB_TYPE_TO_CHANNEL = {
        "bid_document": "historical_bid",
        "company": "company_info",
        "personnel": "personnel",
        "certificate": "certificate",
        "project_case": "project_case",
    }

    # 章节角色 → 检索通道映射
    SECTION_ROLE_TO_CHANNELS = {
        "qualification": ["certificate", "company_info"],
        "technical_solution": ["company_info", "historical_bid", "project_case"],
        "business_response": ["company_info", "historical_bid"],
        "service_plan": ["company_info", "historical_bid", "project_case"],
        "team_intro": ["personnel", "certificate"],
        "attachment": [],
        "other": ["company_info", "historical_bid"],
    }

    # 关键词 → 检索通道映射
    KEYWORD_TO_CHANNEL = {
        "资质": "certificate",
        "证书": "certificate",
        "认证": "certificate",
        "业绩": "project_case",
        "案例": "project_case",
        "项目经验": "project_case",
        "人员": "personnel",
        "团队": "personnel",
        "简历": "personnel",
        "技术方案": "historical_bid",
        "方案": "historical_bid",
        "公司": "company_info",
        "企业": "company_info",
    }

    def retrieve_for_section(
        self,
        section: Section,
        knowledge_base_ids: list[int] | None = None,
        user=None,
        top_k_per_channel: int = 5,
        generation_mode: str | None = None,
    ) -> dict[str, list[dict]]:
        """为章节检索 RAG 素材。

        Args:
            section: 章节实例
            knowledge_base_ids: 知识库 ID 列表（可选）
            user: 用户实例
            top_k_per_channel: 每个通道返回数量
            generation_mode: 生成模式（可选，用于严格控制通道）

        Returns:
            按通道分组的检索结果
        """
        # 1. 确定检索通道
        channels = self._determine_channels(section, generation_mode)

        # 2. 获取知识库
        if not knowledge_base_ids:
            knowledge_base_ids = self._get_project_knowledge_bases(section)

        if not knowledge_base_ids:
            logger.warning(f"No knowledge bases found for section {section.id}")
            return {channel: [] for channel in channels}

        # 3. 构建检索查询
        query = self._build_search_query(section)

        # 4. 分通道检索
        results = {}
        for channel in channels:
            channel_results = self._search_channel(
                query=query,
                channel=channel,
                knowledge_base_ids=knowledge_base_ids,
                user=user,
                top_k=top_k_per_channel,
            )
            results[channel] = channel_results

        # 5. 如果是严格模式，对结果进行二次过滤
        if generation_mode and generation_mode.startswith("strict_"):
            results = self._filter_rag_materials_by_mode(results, generation_mode)

        return results

    def _determine_channels(
        self,
        section: Section,
        generation_mode: str | None = None,
    ) -> list[str]:
        """确定需要检索的通道。

        Args:
            section: 章节实例
            generation_mode: 生成模式（可选，用于严格控制通道）

        Returns:
            通道列表
        """
        content_matrix = section.content_matrix or {}
        title = section.title or ""

        # 1. 如果提供了 generation_mode，优先使用严格模式通道
        if generation_mode:
            strict_channels = self._get_strict_mode_channels(
                generation_mode, title, content_matrix
            )
            if strict_channels is not None:
                logger.info(
                    f"Using strict mode channels for section {section.id}: "
                    f"mode={generation_mode}, channels={strict_channels}"
                )
                return strict_channels

        # 2. 默认通道推断逻辑
        channels = set()

        # 从 section_role 推断
        section_role = content_matrix.get("section_role", "other")
        if section_role in self.SECTION_ROLE_TO_CHANNELS:
            channels.update(self.SECTION_ROLE_TO_CHANNELS[section_role])

        # 从标题关键词推断
        for keyword, channel in self.KEYWORD_TO_CHANNEL.items():
            if keyword in title:
                channels.add(channel)

        # 从 write_scope 关键词推断
        write_scope = content_matrix.get("write_scope", "")
        for keyword, channel in self.KEYWORD_TO_CHANNEL.items():
            if keyword in write_scope:
                channels.add(channel)

        # 默认通道
        if not channels:
            channels = {"company_info", "historical_bid"}

        return list(channels)

    def _get_strict_mode_channels(
        self,
        generation_mode: str,
        title: str,
        content_matrix: dict,
    ) -> list[str] | None:
        """获取严格模式的通道白名单。

        Args:
            generation_mode: 生成模式
            title: 章节标题
            content_matrix: 内容责任矩阵

        Returns:
            通道白名单，如果不在严格模式则返回 None
        """
        # 严格资格证明类：只能用公司信息和证书材料
        if generation_mode == "strict_qualification":
            return ["company_info", "certificate"]

        # 严格表格类：根据标题决定
        if generation_mode == "strict_table":
            if any(k in title for k in ["营业执照", "法人证书", "资格", "证书", "基本信息"]):
                return ["company_info", "certificate"]
            if any(k in title for k in ["人员", "简历"]):
                return ["personnel"]
            return ["company_info"]

        # 承诺函不应使用历史案例
        if generation_mode == "strict_commitment":
            return ["company_info"]

        # 索引类一般不需要 RAG
        if generation_mode == "strict_attachment_index":
            return []

        # 简历类
        if generation_mode == "strict_resume":
            return ["personnel"]

        # 其他情况返回 None，表示使用默认逻辑
        return None

    def _filter_rag_materials_by_mode(
        self,
        rag_materials: dict[str, list[dict]],
        generation_mode: str,
    ) -> dict[str, list[dict]]:
        """按生成模式二次过滤 RAG 素材。

        Args:
            rag_materials: 原始 RAG 素材
            generation_mode: 生成模式

        Returns:
            过滤后的 RAG 素材
        """
        from apps.outline.services.generation_context_service import (
            STRICT_MODE_FORBIDDEN_TERMS,
        )

        forbidden_terms = STRICT_MODE_FORBIDDEN_TERMS.get(generation_mode, [])
        if not forbidden_terms:
            return rag_materials

        filtered = {}
        for channel, materials in rag_materials.items():
            filtered[channel] = []
            for item in materials:
                text = f"{item.get('title', '')} {item.get('content', '')}"
                # 如果素材包含禁止词，跳过
                if any(k in text for k in forbidden_terms):
                    continue
                filtered[channel].append(item)

        return filtered

    def _get_project_knowledge_bases(self, section: Section) -> list[int]:
        """获取项目关联的知识库。"""
        from apps.knowledge.models import KnowledgeBase

        # 返回所有活跃知识库
        return list(
            KnowledgeBase.objects.filter(
                is_active=True,
                is_deleted=False,
            ).values_list("id", flat=True)[:10]
        )

    def _build_search_query(self, section: Section) -> str:
        """构建检索查询。"""
        parts = []

        # 章节标题
        if section.title:
            parts.append(section.title)

        # write_scope
        content_matrix = section.content_matrix or {}
        write_scope = content_matrix.get("write_scope", "")
        if write_scope:
            parts.append(write_scope[:200])

        # 关键词（从关联条款提取）
        from apps.outline.services.requirement_match_service import (
            RequirementMatchService,
        )

        match_service = RequirementMatchService()
        matched = match_service.get_matched_requirements(section)

        keywords = match_service.get_requirement_keywords(
            matched.get("all_matched", [])[:5]
        )
        parts.extend(keywords[:10])

        return " ".join(parts)

    def _search_channel(
        self,
        query: str,
        channel: str,
        knowledge_base_ids: list[int],
        user,
        top_k: int,
    ) -> list[dict]:
        """检索指定通道的素材。"""
        from apps.knowledge.models import KnowledgeBase

        # 获取通道对应的知识库类型
        kb_type = self._get_kb_type_for_channel(channel)
        if not kb_type:
            return []

        # 过滤知识库
        kb_ids = list(
            KnowledgeBase.objects.filter(
                id__in=knowledge_base_ids,
                kb_type=kb_type,
            ).values_list("id", flat=True)
        )

        if not kb_ids:
            # 如果没有匹配的知识库，使用全部知识库
            kb_ids = knowledge_base_ids

        try:
            retrieval_service = RetrievalService()
            result = retrieval_service.search(
                query=query,
                knowledge_base_ids=kb_ids,
                top_k=top_k,
                filters={"kb_type": kb_type} if kb_type else None,
                created_by=user,
            )

            return self._format_channel_results(result.get("results", []), channel)

        except Exception as e:
            logger.error(f"RAG search failed for channel {channel}: {e}")
            return []

    def _get_kb_type_for_channel(self, channel: str) -> str | None:
        """获取通道对应的知识库类型。"""
        reverse_map = {v: k for k, v in self.KB_TYPE_TO_CHANNEL.items()}
        return reverse_map.get(channel)

    def _format_channel_results(
        self,
        results: list[dict],
        channel: str,
    ) -> list[dict]:
        """格式化通道检索结果。"""
        formatted = []
        for r in results:
            formatted.append({
                "chunk_id": r.get("chunk_id"),
                "document_id": r.get("document_id"),
                "document_title": r.get("document_title"),
                "title": r.get("title", ""),
                "content": r.get("content", ""),
                "content_preview": r.get("content_preview", ""),
                "score": r.get("score", 0),
                "section_path": r.get("section_path", ""),
                "page_start": r.get("page_start"),
                "page_end": r.get("page_end"),
                "channel": channel,
            })
        return formatted

    def retrieve_by_keywords(
        self,
        keywords: list[str],
        knowledge_base_ids: list[int],
        channels: list[str] | None = None,
        user=None,
        top_k: int = 10,
    ) -> dict[str, list[dict]]:
        """按关键词检索 RAG 素材。

        Args:
            keywords: 关键词列表
            knowledge_base_ids: 知识库 ID 列表
            channels: 指定通道（可选）
            user: 用户实例
            top_k: 每个通道返回数量

        Returns:
            按通道分组的检索结果
        """
        if not channels:
            channels = list(set(self.KB_TYPE_TO_CHANNEL.values()))

        query = " ".join(keywords)
        results = {}

        for channel in channels:
            channel_results = self._search_channel(
                query=query,
                channel=channel,
                knowledge_base_ids=knowledge_base_ids,
                user=user,
                top_k=top_k,
            )
            results[channel] = channel_results

        return results
