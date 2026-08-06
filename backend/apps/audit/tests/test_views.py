"""审计日志 API 视图测试：列表分页 / 元数据 / 统计 / 导出。"""

import io
import csv

import pytest
from rest_framework.test import APIClient

from apps.audit.models import OperationLog
from apps.audit.services import audit_service


@pytest.fixture
def authed_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def audit_logs(admin_user, normal_user):
    """批量造日志：不同 action / actor / 对象 / 时间。"""
    logs = [
        audit_service.log_operation(
            actor=admin_user, action="login_success", summary="登录成功",
        ),
        audit_service.log_operation(
            actor=normal_user, action="login_success", summary="登录成功",
        ),
        audit_service.log_operation(
            actor=admin_user, action="user_create", target_type="user",
            target_id="99", summary="创建用户 test",
        ),
        audit_service.log_operation(
            actor=admin_user, action="role_update", target_type="role",
            target_id="7", summary="更新角色",
        ),
        audit_service.log_operation(
            actor=None, action="login_failed", extra={"username": "admin"},
            summary="登录失败",
        ),
    ]
    return logs


def _get(client, url):
    return client.get(url, format="json")


def test_list_requires_auth():
    client = APIClient()
    response = client.get("/api/audit/logs/")
    assert response.status_code == 401


def test_list_denies_without_permission(normal_user, audit_logs):
    client = APIClient()
    client.force_authenticate(user=normal_user)
    response = client.get("/api/audit/logs/")
    assert response.status_code == 403


def test_list_paginated(authed_client, audit_logs):
    response = _get(authed_client, "/api/audit/logs/")
    assert response.status_code == 200
    assert response.data["count"] == 5
    assert len(response.data["results"]) == 5
    assert "next" in response.data and "previous" in response.data


def test_list_respects_page_size(authed_client, audit_logs):
    response = _get(authed_client, "/api/audit/logs/?page_size=2&page=2")
    assert response.status_code == 200
    assert response.data["count"] == 5
    assert len(response.data["results"]) == 2


def test_list_filters(authed_client, audit_logs, admin_user):
    assert _get(authed_client, f"/api/audit/logs/?actor_id={admin_user.id}") \
        .data["count"] == 3
    assert _get(authed_client, "/api/audit/logs/?action=login_failed") \
        .data["count"] == 1
    assert _get(authed_client, "/api/audit/logs/?target_type=role") \
        .data["count"] == 1
    assert _get(authed_client, "/api/audit/logs/?search=创建用户") \
        .data["count"] == 1
    assert _get(authed_client, f"/api/audit/logs/?action=user_create&actor_id={admin_user.id}") \
        .data["count"] == 1


def test_list_date_range(authed_client, audit_logs):
    # 今天创建的日志在任意日期范围内都应命中
    response = _get(authed_client, "/api/audit/logs/?start_date=2000-01-01&end_date=2999-12-31")
    assert response.data["count"] == 5
    response = _get(authed_client, "/api/audit/logs/?start_date=2999-12-31")
    assert response.data["count"] == 0


def test_detail_requires_audit_view(normal_user, audit_logs):
    client = APIClient()
    client.force_authenticate(user=normal_user)
    response = client.get(f"/api/audit/logs/{audit_logs[0].id}/")
    assert response.status_code == 403


def test_meta_lists_actions_and_target_types(authed_client, audit_logs):
    response = _get(authed_client, "/api/audit/actions/")
    assert response.status_code == 200
    assert set(response.data["actions"]) == {
        "login_success", "login_failed", "user_create", "role_update",
    }
    assert set(response.data["target_types"]) == {"user", "role"}


def test_stats_counts(authed_client, audit_logs):
    response = _get(authed_client, "/api/audit/stats/")
    assert response.status_code == 200
    assert response.data["total"] == 5
    assert response.data["today"] == 5
    by_action = {item["action"]: item["count"] for item in response.data["by_action"]}
    assert by_action["login_success"] == 2
    assert by_action["login_failed"] == 1


def test_stats_respects_filters(authed_client, audit_logs):
    response = _get(authed_client, "/api/audit/stats/?action=login_success")
    assert response.data["total"] == 2
    assert response.data["today"] == 2


def test_export_csv(authed_client, audit_logs, admin_user):
    response = authed_client.get("/api/audit/logs/export/")
    assert response.status_code == 200
    assert 'attachment; filename="audit_logs_' in response["Content-Disposition"]
    content = b"".join(response.streaming_content).decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(content)))
    assert rows[0] == ["ID", "时间", "操作者", "操作类型", "对象类型", "对象ID", "摘要", "IP", "User-Agent", "附加信息"]
    assert len(rows) == 6  # 表头 + 5 条日志
    actions = [row[3] for row in rows[1:]]
    assert "login_failed" in actions
    assert "user_create" in actions
    user_row = next(row for row in rows[1:] if row[3] == "user_create")
    assert user_row[2] == admin_user.real_name  # 操作者


def test_export_respects_filters(authed_client, audit_logs):
    response = authed_client.get("/api/audit/logs/export/?action=login_failed")
    content = b"".join(response.streaming_content).decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(content)))
    assert len(rows) == 2  # 表头 + 1 条
    assert rows[1][3] == "login_failed"


def test_export_denies_without_permission(normal_user, audit_logs):
    client = APIClient()
    client.force_authenticate(user=normal_user)
    response = client.get("/api/audit/logs/export/")
    assert response.status_code == 403
