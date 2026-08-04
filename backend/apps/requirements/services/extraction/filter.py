"""误分类三级过滤：hard 丢弃 / suspected 软标记 / 其余信任。"""

import logging

from apps.requirements.constants import (
    TECHNICAL_HARD_FILTER_TITLES,
    TECHNICAL_SUSPECT_KEYWORDS,
    SCORING_HARD_FILTER_TITLES,
)
from apps.requirements.models import RequirementFilterLog

logger = logging.getLogger(__name__)


class MisclassificationFilter:
    """误分类三级过滤。

    一级（hard）：标题精确命中关键词 -> 直接丢弃并记日志；
    二级（suspected）：内容命中关键词 -> 保留并软标记 + 记日志；
    三级：其余情况信任原文评分分类结构。
    """

    def apply(
        self,
        items: list[dict],
        extraction_type: str,
        tender_file,
    ) -> list[dict]:
        kept = []
        for item in items:
            title = (item.get("title") or "").strip()
            content = item.get("content") or ""
            filter_level = None
            matched_keyword = ""
            reason = ""

            if extraction_type == "technical":
                if title in TECHNICAL_HARD_FILTER_TITLES:
                    filter_level = RequirementFilterLog.LEVEL_HARD
                    matched_keyword = title
                    reason = "技术标目录场景：标题命中硬过滤清单"
                else:
                    hit = next(
                        (kw for kw in TECHNICAL_SUSPECT_KEYWORDS if kw in content),
                        None,
                    )
                    if hit:
                        filter_level = RequirementFilterLog.LEVEL_SUSPECTED
                        matched_keyword = hit
                        reason = "技术标目录场景：内容命中疑似关键词，软标记待人工复核"
            elif extraction_type == "scoring":
                # 仅无分值的项才可能丢弃；有分值的评分项必须保留
                score_is_null = (
                    item.get("score") is None
                    or item.get("score_status") == "not_applicable"
                )
                if title in SCORING_HARD_FILTER_TITLES and score_is_null:
                    filter_level = RequirementFilterLog.LEVEL_HARD
                    matched_keyword = title
                    reason = "评分场景：无分值且标题命中硬过滤清单"

            if filter_level is None:
                kept.append(item)
                continue

            self._log(
                tender_file=tender_file,
                extraction_type=extraction_type,
                item=item,
                filter_level=filter_level,
                matched_keyword=matched_keyword,
                filter_reason=reason,
            )
            if filter_level == RequirementFilterLog.LEVEL_HARD:
                logger.info(
                    "Hard-filtered item type=%s title=%s keyword=%s",
                    extraction_type, title, matched_keyword,
                )
                continue

            item["filter_status"] = "suspected"
            item["filter_reason"] = reason
            kept.append(item)
        return kept

    def _log(
        self,
        tender_file,
        extraction_type: str,
        item: dict,
        filter_level: str,
        matched_keyword: str,
        filter_reason: str,
    ) -> None:
        """写入误分类过滤日志。"""
        RequirementFilterLog.objects.create(
            tender_file=tender_file,
            extraction_type=extraction_type,
            title=(item.get("title") or "")[:255],
            matched_keyword=matched_keyword[:100],
            filter_level=filter_level,
            filter_reason=filter_reason[:255],
            raw_llm_item=item,
        )
