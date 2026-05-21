from apps.common import request_cache


def test_get_returns_none_after_clear():
    request_cache.clear()
    assert request_cache.get("missing") is None


def test_set_and_get_within_context():
    request_cache.reset()
    request_cache.set_value("k", {"a", "b"})
    assert request_cache.get("k") == {"a", "b"}
    request_cache.clear()


def test_clear_drops_values():
    request_cache.reset()
    request_cache.set_value("k", 1)
    request_cache.clear()
    assert request_cache.get("k") is None


def test_delete_removes_single_key():
    request_cache.reset()
    request_cache.set_value("k1", 1)
    request_cache.set_value("k2", 2)
    request_cache.delete("k1")
    assert request_cache.get("k1") is None
    assert request_cache.get("k2") == 2
    request_cache.clear()


def test_set_value_outside_context_is_noop():
    request_cache.clear()
    request_cache.set_value("k", 1)  # 无请求上下文时静默忽略
    assert request_cache.get("k") is None
