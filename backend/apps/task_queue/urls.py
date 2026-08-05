"""队列管理 URL。"""

from django.urls import path

from apps.task_queue.views import (
    ForceStopAsyncTaskView,
    ForceStopGenerationTaskView,
    RecentForceStoppedView,
    TaskQueueConfigView,
    TaskQueueListView,
)

urlpatterns = [
    path("tasks/", TaskQueueListView.as_view(), name="task-queue-list"),
    path("tasks/generation/<int:pk>/force-stop/", ForceStopGenerationTaskView.as_view(), name="task-queue-force-stop-generation"),
    path("tasks/async/<int:pk>/force-stop/", ForceStopAsyncTaskView.as_view(), name="task-queue-force-stop-async"),
    path("force-stopped/recent/", RecentForceStoppedView.as_view(), name="task-queue-force-stopped-recent"),
    path("config/", TaskQueueConfigView.as_view(), name="task-queue-config"),
]
