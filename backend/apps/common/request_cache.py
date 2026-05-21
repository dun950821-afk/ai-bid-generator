"""请求级缓存（spec §4.5 两级缓存的第一级）。

用 contextvar 存放「单次请求内」的缓存。约定：缓存值不允许为 None
（permission_service 只缓存集合与布尔值），故 get() 返回 None 即表示未命中。
RequestCacheMiddleware 在每个请求开始时 reset、结束时 clear。
"""
import contextvars

_store: contextvars.ContextVar = contextvars.ContextVar("request_cache_store")


def _current():
    """取当前请求级 store；不在请求上下文中（或已 clear）返回 None。"""
    try:
        return _store.get()
    except LookupError:
        return None


def reset():
    """请求开始时调用：建立一个空的请求级缓存。"""
    _store.set({})


def clear():
    """请求结束时调用：丢弃请求级缓存。"""
    _store.set(None)


def get(key):
    """取缓存值；未命中或不在请求上下文中返回 None。"""
    store = _current()
    if store is None:
        return None
    return store.get(key)


def set_value(key, value):
    """写缓存；不在请求上下文中时静默忽略。"""
    store = _current()
    if store is not None:
        store[key] = value


def delete(key):
    """删除单个键；不在请求上下文中时静默忽略。"""
    store = _current()
    if store is not None:
        store.pop(key, None)


class RequestCacheMiddleware:
    """每个请求开始时重置请求级缓存，结束时清理。"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        reset()
        try:
            return self.get_response(request)
        finally:
            clear()
