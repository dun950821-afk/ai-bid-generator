"""登录失败限流（spec §5.4）。

按 用户名 + IP 维度统计连续登录失败次数；达到 MAX_FAILURES 锁定 LOCK_SECONDS。
计数存 Django cache。每次失败都用完整 TTL 重置，锁定窗口从最后一次失败起算。
"""
from django.core.cache import cache

MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60


def _key(username, ip):
    return f"login_fail:{username}:{ip or '-'}"


def is_locked(username, ip):
    """是否已达失败上限。"""
    return cache.get(_key(username, ip), 0) >= MAX_FAILURES


def record_failure(username, ip):
    """记一次登录失败，返回累计失败次数。"""
    key = _key(username, ip)
    failures = cache.get(key, 0) + 1
    cache.set(key, failures, LOCK_SECONDS)
    return failures


def reset(username, ip):
    """登录成功后清除该 用户名+IP 的失败计数。"""
    cache.delete(_key(username, ip))
