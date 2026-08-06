"""操作审计视图。"""

import csv
import io
import json

from django.db.models import Count, Q
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.audit.models import OperationLog
from apps.audit.serializers import OperationLogSerializer, OperationLogDetailSerializer
from apps.common.pagination import DefaultPagination


def build_audit_log_queryset(request):
    """按查询参数构造日志 queryset（列表 / 统计 / 导出共用）。"""
    queryset = OperationLog.objects.all()

    # 筛选条件
    actor_id = request.query_params.get("actor_id")
    if actor_id:
        queryset = queryset.filter(actor_id=actor_id)

    action = request.query_params.get("action")
    if action:
        queryset = queryset.filter(action=action)

    target_type = request.query_params.get("target_type")
    if target_type:
        queryset = queryset.filter(target_type=target_type)

    search = request.query_params.get("search")
    if search:
        queryset = queryset.filter(
            Q(summary__icontains=search) | Q(extra__icontains=search)
        )

    # 时间范围
    start_date = request.query_params.get("start_date")
    if start_date:
        queryset = queryset.filter(created_at__date__gte=start_date)

    end_date = request.query_params.get("end_date")
    if end_date:
        queryset = queryset.filter(created_at__date__lte=end_date)

    return queryset


class OperationLogListView(generics.ListAPIView):
    """操作日志列表（分页）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "audit.view"
    serializer_class = OperationLogSerializer
    pagination_class = DefaultPagination

    def get_queryset(self):
        return build_audit_log_queryset(self.request)


class OperationLogDetailView(generics.RetrieveAPIView):
    """操作日志详情。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "audit.view"
    serializer_class = OperationLogDetailSerializer
    queryset = OperationLog.objects.all()


class AuditMetaView(generics.GenericAPIView):
    """审计元数据：动态操作类型 / 对象类型选项（供筛选下拉）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "audit.view"

    def get(self, request):
        actions = (
            OperationLog.objects.order_by("action")
            .values_list("action", flat=True)
            .distinct()
        )
        target_types = (
            OperationLog.objects.exclude(target_type="")
            .order_by("target_type")
            .values_list("target_type", flat=True)
            .distinct()
        )
        return Response(
            {"actions": list(actions), "target_types": list(target_types)}
        )


class AuditLogStatsView(generics.GenericAPIView):
    """审计日志统计：总数 / 今日数 / 按操作类型计数（支持与列表相同筛选）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "audit.view"

    def get(self, request):
        queryset = build_audit_log_queryset(request)
        by_action = (
            queryset.values("action")
            .annotate(count=Count("id"))
            .order_by("-count", "action")
        )
        return Response(
            {
                "total": queryset.count(),
                "today": queryset.filter(created_at__date=timezone.localdate()).count(),
                "by_action": list(by_action),
            }
        )


class AuditLogExportView(generics.GenericAPIView):
    """审计日志导出 CSV（UTF-8 BOM，Excel 直接打开不乱码）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "audit.view"

    def get(self, request):
        queryset = build_audit_log_queryset(request).order_by("-created_at", "-id")
        filename = f"audit_logs_{timezone.localdate():%Y%m%d_%H%M%S}.csv"
        response = StreamingHttpResponse(
            self._iter_csv_rows(queryset),
            content_type="text/csv; charset=utf-8",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _iter_csv_rows(self, queryset):
        # UTF-8 BOM：让 Excel 正确识别编码
        yield "﻿"
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        headers = ["ID", "时间", "操作者", "操作类型", "对象类型", "对象ID", "摘要", "IP", "User-Agent", "附加信息"]
        writer.writerow(headers)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        for log in queryset.iterator():
            writer.writerow(
                [
                    log.id,
                    timezone.localtime(log.created_at).strftime("%Y-%m-%d %H:%M:%S"),
                    log.actor.real_name or log.actor.username if log.actor else "",
                    log.action,
                    log.target_type,
                    log.target_id,
                    log.summary,
                    log.ip or "",
                    log.user_agent,
                    json.dumps(log.extra, ensure_ascii=False, default=str),
                ]
            )
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)
