"""系统公告：用户端弹窗规则 + 管理端发布/下线 API 测试。"""

import pytest
from rest_framework.test import APIClient

from apps.notifications.models import Announcement, AnnouncementAck


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def authed_client(admin_user):
    api_client = APIClient()
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def normal_client(normal_user):
    api_client = APIClient()
    api_client.force_authenticate(user=normal_user)
    return api_client


def _make_announcement(**kwargs):
    defaults = {"title": "系统维护公告", "content": "本周六 00:00-06:00 系统维护"}
    defaults.update(kwargs)
    return Announcement.objects.create(**defaults)


# ============================================================================
# 用户端：active 列表（登录弹窗数据源）
# ============================================================================


@pytest.mark.django_db
def test_active_requires_auth(client):
    assert client.get("/api/notifications/announcements/active/").status_code == 401


@pytest.mark.django_db
def test_active_only_published(normal_client):
    _make_announcement(is_active=False)  # 草稿/下线
    _make_announcement(title="维护公告", is_active=True, published_at=None)
    resp = normal_client.get("/api/notifications/announcements/active/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["results"][0]["title"] == "维护公告"


@pytest.mark.django_db
def test_active_excludes_dismissed(normal_client, normal_user):
    ann = _make_announcement(is_active=True)
    AnnouncementAck.objects.create(announcement=ann, user=normal_user, dismissed=True)
    resp = normal_client.get("/api/notifications/announcements/active/")
    assert resp.json()["total"] == 0


@pytest.mark.django_db
def test_active_includes_seen_only(normal_client, normal_user):
    """点过「关闭」(seen) 未 dismiss 的公告，下次登录仍返回（继续弹窗）。"""
    ann = _make_announcement(is_active=True)
    AnnouncementAck.objects.create(announcement=ann, user=normal_user, dismissed=False, seen_at=None)
    resp = normal_client.get("/api/notifications/announcements/active/")
    assert resp.json()["total"] == 1


@pytest.mark.django_db
def test_active_dismissed_by_other_user_still_visible(normal_client, admin_user):
    ann = _make_announcement(is_active=True)
    AnnouncementAck.objects.create(announcement=ann, user=admin_user, dismissed=True)
    resp = normal_client.get("/api/notifications/announcements/active/")
    assert resp.json()["total"] == 1  # admin 的 dismiss 不影响 normal_user


@pytest.mark.django_db
def test_active_orders_by_published_desc(normal_client):
    _make_announcement(title="旧公告", is_active=True, published_at="2026-01-01T00:00:00+08:00")
    _make_announcement(title="新公告", is_active=True, published_at="2026-02-01T00:00:00+08:00")
    resp = normal_client.get("/api/notifications/announcements/active/")
    titles = [r["title"] for r in resp.json()["results"]]
    assert titles == ["新公告", "旧公告"]


# ============================================================================
# 用户端：ack（不再提示 / 关闭）
# ============================================================================


@pytest.mark.django_db
def test_ack_dismiss_persists(normal_client, normal_user):
    ann = _make_announcement(is_active=True)
    resp = normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "dismiss"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["dismissed"] is True
    ack = AnnouncementAck.objects.get(announcement=ann, user=normal_user)
    assert ack.dismissed is True
    assert ack.dismissed_at is not None
    # dismiss 后 active 不再返回
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 0


@pytest.mark.django_db
def test_ack_seen_then_dismiss_idempotent(normal_client, normal_user):
    ann = _make_announcement(is_active=True)
    for _ in range(3):  # 重复点击幂等
        resp = normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "seen"}, format="json")
        assert resp.status_code == 200
    assert AnnouncementAck.objects.filter(announcement=ann, user=normal_user).count() == 1
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 1

    normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "dismiss"}, format="json")
    normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "dismiss"}, format="json")
    assert AnnouncementAck.objects.filter(announcement=ann, user=normal_user).count() == 1
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 0


@pytest.mark.django_db
def test_ack_invalid_action(normal_client):
    ann = _make_announcement(is_active=True)
    resp = normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "foo"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_ack_offline_announcement_404(normal_client):
    ann = _make_announcement(is_active=False)
    resp = normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "seen"}, format="json")
    assert resp.status_code == 404


# ============================================================================
# 管理端：CRUD + 发布/下线
# ============================================================================


@pytest.mark.django_db
def test_manage_requires_permission(normal_client):
    assert normal_client.get("/api/notifications/announcements/manage/").status_code == 403


@pytest.mark.django_db
def test_manage_requires_auth(client):
    assert client.get("/api/notifications/announcements/manage/").status_code == 401


