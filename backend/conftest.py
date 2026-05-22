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


@pytest.fixture
def lot(project):
    """创建测试标段。"""
    from apps.projects.models import Lot

    return Lot.objects.create(project=project, name="测试标段", code="LOT-001")


@pytest.fixture
def user_factory(django_user_model):
    """用户工厂 fixture。"""
    def create_user(**kwargs):
        defaults = {
            "username": f"user_{django_user_model.objects.count() + 1}",
            "password": "Str0ng-Pass-1",
        }
        defaults.update(kwargs)
        return django_user_model.objects.create_user(**defaults)
    return create_user


@pytest.fixture
def project_factory(bid_manager_user):
    """项目工厂 fixture。"""
    def create_project(**kwargs):
        from apps.projects.models import Project
        defaults = {
            "name": f"项目_{Project.objects.count() + 1}",
            "created_by": bid_manager_user,
        }
        defaults.update(kwargs)
        return Project.objects.create(**defaults)
    return create_project


@pytest.fixture
def lot_factory():
    """标段工厂 fixture。"""
    def create_lot(**kwargs):
        from apps.projects.models import Lot
        defaults = {
            "name": f"标段_{Lot.objects.count() + 1}",
        }
        defaults.update(kwargs)
        return Lot.objects.create(**defaults)
    return create_lot


@pytest.fixture
def workflow_template_factory():
    """流程模板工厂 fixture。"""
    def create_template(**kwargs):
        from apps.workflows.models import WorkflowTemplate
        defaults = {
            "name": f"模板_{WorkflowTemplate.objects.count() + 1}",
            "scope": "system",
        }
        defaults.update(kwargs)
        return WorkflowTemplate.objects.create(**defaults)
    return create_template
