"""流程模板模型测试。"""
import pytest
from django.core.exceptions import ValidationError
from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate


@pytest.fixture
def system_template(bid_manager_user):
    """创建系统模板。"""
    template = WorkflowTemplate.objects.create(
        name="工程类投标",
        description="适用于工程类投标项目",
        scope="system",
        is_builtin=True,
        created_by=bid_manager_user,
    )
    return template


@pytest.mark.django_db
def test_create_system_template(bid_manager_user):
    """测试创建系统模板。"""
    template = WorkflowTemplate.objects.create(
        name="系统模板",
        scope="system",
        created_by=bid_manager_user,
    )
    assert template.id is not None
    assert template.scope == "system"
    assert template.project is None


@pytest.mark.django_db
def test_create_project_template(bid_manager_user, project):
    """测试创建项目模板。"""
    template = WorkflowTemplate.objects.create(
        name="项目模板",
        scope="project",
        project=project,
        created_by=bid_manager_user,
    )
    assert template.id is not None
    assert template.project == project


@pytest.mark.django_db
def test_project_template_requires_project(bid_manager_user):
    """测试项目级模板必须关联项目。"""
    template = WorkflowTemplate(
        name="无效模板",
        scope="project",
        project=None,
        created_by=bid_manager_user,
    )
    with pytest.raises(Exception):  # IntegrityError from constraint
        template.save()


@pytest.mark.django_db
def test_create_node_template(system_template):
    """测试创建节点模板。"""
    node = WorkflowNodeTemplate.objects.create(
        workflow_template=system_template,
        name="上传招标文件",
        order=1,
        default_assignee_type="role",
        default_assignee_role="editor",
    )
    assert node.id is not None
    assert node.order == 1


@pytest.mark.django_db
def test_system_template_cannot_have_user_assignee(system_template, bid_manager_user):
    """测试系统模板不能设置具体用户为负责人。"""
    node = WorkflowNodeTemplate(
        workflow_template=system_template,
        name="测试节点",
        order=1,
        default_assignee_user=bid_manager_user,
    )
    with pytest.raises(ValidationError):
        node.clean()


@pytest.mark.django_db
def test_builtin_template_cannot_delete(bid_manager_user):
    """测试内置模板不可删除。"""
    template = WorkflowTemplate.objects.create(
        name="内置模板",
        scope="system",
        is_builtin=True,
        created_by=bid_manager_user,
    )
    assert template.can_delete(bid_manager_user) is False