# backend/apps/outline/views_sse.py
"""Server-Sent Events 视图。

用于实时推送批量生成进度。
"""

import json
import time
from django.contrib.auth import get_user_model
from django.http import StreamingHttpResponse, JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError

from apps.outline.models import GenerationTask
from apps.outline.services.batch_generation_service import BatchGenerationService


def authenticate_request(request):
    """认证请求，返回用户对象或 None。"""
    # 1. 尝试从 URL 参数获取 token
    token = request.GET.get('token')
    if token:
        try:
            validated_token = AccessToken(token)
            user_id = validated_token['user_id']
            User = get_user_model()
            return User.objects.get(pk=user_id)
        except (TokenError, User.DoesNotExist):
            pass

    # 2. 尝试从 Authorization header 获取
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        try:
            validated_token = AccessToken(token)
            user_id = validated_token['user_id']
            User = get_user_model()
            return User.objects.get(pk=user_id)
        except (TokenError, User.DoesNotExist):
            pass

    # 3. 尝试 Session 认证
    if request.user.is_authenticated:
        return request.user

    return None


@method_decorator(csrf_exempt, name='dispatch')
class BatchGenerationSSEView(View):
    """批量生成进度 SSE 推送。

    客户端通过 EventSource 连接此接口，实时接收进度更新。
    """

    def get(self, request, task_id):
        """SSE 流式推送进度。"""
        # 认证检查
        user = authenticate_request(request)
        if not user:
            return JsonResponse({'error': '未认证'}, status=401)

        # 验证任务存在
        try:
            task = GenerationTask.objects.select_related("outline").get(pk=task_id)
        except GenerationTask.DoesNotExist:
            return JsonResponse({'error': '任务不存在'}, status=404)

        # 越权校验：非项目成员禁止订阅
        from apps.projects.models import ProjectMember
        if not ProjectMember.objects.filter(
            project=task.outline.project, user=user
        ).exists():
            return JsonResponse({'error': '无权访问该任务'}, status=403)

        def event_stream():
            """SSE 事件流生成器。"""
            last_progress = None
            idle_count = 0
            max_idle = 60  # 最多空闲 60 次后关闭连接（约 60 秒）

            while True:
                try:
                    # 刷新任务状态
                    task.refresh_from_db()

                    # 获取详细进度：矩阵任务没有批量子项（BatchGenerationTaskItem），
                    # 直接从 GenerationTask 计数推导（与队列管理页进度算法一致）
                    if task.task_type == "matrix_generation":
                        total = task.total_count or 0
                        done = (task.success_count or 0) + (task.failed_count or 0) + (task.skipped_count or 0)
                        progress = {
                            "total": total,
                            "success": task.success_count or 0,
                            "failed": task.failed_count or 0,
                            "skipped": task.skipped_count or 0,
                            "running": 0,
                            "pending": max(total - done, 0),
                            "progress_percent": round(done / total * 100) if total else 0,
                            "current_section": (
                                {"title": task.current_section_title}
                                if task.current_section_title else None
                            ),
                        }
                    else:
                        batch_service = BatchGenerationService()
                        progress = batch_service.get_batch_progress(task_id)

                    # progress 是字典，直接使用
                    data = {
                        "task_id": task_id,
                        "status": task.status,
                        "total": progress["total"],
                        "success": progress["success"],
                        "failed": progress["failed"],
                        "skipped": progress["skipped"],
                        "running": progress["running"],
                        "pending": progress["pending"],
                        "progress_percent": progress["progress_percent"],
                        "current_section": progress["current_section"],
                        "error_message": task.error_message,
                        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
                        "force_stopped": task.force_stopped,
                    }

                    # 检查是否有变化
                    current_progress = json.dumps(data, sort_keys=True)
                    if current_progress != last_progress:
                        idle_count = 0
                        last_progress = current_progress
                        yield f"data: {current_progress}\n\n"
                    else:
                        idle_count += 1

                    # 任务完成或失败时关闭连接
                    # 与 GenerationTaskStatus 常量对齐：COMPLETED/FAILED/PARTIAL_SUCCESS/CANCELLED
                    if task.status in [
                        "completed",
                        "failed",
                        "partial_success",
                        "cancelled",
                    ]:
                        yield f"event: done\ndata: {current_progress}\n\n"
                        break

                    # 空闲超时关闭
                    if idle_count >= max_idle:
                        yield f"event: timeout\ndata: {json.dumps({'message': '连接超时'})}\n\n"
                        break

                    # 等待 1 秒
                    time.sleep(1)

                except Exception as e:
                    yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                    break

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"  # 禁用 nginx 缓冲
        return response


