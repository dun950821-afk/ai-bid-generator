from django.urls import path

from apps.common.views import TaskDetailView, CurrentTaskView

urlpatterns = [
    path("tasks/<int:task_id>", TaskDetailView.as_view(), name="task-detail"),
    path("tasks/current/", CurrentTaskView.as_view(), name="task-current"),
]