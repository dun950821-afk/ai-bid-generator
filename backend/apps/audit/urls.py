"""操作审计 URL。"""

from django.urls import path

from apps.audit.views import OperationLogListView, OperationLogDetailView

urlpatterns = [
    path("audit/logs/", OperationLogListView.as_view(), name="audit-log-list"),
    path("audit/logs/<int:pk>/", OperationLogDetailView.as_view(), name="audit-log-detail"),
]
