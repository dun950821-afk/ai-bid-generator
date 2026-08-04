"""pytest 全局 fixture。"""
import pytest

# apps/tender/tests/conftest.py 的 tender_file / parsed_document fixtures 需被
# apps/requirements/tests 复用。pytest_plugins 无法加载 conftest 模块（pytest 8 会与
# conftest 自动加载冲突，报 Plugin already registered under a different name），
# 因此直接在根级 conftest 导入这些 fixture 函数，使全测试会话可见。
from apps.tender.tests.conftest import parsed_document, tender_file  # noqa: F401


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


@pytest.fixture
def tender_file_factory(bid_manager_user):
    """招标文件工厂 fixture。"""
    from apps.tender.models import TenderFile

    def create_tender_file(project=None, lot=None, status=TenderFile.STATUS_PARSED, **kwargs):
        return TenderFile.objects.create(
            project=project or (lot.project if lot else None),
            lot=lot,
            original_name=kwargs.get("original_name", "test.docx"),
            file_size=kwargs.get("file_size", 1024 * 1024),
            content_type=kwargs.get("content_type", "application/vnd.openxmlformats"),
            object_key=kwargs.get("object_key", f"tender/{status}.docx"),
            status=status,
            error_message=kwargs.get("error_message", ""),
            created_by=bid_manager_user,
        )
    return create_tender_file


@pytest.fixture
def outline_factory(bid_manager_user):
    """大纲工厂 fixture。"""
    from apps.outline.models import Outline
    from apps.outline.constants import OutlineSource, OutlineStatus

    def create_outline(lot, is_current=False, name="测试大纲", **kwargs):
        return Outline.objects.create(
            project=lot.project,
            lot=lot,
            name=name,
            source=kwargs.get("source", OutlineSource.MANUAL),
            status=kwargs.get("status", OutlineStatus.DRAFT),
            is_current=is_current,
            created_by=bid_manager_user,
        )
    return create_outline


@pytest.fixture
def bid_document_factory(bid_manager_user):
    """Word 文档工厂 fixture。"""
    from apps.outline.models import BidDocument
    from apps.outline.models.bid_document import BidDocumentStatus

    def create_bid_document(outline, title="测试文档.docx", **kwargs):
        return BidDocument.objects.create(
            outline=outline,
            title=title,
            version=kwargs.get("version", 1),
            file_key=kwargs.get("file_key", f"key-{outline.id}-{title}"),
            status=kwargs.get("status", BidDocumentStatus.DRAFT),
            object_key=kwargs.get("object_key", f"docs/{title}"),
            created_by=bid_manager_user,
        )
    return create_bid_document
