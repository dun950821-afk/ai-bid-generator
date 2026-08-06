"""站内通知 API：本人通知的列表 / 未读数 / 已读操作。"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer

MAX_LIMIT = 50


class NotificationListView(APIView):
    """GET /api/notifications/ —— 最新通知列表。

    参数：limit（默认 20，上限 50）、unread_only。
    返回 results 列表 + unread_count（未读总数）+ total（筛选后总数），
    一次请求即可渲染铃铛与角标，避免额外轮询计数接口。
    """

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request):
        queryset = Notification.objects.filter(user=request.user)

        unread_only = request.query_params.get("unread_only") in ("1", "true", "True")
        if unread_only:
            queryset = queryset.filter(is_read=False)

        total = queryset.count()
        unread_count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()

        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, MAX_LIMIT))

        results = NotificationSerializer(queryset[:limit], many=True).data
        return Response({"results": results, "unread_count": unread_count, "total": total})


class NotificationUnreadCountView(APIView):
    """GET /api/notifications/unread-count/ —— 未读数（角标轮询用，轻量）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request):
        unread_count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response({"unread_count": unread_count})


class NotificationReadAllView(APIView):
    """POST /api/notifications/read-all/ —— 一键全部已读。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True)
        return Response({"updated": updated})


class NotificationReadView(APIView):
    """POST /api/notifications/<pk>/read/ —— 单条已读（仅本人通知）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def post(self, request, pk):
        updated = Notification.objects.filter(user=request.user, pk=pk).update(
            is_read=True
        )
        if not updated:
            return Response({"detail": "通知不存在"}, status=404)
        return Response({"ok": True})
