# backend/dashboard/views.py
"""工作台大屏聚合 API。

1 个接口返回所有大屏需要的统计数据，前端 1 次拉取即可渲染。
覆盖：KPI / 今日重点 / AI 趋势 / 标书漏斗 / AI 场景 / 项目 Token 排行 /
知识库分布 / 检索模式 / 最近活动 / 系统健康度。
"""
from datetime import timedelta

from django.db.models import Avg, Case, Count, IntegerField, Sum, When
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import RequirePermission
from apps.audit.models import OperationLog
from apps.common.models import AsyncTask
from apps.generation.constants import PromptScenario
from apps.generation.models import PromptRun
from apps.knowledge.constants import RetrievalMode
from apps.knowledge.models import (
    KnowledgeBase,
    KnowledgeChunk,
    KnowledgeDocument,
    RetrievalLog,
)
from apps.outline.constants import SectionGenerationStatus
from apps.outline.models import BidDocument, BidDocumentStatus, Outline, Section
from apps.projects.models import Lot, Project
from apps.tender.models import TenderFile


_BID_STATUS_LABEL = {
    BidDocumentStatus.DRAFT: "草稿",
    BidDocumentStatus.EDITING: "编辑中",
    BidDocumentStatus.SAVED: "已保存",
    BidDocumentStatus.EXPORTED: "已导出",
}

_SECTION_GEN_LABEL = {
    SectionGenerationStatus.NOT_STARTED: "未开始",
    SectionGenerationStatus.PENDING: "等待中",
    SectionGenerationStatus.RUNNING: "生成中",
    SectionGenerationStatus.SUCCESS: "已生成",
    SectionGenerationStatus.FAILED: "失败",
}

# 场景 → 中文标签。Key 用 PromptScenario 常量，避免散落字符串。
_SCENARIO_LABEL = {
    PromptScenario.SECTION_CONTENT_GENERATION: "章节内容生成",
    PromptScenario.SECTION_WRITING: "章节写作",
    PromptScenario.SECTION_EXPAND: "内容扩写",
    PromptScenario.SECTION_CONTENT_PLAN: "章节内容规划",
    PromptScenario.REQUIREMENT_EXTRACTION: "需求抽取",
    PromptScenario.REQUIREMENT_EXTRACTION_SCORING: "需求评分",
    PromptScenario.REQUIREMENT_EXTRACTION_TECHNICAL: "技术需求抽取",
    PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY: "强制需求抽取",
    PromptScenario.REQUIREMENT_EXTRACTION_QUALIFICATION: "资质需求抽取",
    PromptScenario.REQUIREMENT_EXTRACTION_COMMERCIAL: "商务需求抽取",
    PromptScenario.REQUIREMENT_EXTRACTION_SUBMISSION: "提交需求抽取",
    PromptScenario.CONSISTENCY_AUDIT: "一致性审核",
    PromptScenario.CONSISTENCY_REPAIR: "一致性修复",
    PromptScenario.GLOBAL_FACT_EXTRACT: "全局事实抽取",
    PromptScenario.GLOBAL_FACT_MERGE: "全局事实合并",
    PromptScenario.GLOBAL_FACT_FINALIZE: "全局事实定稿",
    PromptScenario.CONTENT_MATRIX_GENERATION: "内容矩阵生成",
    PromptScenario.CONTENT_MATRIX_GENERATION_V2: "内容矩阵生成 v2",
    PromptScenario.OUTLINE_CHILDREN: "大纲子级生成",
    PromptScenario.OUTLINE_GENERATION: "大纲生成",
    PromptScenario.OUTLINE_REVIEW: "大纲审核",
    PromptScenario.OUTLINE_EXPAND: "大纲扩写",
    PromptScenario.TABLE_CLEANUP: "表格清理",
}

_RETRIEVAL_MODE_LABEL = {
    RetrievalMode.POSTGRES_FULLTEXT: "全文检索",
    RetrievalMode.KEYWORD: "关键词",
    RetrievalMode.VECTOR: "向量检索",
    RetrievalMode.HYBRID: "混合检索",
    RetrievalMode.HYBRID_RERANK: "混合+重排",
}

