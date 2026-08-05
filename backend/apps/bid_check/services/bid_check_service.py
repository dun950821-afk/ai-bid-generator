# backend/apps/bid_check/services/bid_check_service.py
"""废标检查服务（借鉴 OpenBidKit rejectionCheckTask）。

三轮流程：
1. 提取废标项清单（从招标文件 markdown）
2. 第一轮分析 → 第二轮检查 → 第三轮定稿
每轮调 AiTaskExecutionService，失败兜底保留前轮结果。
"""

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.bid_check.constants import (
    BidCheckFindingType,
    BidCheckSeverity,
    BidCheckTaskStatus,
)
from apps.bid_check.models import BidCheckFinding, BidCheckTask
from apps.common.models import AsyncTask

User = get_user_model()
logger = logging.getLogger(__name__)


class BidCheckService:
    """废标检查编排服务。"""

    def start_check(
        self,
        outline_id: int,
        bid_document_id: int,
        custom_check_items: str,
        user,
    ) -> AsyncTask:
        """启动废标检查（异步）。"""
        from apps.bid_check.tasks import bid_check_task

        task = BidCheckTask.objects.create(
            outline_id=outline_id,
            bid_document_id=bid_document_id,
            status=BidCheckTaskStatus.PENDING,
            custom_check_items=custom_check_items or "",
            created_by=user,
        )

        async_task = AsyncTask.objects.create(
            task_type="bid_check",
            status=AsyncTask.STATUS_PENDING,
            progress=0,
            current_step="初始化",
            related_object_type="BidCheckTask",
            related_object_id=str(task.id),
            input_payload={
                "bid_check_task_id": task.id,
                "outline_id": outline_id,
                "bid_document_id": bid_document_id,
            },
            created_by=user,
        )

        from apps.common.tasks_utils import enqueue_after_commit
        enqueue_after_commit(bid_check_task, task.id, async_task.id, user.id, async_task=async_task)
        return async_task

    def _load_tender_markdown(self, outline) -> str:
        """读取招标文件 markdown。"""
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

    def _load_bid_content(self, bid_document) -> str:
        """读取投标文件正文 markdown。

        投标文件正文由大纲所有章节内容拼接而成（BidDocument 的 object_key 是
        docx 二进制，不适合直接喂给检查 prompt）。按章节树顺序拼接 markdown。
        """
        from apps.outline.models import Section

        outline = bid_document.outline
        sections = list(
            Section.objects.filter(outline=outline)
            .order_by("sort_order", "id")
            .values_list("title", "content")
        )
        parts = []
        for title, content in sections:
            if not content:
                continue
            parts.append(f"## {title}\n\n{content}")
        return "\n\n".join(parts)

    @transaction.atomic
    def persist_findings(self, task: BidCheckTask, findings: list[dict]):
        """持久化发现项。"""
        BidCheckFinding.objects.filter(task=task).delete()
        objs = [
            BidCheckFinding(
                task=task,
                type=f.get("type", BidCheckFindingType.INVALID_BID),
                severity=f.get("severity", BidCheckSeverity.MEDIUM),
                title=(f.get("title") or "")[:56],
                summary=f.get("summary", ""),
                requirement=f.get("requirement", ""),
                bid_evidence=f.get("bidEvidence", f.get("bid_evidence", "")),
                risk_reason=f.get("riskReason", f.get("risk_reason", "")),
                suggestion=f.get("suggestion", ""),
            )
            for f in findings
        ]
        BidCheckFinding.objects.bulk_create(objs)

        # 更新摘要
        summary = {s: 0 for s in ["high", "medium", "low"]}
        for f in findings:
            sev = f.get("severity", "medium")
            summary[sev] = summary.get(sev, 0) + 1
        task.findings_summary = summary
        task.save(update_fields=["findings_summary", "updated_at"])
