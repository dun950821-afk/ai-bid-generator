"""站内通知 URL。"""

from django.urls import path

from apps.notifications.views import (
    AnnouncementAckView,
    AnnouncementActiveView,
    AnnouncementManageDetailView,
    AnnouncementManageListView,
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
    NotificationUnreadCountView,
    AnnouncementOfflineView,
    AnnouncementPublishView,
)

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path("notifications/unread-count/", NotificationUnreadCountView.as_view(), name="notification-unread-count"),
    path("notifications/read-all/", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("notifications/<int:pk>/read/", NotificationReadView.as_view(), name="notification-read"),
    # 系统公告：用户端
    path("notifications/announcements/active/", AnnouncementActiveView.as_view(), name="announcement-active"),
    path("notifications/announcements/<int:pk>/ack/", AnnouncementAckView.as_view(), name="announcement-ack"),
    # 系统公告：管理端
    path("notifications/announcements/manage/", AnnouncementManageListView.as_view(), name="announcement-manage-list"),
    path("notifications/announcements/manage/<int:pk>/", AnnouncementManageDetailView.as_view(), name="announcement-manage-detail"),
    path("notifications/announcements/manage/<int:pk>/publish/", AnnouncementPublishView.as_view(), name="announcement-publish"),
    path("notifications/announcements/manage/<int:pk>/offline/", AnnouncementOfflineView.as_view(), name="announcement-offline"),
]
