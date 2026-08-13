"""站内通知 API：本人通知的列表 / 未读数 / 已读操作 + 系统公告（用户端弹窗 + 管理端维护）。"""

from django.db.models import Count, Q
from django.utils.timezone import now
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.notifications.models import Announcement, AnnouncementAck, Notification
from apps.notifications.serializers import (
    AnnouncementManageSerializer,
    AnnouncementUserSerializer,
    NotificationSerializer,
)

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


# ---------------------------------------------------------------------------
# 系统公告：用户端（登录弹窗）
# ---------------------------------------------------------------------------


class AnnouncementActiveView(APIView):
    """GET /api/notifications/announcements/active/ —— 当前用户待弹窗的公告。

    规则：is_active=True 且未被当前用户「不再提示」(dismissed) 的公告，
    按发布时间倒序。点过「关闭」(仅 seen) 的公告下次登录仍会返回，
    由前端决定是否再次弹窗。
    """

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request):
        dismissed_ids = AnnouncementAck.objects.filter(
            user=request.user, dismissed=True
        ).values_list("announcement_id", flat=True)
        queryset = Announcement.objects.filter(is_active=True).exclude(
            id__in=list(dismissed_ids)
        )
        return Response(
            {
                "results": AnnouncementUserSerializer(queryset, many=True).data,
                "total": queryset.count(),
            }
        )


class AnnouncementAckView(APIView):
    """POST /api/notifications/announcements/<pk>/ack/ —— 用户确认公告。

    body: {"action": "dismiss" | "seen"}
    - dismiss：不再提示（永久隐藏，幂等）
    - seen：仅本次关闭（下次登录若仍发布则再次弹出，幂等）
    """

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def post(self, request, pk):
        announcement = Announcement.objects.filter(pk=pk, is_active=True).first()
        if announcement is None:
            return Response({"detail": "公告不存在或已下线"}, status=404)

        action = request.data.get("action")
        if action not in ("dismiss", "seen"):
            return Response({"detail": "action 必须是 dismiss 或 seen"}, status=400)

        ack, _ = AnnouncementAck.objects.get_or_create(
            announcement=announcement, user=request.user
        )
        if action == "dismiss":
            ack.dismissed = True
            ack.dismissed_at = now()
        ack.seen_at = now()
        ack.save(update_fields=["dismissed", "seen_at", "dismissed_at", "updated_at"])
        return Response({"ok": True, "action": action, "dismissed": ack.dismissed})


# ---------------------------------------------------------------------------
# 系统公告：管理端（系统设置页，system_settings.manage）
# ---------------------------------------------------------------------------


class AnnouncementManageListView(APIView):
    """GET / POST /api/notifications/announcements/manage/ —— 管理列表 / 新建。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        queryset = Announcement.objects.annotate(
            ack_count=Count("acks"),
            dismiss_count=Count("acks", filter=Q(acks__dismissed=True)),
        )
        return Response(
            {"results": AnnouncementManageSerializer(queryset, many=True).data}
        )

    def post(self, request):
        serializer = AnnouncementManageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(created_by=request.user)
        if request.data.get("publish"):
            self._publish(obj)
        return self._detail(obj, status=201)

    @staticmethod
    def _publish(obj):
        if not obj.is_active:
            obj.is_active = True
            if obj.published_at is None:
                obj.published_at = now()
            obj.offline_at = None
            obj.save(update_fields=["is_active", "published_at", "offline_at", "updated_at"])

    @staticmethod
    def _detail(obj, status=200):
        queryset = Announcement.objects.annotate(
            ack_count=Count("acks"),
            dismiss_count=Count("acks", filter=Q(acks__dismissed=True)),
        )
        return Response(
            AnnouncementManageSerializer(queryset.get(pk=obj.pk)).data, status=status
        )


class AnnouncementManageDetailView(APIView):
    """PATCH / DELETE /api/notifications/announcements/manage/<pk>/ —— 编辑 / 删除。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def _get_or_404(self, pk):
        obj = Announcement.objects.filter(pk=pk).first()
        if obj is None:
            raise NotFound("公告不存在")
        return obj

    def patch(self, request, pk):
        obj = self._get_or_404(pk)
        serializer = AnnouncementManageSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return AnnouncementManageListView._detail(obj)

    def delete(self, request, pk):
        obj = self._get_or_404(pk)
        obj.delete()
        return Response({"ok": True})


class AnnouncementPublishView(APIView):
    """POST /api/notifications/announcements/manage/<pk>/publish/ —— 发布上线（幂等）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        obj = Announcement.objects.filter(pk=pk).first()
        if obj is None:
            raise NotFound("公告不存在")
        AnnouncementManageListView._publish(obj)
        return AnnouncementManageListView._detail(obj)


class AnnouncementOfflineView(APIView):
    """POST /api/notifications/announcements/manage/<pk>/offline/ —— 下线（幂等）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        obj = Announcement.objects.filter(pk=pk).first()
        if obj is None:
            raise NotFound("公告不存在")
        if obj.is_active:
            obj.is_active = False
            obj.offline_at = now()
            obj.save(update_fields=["is_active", "offline_at", "updated_at"])
        return AnnouncementManageListView._detail(obj)
