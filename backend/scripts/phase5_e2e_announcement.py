"""Phase5 系统公告 e2e 验证。

覆盖：管理端发布 → 用户端 active 可见 → dismiss 后不可见 → seen 后仍可见
→ 管理端列表统计 → 下线后用户不可见 → 删除。
"""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.notifications.models import Announcement

User = get_user_model()

PASS = []
FAIL = []


def check(name, cond, extra=""):
    if cond:
        PASS.append(name)
        print(f"  [PASS] {name}")
    else:
        FAIL.append(name)
        print(f"  [FAIL] {name} {extra}")


def main():
    admin = User.objects.filter(is_superuser=True).first()
    if admin is None:
        print("!! 没有管理员用户，无法验证管理端")
        return

    # 清理历史公告，保证可重复执行
    Announcement.objects.all().delete()

    admin_client = APIClient(HTTP_HOST="localhost")
    admin_client.force_authenticate(user=admin)

    # 1. 管理端创建（直接发布）
    resp = admin_client.post(
        "/api/notifications/announcements/manage/",
        {"title": "系统维护通知", "content": "本周六 00:00-06:00 进行系统维护，请提前保存工作内容。", "publish": True},
        format="json",
    )
    check("管理端创建并发布", resp.status_code == 201 and resp.json().get("is_active") is True, str(resp.status_code))
    ann_id = resp.json()["id"]

    # 2. 普通用户视角：active 可见
    normal = User.objects.exclude(pk=admin.pk).first()
    if normal is None:
        # 没有其他用户就再造一个
        normal = User.objects.create_user(username="e2e_ann_normal", password="x", real_name="E2E用户")
    user_client = APIClient(HTTP_HOST="localhost")
    user_client.force_authenticate(user=normal)

    resp = user_client.get("/api/notifications/announcements/active/")
    body = resp.json()
    check("用户端 active 可见", body["total"] == 1 and body["results"][0]["id"] == ann_id, str(body))

    # 3. seen（关闭）：仍可见
    resp = user_client.post(f"/api/notifications/announcements/{ann_id}/ack/", {"action": "seen"}, format="json")
    check("ack seen 成功", resp.status_code == 200)
    resp = user_client.get("/api/notifications/announcements/active/")
    check("seen 后仍可见（下次登录再弹）", resp.json()["total"] == 1)

    # 4. dismiss（不再提示）：不可见
    resp = user_client.post(f"/api/notifications/announcements/{ann_id}/ack/", {"action": "dismiss"}, format="json")
    check("ack dismiss 成功", resp.status_code == 200 and resp.json()["dismissed"] is True)
    resp = user_client.get("/api/notifications/announcements/active/")
    check("dismiss 后不可见", resp.json()["total"] == 0)
    # 幂等：再 dismiss 一次
    resp = user_client.post(f"/api/notifications/announcements/{ann_id}/ack/", {"action": "dismiss"}, format="json")
    check("重复 dismiss 幂等", resp.status_code == 200)

    # 5. 管理端列表统计
    resp = admin_client.get("/api/notifications/announcements/manage/")
    row = resp.json()["results"][0]
    check("管理端列表统计", row["ack_count"] == 1 and row["dismiss_count"] == 1, str(row))

    # 6. 下线后用户不可见（新用户视角）
    resp = admin_client.post(f"/api/notifications/announcements/manage/{ann_id}/offline/")
    check("下线成功", resp.status_code == 200 and resp.json()["is_active"] is False)
    normal2 = User.objects.create_user(username="e2e_ann_normal2", password="x", real_name="E2E用户2")
    user_client2 = APIClient(HTTP_HOST="localhost")
    user_client2.force_authenticate(user=normal2)
    resp = user_client2.get("/api/notifications/announcements/active/")
    check("下线后新用户不可见", resp.json()["total"] == 0)

    # 7. 删除
    resp = admin_client.delete(f"/api/notifications/announcements/manage/{ann_id}/")
    check("删除成功", resp.status_code == 200 and Announcement.objects.count() == 0)

    # 8. 自动下线：auto_offline_at 设为过去时间 → 发布后立即被懒过期下线
    from django.utils.timezone import now, timedelta

    resp = admin_client.post(
        "/api/notifications/announcements/manage/",
        {"title": "限时公告", "content": "仅展示 1 分钟", "publish": True,
         "auto_offline_at": (now() - timedelta(minutes=1)).isoformat()},
        format="json",
    )
    check("创建自动下线公告", resp.status_code == 201)
    timed_id = resp.json()["id"]
    # 发布时已过期的时间会被清空（避免一发布立刻下线）→ 此时仍应可见
    check("过期时间发布时自动清空", resp.json()["auto_offline_at"] is None)
    resp = user_client.get("/api/notifications/announcements/active/")
    check("清空后用户可见", resp.json()["total"] == 1)

    # 设定未来的自动下线时间（PATCH），再手动触发过期 → 不可见
    resp = admin_client.patch(
        f"/api/notifications/announcements/manage/{timed_id}/",
        {"auto_offline_at": (now() - timedelta(minutes=1)).isoformat()},
        format="json",
    )
    check("PATCH 设置过期自动下线时间", resp.status_code == 200)
    resp = user_client.get("/api/notifications/announcements/active/")
    check("到点自动下线(懒过期)", resp.json()["total"] == 0)
    ann = Announcement.objects.get(pk=timed_id)
    check("自动下线后 is_active=False", ann.is_active is False and ann.offline_at is not None)
    # 服务函数幂等
    from apps.notifications.services.announcement_service import expire_overdue_announcements
    check("expire 幂等返回 0", expire_overdue_announcements() == 0)
    resp = admin_client.delete(f"/api/notifications/announcements/manage/{timed_id}/")
    check("清理限时公告", resp.status_code == 200)

    # 清理 e2e 用户
    for u in (normal, normal2):
        if u.username.startswith("e2e_ann_"):
            u.delete()

    print(f"\n结果: {len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
