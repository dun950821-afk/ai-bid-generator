"""自定义 JWT 认证（spec §5.5）。

在 simplejwt 的 JWTAuthentication 之上，把"令牌过期"与"令牌非法"
区分成两个稳定 error code（token_expired / token_invalid），
便于前端据此决定是否触发静默刷新。
"""
from datetime import datetime, timezone

import jwt
from django.conf import settings
from rest_framework_simplejwt.authentication import (
    JWTAuthentication as BaseJWTAuthentication,
)
from rest_framework_simplejwt.exceptions import InvalidToken

from apps.common.exceptions import TokenExpired, TokenInvalid


class JWTAuthentication(BaseJWTAuthentication):
    """区分过期 / 非法令牌的 JWT 认证。"""

    def get_validated_token(self, raw_token):
        try:
            return super().get_validated_token(raw_token)
        except InvalidToken as exc:
            if self._looks_expired(exc):
                raise TokenExpired
            raise TokenInvalid

    @staticmethod
    def _looks_expired(exc):
        """简单从 exc.detail.messages 判断 access token 是否过期。

        access token 走 BaseJWTAuthentication.get_validated_token 时，
        失败原因被收进 exc.detail['messages']，过期项的 message 含 'expired'。
        """
        detail = getattr(exc, "detail", None)
        messages = detail.get("messages", []) if isinstance(detail, dict) else []
        for item in messages:
            if "expired" in str(item.get("message", "")).lower():
                return True
        return False

    @staticmethod
    def token_is_expired(raw_token):
        """直接从 payload.exp 判断 token 是否过期。

        simplejwt 把 jwt.ExpiredSignatureError 与签名/结构错统一翻译成
        TokenError("Token is invalid or expired")（项目里被 i18n 译成中文
        "令牌无效或已过期"），message 上无法区分。RefreshView 等需要
        从原始 token 自行解 payload 来分辨过期 vs 结构非法。

        return：True=过期；False=结构合法且未过期，或解不开（视为非法）。
        """
        sj = getattr(settings, "SIMPLE_JWT", {})
        key = sj.get("VERIFYING_KEY") or sj.get("SIGNING_KEY") or settings.SECRET_KEY
        try:
            payload = jwt.decode(
                raw_token,
                key,
                algorithms=[sj.get("ALGORITHM", "HS256")],
                options={"verify_signature": True, "verify_exp": False},
            )
        except jwt.PyJWTError:
            return False
        exp = payload.get("exp")
        if not exp:
            return False
        return datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(
            tz=timezone.utc
        )
