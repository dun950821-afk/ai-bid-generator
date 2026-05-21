import pytest
from django.contrib.auth import get_user_model

from apps.audit.models import OperationLog

User = get_user_model()


@pytest.mark.django_db
def test_operation_log_with_actor():
    user = User.objects.create_user(username="admin1", password="Str0ng-Pass-1")
    log = OperationLog.objects.create(
        actor=user, action="login_success", summary="登录成功"
    )
    assert log.actor == user
    assert log.created_at is not None


@pytest.mark.django_db
def test_operation_log_actor_nullable_for_failed_login():
    """登录失败无已认证用户，actor 留空，上下文写 extra（spec §5.10）。"""
    log = OperationLog.objects.create(
        actor=None,
        action="login_failed",
        summary="登录失败",
        extra={"username_attempted": "ghost", "reason": "invalid_password"},
    )
    assert log.actor is None
    assert log.extra["username_attempted"] == "ghost"
