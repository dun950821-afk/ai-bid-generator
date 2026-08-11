"""队列管理 URL。"""

from django.urls import path

from apps.task_queue.views import (
    BatchForceStopView,
    ForceStopAsyncTaskView,
    ForceStopGenerationTaskView,
    RecentForceStoppedView,
    TaskQueueConfigView,
    TaskQueueListView,
    TaskTypeListView,
)

urlpatterns = [
    path("tasks/", TaskQueueListView.as_view(), name="task-queue-list"),
    path("tasks/types/", TaskTypeListView.as_view(), name="task-queue-types"),
    path("tasks/batch-force-stop/", BatchForceStopView.as_view(), name="task-queue-batch-force-stop"),
    path("tasks/generation/<int:pk>/force-stop/", ForceStopGenerationTaskView.as_view(), name="task-queue-force-stop-generation"),
    path("tasks/async/<int:pk>/force-stop/", ForceStopAsyncTaskView.as_view(), name="task-queue-force-stop-async"),
    path("force-stopped/recent/", RecentForceStoppedView.as_view(), name="task-queue-force-stopped-recent"),
    path("config/", TaskQueueConfigView.as_view(), name="task-queue-config"),
]
