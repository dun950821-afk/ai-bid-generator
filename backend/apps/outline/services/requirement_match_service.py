# backend/apps/outline/services/requirement_match_service.py
"""章节-条款匹配服务。"""

import logging
from typing import Any

from django.db import models
from django.db.models import Case, F, FloatField, Q, Value, When

from apps.outline.models import Section
from apps.requirements.models import TenderRequirement

logger = logging.getLogger(__name__)


class RequirementMatchService:
    """章节-条款匹配服务。

    根据 content_matrix.related_requirements 或自动匹配规则，
    为章节找到对应的 AI 解析内容（TenderRequirement）。
    """

    # 章节角色 → 条款类型映射
    SECTION_ROLE_TO_REQ_TYPE = {
        "qualification": ["qualification", "mandatory"],
        "technical_solution": ["technical", "scoring"],
        "business_response": ["commercial", "scoring"],
        "service_plan": ["technical", "scoring"],
        "team_intro": ["qualification"],
        "attachment": ["submission"],
    }

    # 关键词 → 条款类型映射
    KEYWORD_TO_REQ_TYPE = {
        "资质": "qualification",
        "证书": "qualification",
        "资格": "qualification",
        "业绩": "scoring",
        "案例": "scoring",
        "项目经验": "scoring",
        "评分": "scoring",
        "技术方案": "technical",
        "技术响应": "technical",
        "商务": "commercial",
        "报价": "commercial",
        "人员": "qualification",
        "团队": "qualification",
        "服务方案": "technical",
        "承诺": "mandatory",
        "废标": "mandatory",
    }

    def get_matched_requirements(
        self,
        section: Section,
        top_k: int = 20,
    ) -> dict[str, Any]:
        """获取章节匹配的条款列表。

        Args:
            section: 章节实例
            top_k: 最多返回多少条

        Returns:
            {
                "must_respond": [...],      # 必须响应的条款
                "score_points": [...],      # 得分点
                "format_requirements": [...],  # 格式要求
                "all_matched": [...],       # 所有匹配的条款
            }
        """
        content_matrix = section.content_matrix or {}
        lot_id = section.outline.lot_id

        # 1. 优先使用显式绑定的条款
        related_reqs = content_matrix.get("related_requirements", [])
        if related_reqs:
            return self._get_explicit_requirements(related_reqs, lot_id)

        # 2. 自动匹配
        return self._auto_match_requirements(section, lot_id, top_k)

    def _get_explicit_requirements(
        self,
        related_reqs: list,
        lot_id: int,
    ) -> dict[str, Any]:
        """获取显式绑定的条款。"""
        # related_reqs 可能是 ID 列表或对象列表
        req_ids = []
        for item in related_reqs:
            if isinstance(item, int):
                req_ids.append(item)
            elif isinstance(item, dict) and "id" in item:
                req_ids.append(item["id"])

        if not req_ids:
            return self._empty_result()

        requirements = TenderRequirement.objects.filter(
            id__in=req_ids,
            tender_file__lot_id=lot_id,
            is_active=True,
        ).select_related("tender_file")

        return self._categorize_requirements(requirements)

    def _auto_match_requirements(
        self,
        section: Section,
        lot_id: int,
        top_k: int,
    ) -> dict[str, Any]:
        """自动匹配条款。

        匹配策略：
        1. 根据 section_role 确定条款类型
        2. 根据章节标题关键词补充条款类型
        3. 根据 write_scope 关键词补充条款类型
        """
        content_matrix = section.content_matrix or {}

        # 收集目标条款类型
        req_types = set()

        # 从 section_role 推断
        section_role = content_matrix.get("section_role", "")
        if section_role in self.SECTION_ROLE_TO_REQ_TYPE:
            req_types.update(self.SECTION_ROLE_TO_REQ_TYPE[section_role])

        # 从标题关键词推断
        title = section.title or ""
        for keyword, req_type in self.KEYWORD_TO_REQ_TYPE.items():
            if keyword in title:
                req_types.add(req_type)

        # 从 write_scope 关键词推断
        write_scope = content_matrix.get("write_scope", "")
        for keyword, req_type in self.KEYWORD_TO_REQ_TYPE.items():
            if keyword in write_scope:
                req_types.add(req_type)

        # 如果没有推断出类型，使用默认类型
        if not req_types:
            req_types = {"scoring", "mandatory"}

        # 查询条款
        queryset = TenderRequirement.objects.filter(
            tender_file__lot_id=lot_id,
            is_active=True,
        ).select_related("tender_file")

        # 按类型筛选
        if req_types:
            queryset = queryset.filter(requirement_type__in=req_types)

        # 按相关性和优先级排序
        # Note: JSONB field score ordering is complex, use sort_order as primary
        queryset = queryset.order_by(
            "-response_needed",  # 需要响应的优先
            "-mandatory_level",  # 强制性优先
            "sort_order",
        )[:top_k]

        return self._categorize_requirements(queryset)

    def _categorize_requirements(
        self,
        requirements,
    ) -> dict[str, Any]:
        """将条款分类为必须响应、得分点、格式要求。"""
        must_respond = []
        score_points = []
        format_requirements = []
        all_matched = []

        for req in requirements:
            item = {
                "id": req.id,
                "requirement_no": req.requirement_no,
                "title": req.title,
                "content": req.content[:500] if req.content else "",
                "requirement_type": req.requirement_type,
                "mandatory_level": req.mandatory_level,
                "score_info": req.score_info,
                "response_needed": req.response_needed,
            }
            all_matched.append(item)

            # 必须响应的条款（废标条款、实质性要求）
            if req.mandatory_level in ["reject", "substantive"]:
                must_respond.append(item)
            # 得分点
            elif req.requirement_type == "scoring" or req.score_info:
                score_points.append(item)
            # 格式要求
            elif req.requirement_type in ["submission", "format"]:
                format_requirements.append(item)

        return {
            "must_respond": must_respond,
            "score_points": score_points,
            "format_requirements": format_requirements,
            "all_matched": all_matched,
        }

    def _empty_result(self) -> dict[str, Any]:
        """返回空结果。"""
        return {
            "must_respond": [],
            "score_points": [],
            "format_requirements": [],
            "all_matched": [],
        }

    def get_requirement_keywords(self, requirements: list[dict]) -> list[str]:
        """从条款中提取关键词，用于 RAG 检索。

        Args:
            requirements: 条款列表

        Returns:
            关键词列表
        """
        keywords = set()

        for req in requirements:
            # 从标题提取
            title = req.get("title", "")
            if title:
                # 简单分词：提取 2-4 字的词
                for length in range(4, 1, -1):
                    for i in range(len(title) - length + 1):
                        word = title[i : i + length]
                        if not word.isdigit():
                            keywords.add(word)

            # 从内容提取关键短语
            content = req.get("content", "")
            if content:
                # 提取引号内的内容
                import re

                quoted = re.findall(r"[""「」『』](.+?)[""「」『』]", content)
                keywords.update(quoted[:3])

        return list(keywords)[:20]