@method_decorator(csrf_exempt, name='dispatch')
class OutlineProgressSSEView(View):
    """大纲整体进度 SSE 推送。

    推送大纲下的所有任务进度（矩阵生成、正文生成等）。
    """

    def get(self, request, outline_id):
        """SSE 流式推送大纲进度。"""
        from apps.outline.constants import GenerationTaskStatus
        from apps.outline.models import Outline
        from apps.projects.models import ProjectMember

        # 认证检查
        user = authenticate_request(request)
        if not user:
            return JsonResponse({'error': '未认证'}, status=401)

        # 越权校验：必须是该项目成员
        try:
            outline = Outline.objects.select_related("project").get(pk=outline_id)
        except Outline.DoesNotExist:
            return JsonResponse({'error': '大纲不存在'}, status=404)
        if not ProjectMember.objects.filter(
            project=outline.project, user=user
        ).exists():
            return JsonResponse({'error': '无权访问该大纲'}, status=403)

        def event_stream():
            last_state = None
            idle_count = 0
            max_idle = 120  # 约 2 分钟空闲后关闭

            while True:
                try:
                    # 获取活跃任务
                    active_tasks = GenerationTask.objects.filter(
                        outline_id=outline_id,
                        status__in=[
                            GenerationTaskStatus.PENDING,
                            GenerationTaskStatus.RUNNING,
                        ]
                    ).order_by("-created_at")

                    tasks_data = []
                    for task in active_tasks:
                        tasks_data.append({
                            "id": task.id,
                            "task_type": task.task_type,
                            "status": task.status,
                            "total_count": task.total_count,
                            "success_count": task.success_count,
                            "failed_count": task.failed_count,
                            "current_section_title": task.current_section_title,
                            "force_stopped": task.force_stopped,
                            "force_stopped_at": task.force_stopped_at.isoformat() if task.force_stopped_at else None,
                        })

                    # 获取矩阵状态（get_matrix_status 返回 dict，直接透传）
                    from apps.outline.services.matrix_service import MatrixService
                    matrix_status = MatrixService().get_matrix_status(outline_id)

                    data = {
                        "outline_id": outline_id,
                        "active_tasks": tasks_data,
                        "matrix_status": {
                            "total": matrix_status.get("total", 0),
                            "pending": matrix_status.get("pending", 0),
                            "generating": matrix_status.get("generating", 0),
                            "generated": matrix_status.get("generated", 0),
                            "edited": matrix_status.get("edited", 0),
                            "failed": matrix_status.get("failed", 0),
                            "is_generating": matrix_status.get("is_generating", False),
                            "current_task_id": matrix_status.get("current_task_id"),
                        },
                    }

                    current_state = json.dumps(data, sort_keys=True)
                    if current_state != last_state:
                        idle_count = 0
                        last_state = current_state
                        yield f"data: {current_state}\n\n"
                    else:
                        idle_count += 1

                    # 无活跃任务时关闭
                    if not active_tasks and idle_count >= 5:
                        yield f"event: idle\ndata: {json.dumps({'message': '无活跃任务'})}\n\n"
                        break

                    if idle_count >= max_idle:
                        yield f"event: timeout\ndata: {json.dumps({'message': '连接超时'})}\n\n"
                        break

                    time.sleep(1)

                except Exception as e:
                    yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                    break

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
