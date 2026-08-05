"""队列管理视图：任务列表 / 强制结束 / 最近强制结束提示 / 系统参数维护。"""

from django.core.exceptions import ObjectDoesNotExist
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission


class TaskQueueListView(APIView):
    """统一任务列表（GenerationTask + AsyncTask 合并）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "queue.manage"

    def get(self, request):
        from apps.task_queue.services.task_list_service import list_tasks

        data = list_tasks(
            status=request.query_params.get("status", "all"),
            kind=request.query_params.get("kind", "all"),
            task_type=request.query_params.get("task_type", ""),
            page=int(request.query_params.get("page", 1) or 1),
            page_size=min(int(request.query_params.get("page_size", 20) or 20), 100),
        )
        return Response(data)


class ForceStopGenerationTaskView(APIView):
    """强制结束 GenerationTask（矩阵/批量正文）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "queue.manage"

    def post(self, request, pk):
        from apps.task_queue.services.force_stop_service import (
            AlreadyEndedError,
            force_stop_generation_task,
        )

        try:
            result = force_stop_generation_task(
                pk,
                user=request.user,
                request=request,
                reason=request.data.get("reason", ""),
            )
        except AlreadyEndedError as e:
            return Response({"message": str(e)}, status=status.HTTP_409_CONFLICT)
        except ObjectDoesNotExist:
            return Response({"message": "任务不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(result)


class ForceStopAsyncTaskView(APIView):
    """强制结束 AsyncTask（文件解析/大纲生成/知识库等）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "queue.manage"

    def post(self, request, pk):
        from apps.task_queue.services.force_stop_service import (
            AlreadyEndedError,
            force_stop_async_task,
        )

        try:
            result = force_stop_async_task(
                pk,
                user=request.user,
                request=request,
                reason=request.data.get("reason", ""),
            )
        except AlreadyEndedError as e:
            return Response({"message": str(e)}, status=status.HTTP_409_CONFLICT)
        except ObjectDoesNotExist:
            return Response({"message": "任务不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(result)


class BatchForceStopView(APIView):
    """批量强制结束任务（一次确认多个任务）。

    body: {"items": [{"kind": "generation"|"async", "id": int}], "reason": str}
    单个任务的异常（已结束/不存在）记入该任务结果，不影响其他任务。
    """

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "queue.manage"

    def post(self, request):
        from apps.task_queue.services.force_stop_service import (
            AlreadyEndedError,
            force_stop_async_task,
            force_stop_generation_task,
        )

        body = request.data if isinstance(request.data, dict) else {}
        items = body.get("items")
        reason = body.get("reason", "")
        if not isinstance(items, list) or not items:
            return Response({"message": "请选择要强制结束的任务"}, status=status.HTTP_400_BAD_REQUEST)
        if len(items) > 200:
            return Response({"message": "单次最多强制结束 200 个任务"}, status=status.HTTP_400_BAD_REQUEST)

        results = []
        for item in items:
            kind = item.get("kind") if isinstance(item, dict) else None
            task_id = item.get("id") if isinstance(item, dict) else None
            if kind not in ("generation", "async") or not isinstance(task_id, int):
                results.append({"id": task_id, "kind": kind, "success": False, "message": "参数格式错误"})
                continue
            try:
                if kind == "generation":
                    force_stop_generation_task(task_id, user=request.user, request=request, reason=reason)
                else:
                    force_stop_async_task(task_id, user=request.user, request=request, reason=reason)
                results.append({"id": task_id, "kind": kind, "success": True, "message": ""})
            except AlreadyEndedError as e:
                results.append({"id": task_id, "kind": kind, "success": False, "message": str(e)})
            except ObjectDoesNotExist:
                results.append({"id": task_id, "kind": kind, "success": False, "message": "任务不存在"})
            except Exception as e:
                results.append({"id": task_id, "kind": kind, "success": False, "message": str(e)[:200]})

        return Response({
            "items": results,
            "success_count": sum(1 for r in results if r["success"]),
            "failed_count": sum(1 for r in results if not r["success"]),
        })


class RecentForceStoppedView(APIView):
    """最近被强制结束的任务（全局提示轮询）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request):
        from apps.task_queue.services.task_list_service import list_recent_force_stopped

        minutes = int(request.query_params.get("minutes", 30) or 30)
        minutes = max(1, min(minutes, 24 * 60))
        rows = list_recent_force_stopped(minutes=minutes, user=request.user, limit=20)
        return Response({"items": rows})


class TaskQueueConfigView(APIView):
    """队列失效/回收机制参数维护。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "queue.manage"

    def get(self, request):
        from apps.task_queue.services.config_service import get_config_definitions

        return Response({"items": get_config_definitions()})

    def patch(self, request):
        from apps.task_queue.services.config_service import save_config_values

        values = request.data.get("values") if isinstance(request.data, dict) else None
        if not isinstance(values, dict):
            return Response({"message": "参数格式错误：需要 {key: value} 对象"}, status=status.HTTP_400_BAD_REQUEST)

        errors = save_config_values(values, user=request.user)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "参数已保存"})
