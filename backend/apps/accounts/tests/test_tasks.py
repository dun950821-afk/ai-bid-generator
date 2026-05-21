"""accounts 应用 Celery 任务测试。"""
import pytest

from apps.accounts.tasks import flush_expired_tokens


@pytest.mark.django_db
def test_flush_expired_tokens_runs_without_error():
    """无过期 token 时任务同步执行应正常返回 None，不抛异常。"""
    result = flush_expired_tokens()
    assert result is None


def test_flush_expired_tokens_registered_in_beat_schedule():
    """Celery Beat 调度应包含每日清理条目，且指向本任务。"""
    from config.celery import app

    schedule = app.conf.beat_schedule
    assert "flush-expired-jwt-tokens" in schedule
    assert schedule["flush-expired-jwt-tokens"]["task"] == (
        "apps.accounts.tasks.flush_expired_tokens"
    )