@pytest.mark.django_db
def test_manage_list_with_stats(authed_client, admin_user, normal_user):
    ann = _make_announcement(is_active=True, created_by=admin_user)
    AnnouncementAck.objects.create(announcement=ann, user=admin_user, dismissed=True)
    AnnouncementAck.objects.create(announcement=ann, user=normal_user, dismissed=False)

    resp = authed_client.get("/api/notifications/announcements/manage/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["results"][0]["title"] == "系统维护公告"
    assert body["results"][0]["ack_count"] == 2
    assert body["results"][0]["dismiss_count"] == 1
    assert body["results"][0]["created_by_name"] == admin_user.real_name or body["results"][0]["created_by_name"] == ""


@pytest.mark.django_db
def test_manage_created_by_name_falls_back_to_username(authed_client):
    """发布人无 real_name 时展示用户名。"""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(username="only_username", password="x", real_name="")
    _make_announcement(title="公告", is_active=False, created_by=user)

    resp = authed_client.get("/api/notifications/announcements/manage/")
    assert resp.status_code == 200
    row = resp.json()["results"][0]
    assert row["created_by_name"] == "only_username"


@pytest.mark.django_db
def test_manage_create_draft(authed_client, admin_user):
    resp = authed_client.post(
        "/api/notifications/announcements/manage/",
        {"title": "新公告", "content": "正文"},
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_active"] is False
    assert body["created_by"] == admin_user.pk
    assert Announcement.objects.count() == 1


@pytest.mark.django_db
def test_manage_create_with_publish(authed_client):
    resp = authed_client.post(
        "/api/notifications/announcements/manage/",
        {"title": "新公告", "content": "正文", "publish": True},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["is_active"] is True
    assert resp.json()["published_at"] is not None
    assert authed_client.get("/api/notifications/announcements/active/").json()["total"] == 1


@pytest.mark.django_db
def test_manage_publish_idempotent(authed_client):
    ann = _make_announcement()
    assert ann.published_at is None
    for _ in range(2):
        resp = authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/publish/")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True
    ann.refresh_from_db()
    assert ann.published_at is not None


@pytest.mark.django_db
def test_manage_offline_then_invisible_to_users(authed_client, normal_client):
    ann = _make_announcement(is_active=True)
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 1

    resp = authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/offline/")
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False
    assert resp.json()["offline_at"] is not None
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 0

    # 重复下线幂等
    resp = authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/offline/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_manage_publish_after_offline_keeps_first_published_at(authed_client):
    ann = _make_announcement(is_active=True, published_at="2026-01-01T00:00:00+08:00")
    authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/offline/")
    resp = authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/publish/")
    assert resp.json()["is_active"] is True
    assert resp.json()["published_at"] == "2026-01-01T00:00:00+08:00"  # 保留首次发布时间


@pytest.mark.django_db
def test_manage_patch_title_content(authed_client):
    ann = _make_announcement()
    resp = authed_client.patch(
        f"/api/notifications/announcements/manage/{ann.pk}/",
        {"title": "改名了"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "改名了"
    assert resp.json()["content"] == "本周六 00:00-06:00 系统维护"


@pytest.mark.django_db
def test_manage_delete(authed_client):
    ann = _make_announcement()
    resp = authed_client.delete(f"/api/notifications/announcements/manage/{ann.pk}/")
    assert resp.status_code == 200
    assert Announcement.objects.count() == 0


@pytest.mark.django_db
def test_manage_404(authed_client):
    assert authed_client.patch("/api/notifications/announcements/manage/999/", {"title": "x"}, format="json").status_code == 404
    assert authed_client.delete("/api/notifications/announcements/manage/999/").status_code == 404
    assert authed_client.post("/api/notifications/announcements/manage/999/publish/").status_code == 404
    assert authed_client.post("/api/notifications/announcements/manage/999/offline/").status_code == 404


# ============================================================================
# 自动下线（auto_offline_at）
# ============================================================================


@pytest.mark.django_db
def test_auto_offline_expires_on_active_query(normal_client):
    """auto_offline_at 已到点：active 查询懒过期，用户不可见。"""
    from django.utils.timezone import now, timedelta

    _make_announcement(title="限时公告", is_active=True, auto_offline_at=now() - timedelta(minutes=1))
    resp = normal_client.get("/api/notifications/announcements/active/")
    assert resp.json()["total"] == 0
    ann = Announcement.objects.get(title="限时公告")
    assert ann.is_active is False
    assert ann.offline_at is not None


@pytest.mark.django_db
def test_auto_offline_future_still_active(normal_client):
    """auto_offline_at 在未来：公告仍然可见。"""
    from django.utils.timezone import now, timedelta

    _make_announcement(title="未来下线", is_active=True, auto_offline_at=now() + timedelta(hours=1))
    resp = normal_client.get("/api/notifications/announcements/active/")
    assert resp.json()["total"] == 1
    assert Announcement.objects.get(title="未来下线").is_active is True


@pytest.mark.django_db
def test_auto_offline_service_direct():
    """服务函数幂等：只处理到期且发布中的公告。"""
    from django.utils.timezone import now, timedelta

    from apps.notifications.services.announcement_service import expire_overdue_announcements

    _make_announcement(title="到期", is_active=True, auto_offline_at=now() - timedelta(minutes=5))
    _make_announcement(title="未来", is_active=True, auto_offline_at=now() + timedelta(hours=2))
    _make_announcement(title="无时间", is_active=True, auto_offline_at=None)
    _make_announcement(title="已下线", is_active=False, auto_offline_at=now() - timedelta(minutes=5))

    assert expire_overdue_announcements() == 1
    assert expire_overdue_announcements() == 0  # 幂等
    assert Announcement.objects.get(title="到期").is_active is False
    assert Announcement.objects.get(title="未来").is_active is True
    assert Announcement.objects.get(title="无时间").is_active is True
    assert Announcement.objects.get(title="已下线").is_active is False


@pytest.mark.django_db
def test_manage_list_expires_overdue(authed_client):
    """管理端列表查询也懒过期：过期公告显示为已下线。"""
    from django.utils.timezone import now, timedelta

    _make_announcement(title="限时公告", is_active=True, auto_offline_at=now() - timedelta(minutes=1))
    resp = authed_client.get("/api/notifications/announcements/manage/")
    row = resp.json()["results"][0]
    assert row["is_active"] is False
    assert row["auto_offline_at"] is not None


@pytest.mark.django_db
def test_create_with_auto_offline_at(authed_client):
    from django.utils.timezone import now, timedelta

    target = now() + timedelta(days=1)
    resp = authed_client.post(
        "/api/notifications/announcements/manage/",
        {"title": "限时公告", "content": "x", "publish": True, "auto_offline_at": target.isoformat()},
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_active"] is True
    assert body["auto_offline_at"] is not None


@pytest.mark.django_db
def test_publish_clears_past_auto_offline_at(authed_client):
    """auto_offline_at 已过期时发布：自动清空，避免一发布立刻被下线。"""
    from django.utils.timezone import now, timedelta

    ann = _make_announcement(title="过期时间", auto_offline_at=now() - timedelta(days=1))
    resp = authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/publish/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is True
    assert body["auto_offline_at"] is None


# ============================================================================
# 修改 / 重新发布后重置「不再提示」
# ============================================================================


@pytest.mark.django_db
def test_dismiss_reset_after_edit(authed_client, normal_client, normal_user):
    """用户 dismiss 后，管理端修改发布中的公告 → 用户重新看到。"""
    ann = _make_announcement(title="原标题", is_active=True)
    normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "dismiss"}, format="json")
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 0

    resp = authed_client.patch(f"/api/notifications/announcements/manage/{ann.pk}/", {"title": "新标题"}, format="json")
    assert resp.status_code == 200
    # 用户 dismissed 被重置
    assert AnnouncementAck.objects.get(announcement=ann, user=normal_user).dismissed is False
    # active 重新返回
    body = normal_client.get("/api/notifications/announcements/active/").json()
    assert body["total"] == 1
    assert body["results"][0]["title"] == "新标题"


@pytest.mark.django_db
def test_dismiss_not_reset_when_editing_offline(authed_client, normal_client, normal_user):
    """已下线公告被修改：不重置（用户本来也看不到），等重新发布时再重置。"""
    ann = _make_announcement(title="原标题", is_active=True)
    normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "dismiss"}, format="json")
    authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/offline/")

    authed_client.patch(f"/api/notifications/announcements/manage/{ann.pk}/", {"title": "改标题"}, format="json")
    # 下线状态修改不重置
    assert AnnouncementAck.objects.get(announcement=ann, user=normal_user).dismissed is True

    # 重新发布 → 重置，用户重新看到
    authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/publish/")
    assert AnnouncementAck.objects.get(announcement=ann, user=normal_user).dismissed is False
    body = normal_client.get("/api/notifications/announcements/active/").json()
    assert body["total"] == 1
    assert body["results"][0]["title"] == "改标题"


@pytest.mark.django_db
def test_dismiss_reset_after_republish(authed_client, normal_client, normal_user):
    """用户 dismiss 后，下线再重新发布 → 用户重新看到。"""
    ann = _make_announcement(title="维护公告", is_active=True)
    normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "dismiss"}, format="json")
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 0

    authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/offline/")
    # 下线后仍不可见
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 0

    resp = authed_client.post(f"/api/notifications/announcements/manage/{ann.pk}/publish/")
    assert resp.status_code == 200
    assert AnnouncementAck.objects.get(announcement=ann, user=normal_user).dismissed is False
    assert normal_client.get("/api/notifications/announcements/active/").json()["total"] == 1


@pytest.mark.django_db
def test_reset_only_affects_dismissed(authed_client, normal_client, normal_user, admin_user):
    """重置只清 dismissed，不影响其他用户的 dismiss 与 seen 记录。"""
    ann = _make_announcement(title="维护公告", is_active=True)
    # normal_user: seen（关闭）；admin: dismiss（不再提示）
    normal_client.post(f"/api/notifications/announcements/{ann.pk}/ack/", {"action": "seen"}, format="json")
    AnnouncementAck.objects.create(announcement=ann, user=admin_user, dismissed=True)

    authed_client.patch(f"/api/notifications/announcements/manage/{ann.pk}/", {"title": "更新"}, format="json")

    normal_ack = AnnouncementAck.objects.get(announcement=ann, user=normal_user)
    assert normal_ack.dismissed is False  # 本来就不是 dismissed，保持不变
    assert normal_ack.seen_at is not None  # seen 记录保留
    admin_ack = AnnouncementAck.objects.get(announcement=ann, user=admin_user)
    assert admin_ack.dismissed is False  # 被重置
    assert admin_ack.dismissed_at is None
