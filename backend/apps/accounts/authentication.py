"""自定义 JWT 认证（spec §5.5）。

在 simplejwt 的 JWTAuthentication 之上，把"令牌过期"与"令牌非法"
区分成两个稳定 error code（token_expired / token_invalid），
便于前端据此决定是否触发静默刷新。
"""
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
        """simplejwt 对过期令牌给出的 message 含 'expired'。

        get_validated_token 失败时把每个 token class 的失败原因收进
        exc.detail['messages']；过期 access token 的 message 为
        'Token is expired'，据此与结构非法令牌区分。
        """
        detail = getattr(exc, "detail", None)
        messages = detail.get("messages", []) if isinstance(detail, dict) else []
        for item in messages:
            if "expired" in str(item.get("message", "")).lower():
                return True
        return False
