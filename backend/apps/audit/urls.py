"""操作审计 URL。"""

from django.urls import path

from apps.audit.views import (
    OperationLogListView,
    OperationLogDetailView,
    AuditMetaView,
    AuditLogStatsView,
    AuditLogExportView,
)

urlpatterns = [
    path("audit/logs/", OperationLogListView.as_view(), name="audit-log-list"),
    path("audit/logs/export/", AuditLogExportView.as_view(), name="audit-log-export"),
    path("audit/logs/<int:pk>/", OperationLogDetailView.as_view(), name="audit-log-detail"),
    path("audit/actions/", AuditMetaView.as_view(), name="audit-meta"),
    path("audit/stats/", AuditLogStatsView.as_view(), name="audit-log-stats"),
]
