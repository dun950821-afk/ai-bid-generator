"""用户名 + 密码认证 Provider。"""
from apps.accounts.auth.base import BaseAuthProvider
from apps.accounts.auth.exceptions import InvalidCredentials
from apps.accounts.models import User


class PasswordAuthProvider(BaseAuthProvider):
    """用户名 + 密码认证（spec §5.1）。

    刻意不使用 django.contrib.auth.authenticate：后者会顺带校验 is_active，
    而 spec §5.2／附录 A #6 要求 is_active 校验集中在 login_service，
    以便对停用账号返回精确的 ACCOUNT_DISABLED 错误码。
    """

    provider_code = "password"

    def authenticate(self, credentials):
        username = (credentials.get("username") or "").strip()
        password = credentials.get("password") or ""
        if not username or not password:
            raise InvalidCredentials
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise InvalidCredentials
        if not user.check_password(password):
            raise InvalidCredentials
        return user
