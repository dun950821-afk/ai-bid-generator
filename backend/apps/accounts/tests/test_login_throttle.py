"""登录失败限流测试（spec §5.4）。"""
from apps.accounts.services import login_throttle


def test_record_failure_increments():
    assert login_throttle.record_failure("alice", "10.0.0.1") == 1
    assert login_throttle.record_failure("alice", "10.0.0.1") == 2


def test_is_locked_after_max_failures():
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("bob", "10.0.0.1")
    assert login_throttle.is_locked("bob", "10.0.0.1") is True


def test_not_locked_below_threshold():
    for _ in range(login_throttle.MAX_FAILURES - 1):
        login_throttle.record_failure("carol", "10.0.0.1")
    assert login_throttle.is_locked("carol", "10.0.0.1") is False


def test_reset_clears_failures():
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("dave", "10.0.0.1")
    login_throttle.reset("dave", "10.0.0.1")
    assert login_throttle.is_locked("dave", "10.0.0.1") is False


def test_different_ip_counted_separately():
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("erin", "10.0.0.1")
    assert login_throttle.is_locked("erin", "10.0.0.2") is False
