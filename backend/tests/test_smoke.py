def test_settings_module_loads():
    from django.conf import settings

    assert settings.TIME_ZONE == "Asia/Shanghai"
