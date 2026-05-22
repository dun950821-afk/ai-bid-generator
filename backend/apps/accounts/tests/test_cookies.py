"""Cookie 配置与 SIMPLE_JWT 同源测试（spec §5.3 / M8）。"""
from datetime import timedelta

from django.test import override_settings

from apps.accounts.cookies import cookie_max_age


def test_cookie_max_age_tracks_simple_jwt_refresh_lifetime():
    """cookie 寿命必须从 SIMPLE_JWT.REFRESH_TOKEN_LIFETIME 取，
    避免两处独立配置造成 cookie 已死而 token 仍存活（或反之）。"""
    with override_settings(
        SIMPLE_JWT={"REFRESH_TOKEN_LIFETIME": timedelta(days=3)}
    ):
        assert cookie_max_age() == 3 * 24 * 60 * 60

    with override_settings(
        SIMPLE_JWT={"REFRESH_TOKEN_LIFETIME": timedelta(hours=2)}
    ):
        assert cookie_max_age() == 2 * 60 * 60
