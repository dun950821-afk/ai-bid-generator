"""认证相关视图（spec §5.2、§5.3）。"""
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.auth import exceptions as auth_exc
from apps.accounts.auth.registry import get_provider
from apps.accounts.cookies import (
    REFRESH_COOKIE_NAME,
    check_csrf,
    clear_auth_cookies,
    set_auth_cookies,
)
from apps.accounts.serializers import LoginSerializer
from apps.accounts.services import login_service, login_throttle
from apps.audit.services import audit_service
from apps.common.exceptions import (
    AccountDisabled,
    AccountLocked,
    AuthenticationFailed,
    TokenInvalid,
)
from apps.common.utils import get_client_ip


class LoginView(APIView):
    """POST /api/auth/login —— 用户名 + 密码登录。"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]
        ip = get_client_ip(request)

        if login_throttle.is_locked(username, ip):
            raise AccountLocked

        try:
            provider = get_provider("password")
            user = provider.authenticate(
                {"username": username, "password": password}
            )
            result = login_service.complete_login(user, request)
        except auth_exc.AccountDisabled:
            raise AccountDisabled
        except auth_exc.InvalidCredentials:
            failures = login_throttle.record_failure(username, ip)
            audit_service.log_operation(
                actor=None,
                action="login_failed",
                request=request,
                summary="用户名或密码错误",
                extra={"username": username, "failures": failures},
            )
            if failures >= login_throttle.MAX_FAILURES:
                raise AccountLocked
            raise AuthenticationFailed

        login_throttle.reset(username, ip)
        response = Response(
            {
                "access": result["access"],
                "user": result["user"],
                "global_permissions": result["global_permissions"],
                "menu_tree": result["menu_tree"],
                "must_change_password": result["must_change_password"],
            }
        )
        set_auth_cookies(response, result["refresh"])
        return response


class RefreshView(APIView):
    """POST /api/auth/refresh —— 旋转刷新令牌。"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not check_csrf(request):
            raise TokenInvalid(message="CSRF 校验失败")
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not raw_refresh:
            raise TokenInvalid(message="缺少 refresh token")

        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            raise TokenInvalid

        data = serializer.validated_data
        response = Response({"access": data["access"]})
        set_auth_cookies(response, data["refresh"])
        return response


class LogoutView(APIView):
    """POST /api/auth/logout —— 拉黑 refresh token 并清 Cookie（幂等）。"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not check_csrf(request):
            raise TokenInvalid(message="CSRF 校验失败")
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass  # 已失效 / 已拉黑：登出仍按成功处理
        response = Response(status=204)
        clear_auth_cookies(response)
        return response
