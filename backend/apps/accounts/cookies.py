"""认证 Cookie 读写与 CSRF 双提交校验（spec §5.3）。

refresh token 存 httpOnly Cookie，限定 path /api/auth，前端 JS 读不到；
csrf_token 存非 httpOnly Cookie（path /），供前端读出后回填请求头，
对 refresh / logout 这类带 Cookie 的状态变更端点做 double-submit 校验。
"""
import secrets

from django.conf import settings

REFRESH_COOKIE_NAME = "refresh_token"
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
REFRESH_COOKIE_PATH = "/api/auth"
CSRF_COOKIE_PATH = "/"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 与 REFRESH_TOKEN_LIFETIME 一致


def _secure():
    return getattr(settings, "AUTH_COOKIE_SECURE", False)


def set_auth_cookies(response, refresh_token):
    """把 refresh token 与新签发的 csrf_token 写入响应 Cookie，返回 csrf_token。"""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=_secure(),
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        max_age=COOKIE_MAX_AGE,
        httponly=False,
        secure=_secure(),
        samesite="Lax",
        path=CSRF_COOKIE_PATH,
    )
    return csrf_token


def clear_auth_cookies(response):
    """登出时清除 refresh / csrf Cookie。"""
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    response.delete_cookie(CSRF_COOKIE_NAME, path=CSRF_COOKIE_PATH)


def check_csrf(request):
    """double-submit 校验：Cookie 中的 csrf_token 须与请求头一致。"""
    cookie_token = request.COOKIES.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if not cookie_token or not header_token:
        return False
    return secrets.compare_digest(cookie_token, header_token)
