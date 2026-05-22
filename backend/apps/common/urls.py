from django.urls import path

from apps.common.views import TaskDetailView

urlpatterns = [
    path("tasks/<int:task_id>", TaskDetailView.as_view(), name="task-detail"),
]