_FAILED_AI_STATUSES = ["failed", "schema_failed"]


def _start_of_today():
    return timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)


class DashboardOverviewView(APIView):
    """工作台大屏聚合数据。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "dashboard.view"

    def get(self, request):
        today = _start_of_today()
        fourteen_days_ago = timezone.now() - timedelta(days=14)

        return Response({
            "refreshed_at": timezone.now().isoformat(),
            "kpi": self._build_kpi(),
            "today": self._build_today_stats(today),
            "ai_trend_14d": self._build_ai_trend(fourteen_days_ago),
            "ai_scenario_distribution": self._build_ai_scenario_distribution(fourteen_days_ago),
            "retrieval_mode_distribution": self._build_retrieval_mode_distribution(),
            "kb_doc_distribution": self._build_kb_doc_distribution(),
            "recent_activities": self._build_recent_activities(limit=20),
            "system_health": self._build_system_health(),
            "bid_funnel": self._build_bid_funnel(),
            "project_token_ranking": self._build_project_token_ranking(limit=10),
        })

    def _build_kpi(self) -> dict:
        return {
            "projects": Project.objects.count(),
            "lots": Lot.objects.count(),
            "tender_files": TenderFile.objects.count(),
            "outlines": Outline.objects.count(),
            "bid_documents": BidDocument.objects.count(),
            "knowledge_bases": KnowledgeBase.objects.filter(is_deleted=False).count(),
            "knowledge_documents": KnowledgeDocument.objects.filter(is_deleted=False).count(),
            "knowledge_chunks": KnowledgeChunk.objects.count(),
            "tasks_total": AsyncTask.objects.count(),
            "tasks_pending": AsyncTask.objects.filter(status="pending").count(),
            "users": User.objects.count(),
            "ai_runs_total": PromptRun.objects.count(),
            "retrieval_total": RetrievalLog.objects.count(),
        }

    def _build_today_stats(self, today) -> dict:
        today_ai_runs = PromptRun.objects.filter(created_at__gte=today)
        today_retrievals = RetrievalLog.objects.filter(created_at__gte=today)

        # 单次聚合拿 runs / succeeded / failed / tokens
        ai_agg = today_ai_runs.aggregate(
            runs=Count("id"),
            succeeded=Count(Case(When(status="succeeded", then=1), output_field=IntegerField())),
            failed=Count(Case(When(status__in=_FAILED_AI_STATUSES, then=1), output_field=IntegerField())),
            tokens=Sum("total_tokens"),
        )

        return {
            "new_projects": Project.objects.filter(created_at__gte=today).count(),
            "new_tender_files": TenderFile.objects.filter(created_at__gte=today).count(),
            "new_outlines": Outline.objects.filter(created_at__gte=today).count(),
            "new_kb_documents": KnowledgeDocument.objects.filter(
                created_at__gte=today, is_deleted=False
            ).count(),
            "new_kb_chunks": KnowledgeChunk.objects.filter(created_at__gte=today).count(),
            "ai_runs": ai_agg["runs"] or 0,
            "ai_succeeded": ai_agg["succeeded"] or 0,
            "ai_failed": ai_agg["failed"] or 0,
            "ai_tokens": ai_agg["tokens"] or 0,
            "retrievals": today_retrievals.count(),
            "retrieval_avg_latency_ms": self._avg_latency(today_retrievals),
        }

    def _build_ai_trend(self, since) -> list[dict]:
        rows = (
            PromptRun.objects.filter(created_at__gte=since)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(runs=Count("id"), tokens=Sum("total_tokens"))
            .order_by("day")
        )
        return [
            {
                "date": r["day"].isoformat() if r["day"] else "",
                "runs": r["runs"],
                "tokens": r["tokens"] or 0,
            }
            for r in rows
        ]

    def _build_bid_funnel(self) -> dict:
        status_rows = (
            BidDocument.objects.values("status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        bid_status_dist = [
            {"name": _BID_STATUS_LABEL.get(r["status"], r["status"]), "value": r["count"]}
            for r in status_rows
        ]

        section_rows = (
            Section.objects.exclude(generation_status="")
            .values("generation_status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        section_gen_dist = [
            {"name": _SECTION_GEN_LABEL.get(r["generation_status"], r["generation_status"]), "value": r["count"]}
            for r in section_rows
        ]

        return {
            "funnel": [
                {"name": "项目", "value": Project.objects.count()},
                {"name": "大纲", "value": Outline.objects.count()},
                {"name": "章节", "value": Section.objects.count()},
                {"name": "标书", "value": BidDocument.objects.count()},
            ],
            "bid_status_distribution": bid_status_dist,
            "section_generation_distribution": section_gen_dist,
        }

    def _build_ai_scenario_distribution(self, since=None) -> list[dict]:
        qs = PromptRun.objects.all()
        if since is not None:
            qs = qs.filter(created_at__gte=since)
        rows = (
            qs.values("scenario")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        return [
            {"name": _SCENARIO_LABEL.get(r["scenario"], r["scenario"]), "value": r["count"]}
            for r in rows
        ]

    def _build_retrieval_mode_distribution(self) -> list[dict]:
        rows = (
            RetrievalLog.objects.values("retrieval_mode")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        return [
            {"name": _RETRIEVAL_MODE_LABEL.get(r["retrieval_mode"], r["retrieval_mode"]), "value": r["count"]}
            for r in rows
        ]

    def _build_kb_doc_distribution(self) -> list[dict]:
        kbs = KnowledgeBase.objects.filter(is_deleted=False).order_by("-document_count")
        return [
            {
                "name": kb.name,
                "documents": kb.document_count,
                "chunks": kb.chunk_count,
            }
            for kb in kbs
        ]

    def _build_project_token_ranking(self, limit: int = 10) -> list[dict]:
        rows = list(
            PromptRun.objects.values("project_id")
            .annotate(tokens=Sum("total_tokens"), runs=Count("id"))
            .order_by("-tokens")[:limit]
        )
        # 批量取项目名，避免 N+1
        project_ids = [r["project_id"] for r in rows if r["project_id"]]
        name_map = dict(
            Project.objects.filter(id__in=project_ids).values_list("id", "name")
        )
        return [
            {
                "project_id": r["project_id"],
                "name": name_map.get(r["project_id"], "未关联项目") if r["project_id"] else "未关联项目",
                "tokens": r["tokens"] or 0,
                "runs": r["runs"],
            }
            for r in rows
        ]

    def _build_recent_activities(self, limit: int = 20) -> list[dict]:
        logs = OperationLog.objects.select_related("actor").order_by("-id")[:limit]
        return [
            {
                "id": log.id,
                "actor": log.actor.username if log.actor else "系统",
                "action": log.action,
                "summary": log.summary,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ]

    def _build_system_health(self) -> dict:
        # 单次聚合：total / succeeded / failed / tokens
        ai_agg = PromptRun.objects.aggregate(
            total=Count("id"),
            succeeded=Count(Case(When(status="succeeded", then=1), output_field=IntegerField())),
            failed=Count(Case(When(status__in=_FAILED_AI_STATUSES, then=1), output_field=IntegerField())),
            tokens=Sum("total_tokens"),
        )
        ai_total = ai_agg["total"] or 0
        ai_succeeded = ai_agg["succeeded"] or 0
        ai_failed = ai_agg["failed"] or 0
        ai_success_rate = (ai_succeeded / ai_total) if ai_total > 0 else 0

        return {
            "ai_total": ai_total,
            "ai_succeeded": ai_succeeded,
            "ai_failed": ai_failed,
            "ai_success_rate": round(ai_success_rate, 4),
            "avg_retrieval_latency_ms": self._avg_latency(RetrievalLog.objects.all()),
            "total_tokens": ai_agg["tokens"] or 0,
        }

    @staticmethod
    def _avg_latency(queryset) -> int:
        """SQL 聚合平均延迟（毫秒），无数据返回 0。"""
        result = queryset.aggregate(avg=Avg("latency_ms"))
        avg = result.get("avg")
        return int(avg) if avg is not None else 0
