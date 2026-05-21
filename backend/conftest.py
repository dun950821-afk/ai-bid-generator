"""pytest 全局 fixture。"""
import pytest


@pytest.fixture(autouse=True)
def _clear_cache():
    """每个测试前后清空缓存，隔离权限缓存。"""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def normal_user(django_user_model):
    from apps.accounts.models import Role

    user = django_user_model.objects.create_user(
        username="normal", password="Str0ng-Pass-1", real_name="普通用户"
    )
    user.roles.add(Role.objects.get(code="normal_user"))
    return user


@pytest.fixture
def bid_manager_user(django_user_model):
    from apps.accounts.models import Role

    user = django_user_model.objects.create_user(
        username="manager", password="Str0ng-Pass-1", real_name="投标经理"
    )
    user.roles.add(Role.objects.get(code="bid_manager"))
    return user


@pytest.fixture
def admin_user(django_user_model):
    from apps.accounts.models import Role

    user = django_user_model.objects.create_user(
        username="sysadmin", password="Str0ng-Pass-1", real_name="系统管理员"
    )
    user.roles.add(Role.objects.get(code="system_admin"))
    return user


@pytest.fixture
def project(bid_manager_user):
    from apps.projects.models import Project

    return Project.objects.create(name="测试项目", created_by=bid_manager_user)
