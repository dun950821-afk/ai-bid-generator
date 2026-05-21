"""apps.audit.services.audit_service 测试。"""
import pytest

from apps.audit.models import OperationLog
from apps.audit.services import audit_service


@pytest.mark.django_db
def test_log_operation_with_actor(normal_user):
    log = audit_service.log_operation(
        actor=normal_user, action="login_success", summary="登录成功"
    )
    assert log.pk is not None
    assert log.actor == normal_user
    assert log.action == "login_success"
    assert OperationLog.objects.count() == 1


@pytest.mark.django_db
def test_log_operation_anonymous_actor_none():
    log = audit_service.log_operation(
        actor=None, action="login_failed", extra={"username": "ghost"}
    )
    assert log.actor is None
    assert log.extra == {"username": "ghost"}


@pytest.mark.django_db
def test_log_operation_extracts_ip_and_target(rf):
    request = rf.post("/api/auth/login", HTTP_X_FORWARDED_FOR="203.0.113.7, 10.0.0.1")
    log = audit_service.log_operation(
        actor=None, action="login_failed", request=request,
        target_type="user", target_id=42,
    )
    assert log.ip == "203.0.113.7"
    assert log.target_type == "user"
    assert log.target_id == "42"


@pytest.mark.django_db
def test_log_operation_no_request_leaves_ip_none():
    log = audit_service.log_operation(actor=None, action="login_failed")
    assert log.ip is None
    assert log.user_agent == ""
