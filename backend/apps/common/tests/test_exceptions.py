from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.common import exceptions as exc


def test_api_error_subclass_codes_and_status():
    assert exc.ValidationError().code == "validation_error"
    assert exc.ValidationError().status_code == status.HTTP_400_BAD_REQUEST
    assert exc.PermissionDenied().code == "permission_denied"
    assert exc.PermissionDenied().status_code == status.HTTP_403_FORBIDDEN
    assert exc.AccountLocked().status_code == 423
    assert exc.RateLimited().status_code == 429
    assert exc.TokenExpired().code == "token_expired"
    assert exc.TokenInvalid().code == "token_invalid"
    assert exc.MustChangePassword().code == "must_change_password"
    assert exc.AccountDisabled().code == "account_disabled"


def test_api_error_custom_message_and_detail():
    e = exc.ValidationError(message="字段缺失", detail={"field": "username"})
    assert e.message == "字段缺失"
    assert e.detail_payload == {"field": "username"}


def test_handler_formats_api_error():
    response = exc.custom_exception_handler(exc.PermissionDenied(message="不行"), {})
    assert response.status_code == 403
    assert response.data == {
        "code": "permission_denied",
        "message": "不行",
        "detail": {},
    }


def test_handler_maps_drf_not_found():
    response = exc.custom_exception_handler(NotFound(), {})
    assert response.status_code == 404
    assert response.data["code"] == "not_found"


def test_handler_returns_none_for_unhandled():
    assert exc.custom_exception_handler(ValueError("x"), {}) is None
