"""认证相关视图（spec §5.2、§5.3）。"""
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.auth import exceptions as auth_exc
from apps.accounts.auth.registry import get_provider
from apps.accounts.authentication import JWTAuthentication
from apps.accounts.cookies import (
    REFRESH_COOKIE_NAME,
    check_csrf,
    clear_auth_cookies,
    set_auth_cookies,
)
from apps.accounts.serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    UserSerializer,
)
from apps.accounts.services import (
    captcha_service,
    login_service,
    login_throttle,
    menu_service,
    permission_service,
)
from apps.audit.services import audit_service
from apps.common.exceptions import (
    AccountDisabled,
    AccountLocked,
    AuthenticationFailed,
    CaptchaInvalid,
    CaptchaRequired,
    IpThrottled,
    TokenExpired,
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
        captcha_token = serializer.validated_data.get("captcha_token", "")
        captcha_answer = serializer.validated_data.get("captcha_answer", "")
        ip = get_client_ip(request)

        # L1 全局 IP 速率：在认证之前先拦，省掉无谓的 DB / provider 调用。
        if login_throttle.is_ip_throttled(ip):
            raise IpThrottled
        # L2 username + IP 硬锁。
        if login_throttle.is_locked(username, ip):
            raise AccountLocked
        # L3 软触发：username 在窗口内累计失败过多，必须先过 captcha。
        # 即便代理池换 IP 也躲不掉 —— 这是 L2 的兜底。
        if login_throttle.captcha_required(username):
            if not captcha_token or not captcha_answer:
                raise CaptchaRequired
            if not captcha_service.verify(captcha_token, captcha_answer):
                raise CaptchaInvalid

        try:
            provider = get_provider("password")
            user = provider.authenticate(
                {"username": username, "password": password}
            )
            result = login_service.complete_login(user, request)
        except auth_exc.AccountDisabled:
            raise AccountDisabled
        except auth_exc.InvalidCredentials:
            failures, captcha_now_required = login_throttle.record_failure(
                username, ip
            )
            audit_service.log_operation(
                actor=None,
                action="login_failed",
                request=request,
                summary="用户名或密码错误",
                extra={
                    "username": username,
                    "failures": failures,
                    "captcha_required": captcha_now_required,
                },
            )
            if failures >= login_throttle.MAX_FAILURES:
                raise AccountLocked
            if captcha_now_required:
                # 这次失败正好把 username 推过 L3 门槛 —— 直接告诉前端
                # 弹 captcha，下一次提交必须带；不再吐 401 unauthenticated
                # 让前端傻乎乎继续 retry。
                raise CaptchaRequired
            raise AuthenticationFailed

        login_throttle.reset(username, ip)
        # refresh 同时写入响应体与 httpOnly Cookie：响应体供无法依赖 Cookie
        # 的客户端（如 SSR、移动端）使用，Cookie 供浏览器走 /api/auth/refresh
        # 旋转流程（依赖 path=/api/auth 隔离与 CSRF double-submit）。
        response = Response(
            {
                "access": result["access"],
                "refresh": result["refresh"],
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

        # simplejwt 把过期与结构非法的 jwt 错误统一翻译成
        # "Token is invalid or expired"（被项目 i18n 译成中文），message
        # 上无法区分。RefreshView 必须在 serializer 之前先用 payload.exp
        # 判定过期，否则只能统一吐 token_invalid，前端无法据此触发刷新。
        if JWTAuthentication.token_is_expired(raw_refresh):
            raise TokenExpired

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


class MeView(APIView):
    """GET /api/auth/me —— 当前登录用户信息、全局权限与菜单。"""

    must_change_password_exempt = True

    def get(self, request):
        user = request.user
        global_permissions = sorted(
            permission_service.get_global_permissions(user)
        )
        return Response(
            {
                "user": UserSerializer(user).data,
                "global_permissions": global_permissions,
                "menu_tree": menu_service.build_menu_tree(global_permissions),
            }
        )


class ChangePasswordView(APIView):
    """POST /api/auth/change-password —— 修改本人密码。"""

    must_change_password_exempt = True

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"user": request.user}
        )
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        audit_service.log_operation(
            actor=user,
            action="password_changed",
            request=request,
            summary="修改密码",
        )
        return Response({"detail": "密码已更新"})


class CaptchaView(APIView):
    """GET /api/auth/captcha —— 取一道算术验证码（spec §5.4 L3）。

    匿名可访问。前端在 login 收到 captcha_required / captcha_invalid 后
    调用本接口拿新题目，再带 captcha_token / captcha_answer 重发登录。
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(captcha_service.generate())
