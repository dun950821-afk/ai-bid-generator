# backend/apps/common/services/onlyoffice_jwt.py
"""ONLYOFFICE 回调 JWT 校验（F-12）。

Document Server 开启 JWT 后，回调 body 的 `token` 字段是 DS 用共享密钥
签发的 JWT，其 claims 为 {"payload": {<回调 body 除 token 外的全部字段>}}。

历史实现只验签不比对 payload：编辑器 config 接口会把同密钥签发的 token
发给每个能开编辑器的用户，持该 token 即可伪造任意回调 body（status=2 +
攻击者 URL）向文档/模板投毒。因此必须：
1. token 必须存在且签名有效；
2. claims 必须含 payload 字典（编辑器/file 类 token 没有该 claim，天然被拒）；
3. payload 必须与请求 body（除 token 外）逐字段一致。
"""

import jwt
from django.conf import settings


class CallbackTokenError(Exception):
    """回调 token 校验失败（缺失/签名无效/payload 不一致）。"""


def verify_callback_body(data: dict) -> dict:
    """校验回调 token 并返回可信的回调 body。

    Args:
        data: 解析后的回调 JSON body（含 token 字段）

    Returns:
        与 body 一致的 payload 字典

    Raises:
        CallbackTokenError: 校验失败
    """
    token = data.get("token")
    if not token:
        raise CallbackTokenError("JWT token missing")
    try:
        claims = jwt.decode(
            token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"]
        )
    except jwt.InvalidTokenError as exc:
        raise CallbackTokenError(f"JWT validation failed: {exc}")
    payload = claims.get("payload")
    if not isinstance(payload, dict):
        raise CallbackTokenError("JWT payload claim missing")
    body = {k: v for k, v in data.items() if k != "token"}
    if payload != body:
        raise CallbackTokenError("JWT payload mismatch")
    return payload
