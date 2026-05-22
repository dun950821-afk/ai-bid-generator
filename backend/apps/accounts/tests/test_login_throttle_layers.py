"""三层 login_throttle 单测（spec §5.4）。

覆盖 L1 IP 速率 / L2 username+IP 硬锁 / L3 username 软触发 captcha 三个
独立维度，及 reset 只清 L2+L3 的语义。
"""
import pytest
from django.core.cache import cache

from apps.accounts.services import login_throttle


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def test_l1_ip_throttle_blocks_after_threshold():
    """L1：同 IP 在窗口内失败 ≥ IP_RATE_LIMIT 次触发 IP 级限速。"""
    for i in range(login_throttle.IP_RATE_LIMIT):
        # 用不同 username，模拟"同 IP 横扫多账户"场景；L1 应只看 IP
        login_throttle.record_failure(f"u{i}", "1.1.1.1")
    assert login_throttle.is_ip_throttled("1.1.1.1") is True


def test_l2_username_ip_lock_after_max_failures():
    """L2：同 username + IP 失败 ≥ MAX_FAILURES 次触发账户硬锁。"""
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("alice", "1.1.1.1")
    assert login_throttle.is_locked("alice", "1.1.1.1") is True
    # 不同 IP 不应被这把硬锁牵连（L2 维度是 username+IP 对）
    assert login_throttle.is_locked("alice", "2.2.2.2") is False


def test_l3_captcha_required_across_ips():
    """L3：同 username 跨 IP 累计达到阈值后必须 captcha，防代理池绕 L2。"""
    for i in range(login_throttle.CAPTCHA_THRESHOLD):
        login_throttle.record_failure("alice", f"10.0.0.{i}")
    assert login_throttle.captcha_required("alice") is True
    # 同 IP 的另一个 username 不应被牵连
    assert login_throttle.captcha_required("bob") is False


def test_record_failure_returns_pair_count_and_captcha_flag():
    """record_failure 返回元组：(L2 计数, L3 是否已跨过门槛)。"""
    pair, captcha_now = login_throttle.record_failure("alice", "1.1.1.1")
    assert pair == 1
    assert captcha_now is False

    # 跑到 L3 阈值前一刻，captcha_now 仍为 False
    for _ in range(login_throttle.CAPTCHA_THRESHOLD - 2):
        login_throttle.record_failure("alice", "1.1.1.1")
    pair, captcha_now = login_throttle.record_failure("alice", "1.1.1.1")
    assert pair == login_throttle.CAPTCHA_THRESHOLD
    assert captcha_now is True


def test_reset_clears_l2_and_l3_but_not_l1():
    """登录成功只洗 L2+L3，L1 保留以防代理池借合法账户洗号。"""
    login_throttle.record_failure("alice", "1.1.1.1")
    login_throttle.reset("alice", "1.1.1.1")

    assert cache.get(login_throttle._pair_key("alice", "1.1.1.1"), 0) == 0
    assert cache.get(login_throttle._user_key("alice"), 0) == 0
    # L1 计数仍在
    assert cache.get(login_throttle._ip_key("1.1.1.1"), 0) == 1
