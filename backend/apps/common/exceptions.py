"""统一 API 异常与 DRF 异常处理器（spec §5.9）。

所有业务异常继承 APIError，携带稳定 code；响应体统一为
{ "code", "message", "detail" }。
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class APIError(APIException):
    """业务异常基类。"""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "server_error"
    default_message = "请求处理失败"

    def __init__(self, message=None, detail=None, code=None):
        self.code = code or self.default_code
        self.message = message or self.default_message
        self.detail_payload = detail or {}
        super().__init__(detail=self.message)


class ValidationError(APIError):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "validation_error"
    default_message = "参数校验失败"


class AuthenticationFailed(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "unauthenticated"
    default_message = "未认证或认证失败"


class TokenExpired(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "token_expired"
    default_message = "登录态已过期"


class TokenInvalid(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "token_invalid"
    default_message = "登录凭据非法"


class PermissionDenied(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "permission_denied"
    default_message = "无权限执行此操作"


class AccountDisabled(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "account_disabled"
    default_message = "账号已停用"


class MustChangePassword(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "must_change_password"
    default_message = "请先修改初始密码"


class NotFound(APIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = "not_found"
    default_message = "资源不存在"


class AccountLocked(APIError):
    status_code = status.HTTP_423_LOCKED
    default_code = "account_locked"
    default_message = "账号已被锁定，请稍后再试"


class RateLimited(APIError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "rate_limited"
    default_message = "操作过于频繁，请稍后再试"


_STATUS_FALLBACK = {
    400: ("validation_error", "参数校验失败"),
    401: ("unauthenticated", "未认证"),
    403: ("permission_denied", "无权限执行此操作"),
    404: ("not_found", "资源不存在"),
    405: ("method_not_allowed", "请求方法不被允许"),
    415: ("unsupported_media_type", "不支持的请求体类型"),
    429: ("rate_limited", "操作过于频繁，请稍后再试"),
}


def _map_drf_exception(exc, response):
    """把 DRF 内建异常映射为本系统稳定 code。"""
    from django.http import Http404
    from rest_framework import exceptions as drf_exc

    if isinstance(exc, (drf_exc.NotFound, Http404)):
        return "not_found", "资源不存在"
    if isinstance(exc, drf_exc.NotAuthenticated):
        return "unauthenticated", "未认证"
    if isinstance(exc, drf_exc.AuthenticationFailed):
        return "unauthenticated", "认证失败"
    if isinstance(exc, drf_exc.PermissionDenied):
        return "permission_denied", "无权限执行此操作"
    if isinstance(exc, drf_exc.ValidationError):
        return "validation_error", "参数校验失败"
    if isinstance(exc, drf_exc.Throttled):
        return "rate_limited", "操作过于频繁，请稍后再试"
    fallback = _STATUS_FALLBACK.get(response.status_code)
    if fallback:
        return fallback
    if response.status_code >= 500:
        return "server_error", "服务端错误"
    return "error", "请求处理失败"


def custom_exception_handler(exc, context):
    """把异常规整为 { code, message, detail } 响应体。"""
    if isinstance(exc, APIError):
        return Response(
            {"code": exc.code, "message": exc.message, "detail": exc.detail_payload},
            status=exc.status_code,
        )
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    code, message = _map_drf_exception(exc, response)
    detail = (
        response.data
        if isinstance(response.data, dict)
        else {"detail": response.data}
    )
    response.data = {"code": code, "message": message, "detail": detail}
    return response
