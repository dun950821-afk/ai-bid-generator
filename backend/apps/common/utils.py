"""HTTP 请求相关的轻量工具函数。"""


def get_client_ip(request):
    """取客户端 IP。

    优先取 X-Forwarded-For 的第一段（最初的客户端）；否则回退 REMOTE_ADDR。
    无可用 IP 时返回 None——GenericIPAddressField 不接受空串。
    """
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        candidate = forwarded.split(",")[0].strip()
        if candidate:
            return candidate
    return request.META.get("REMOTE_ADDR") or None


def get_user_agent(request):
    """取 User-Agent，截断到 512 字符（与 OperationLog.user_agent 长度一致）。"""
    if request is None:
        return ""
    return request.META.get("HTTP_USER_AGENT", "")[:512]
