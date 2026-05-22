"""工作流执行服务测试。"""
import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.workflows.models import LotWorkflow, WorkflowNodeInstance, WorkflowTemplate, WorkflowNodeTemplate
from apps.workflows.services.workflow_service import WorkflowService
from apps.projects.models import ProjectMember
from apps.projects.services.role_service import RoleService
from apps.workflows.services.template_service import TemplateService


@pytest.fixture
def setup_workflow_env(bid_manager_user, project, lot_factory):
    """创建完整的工作流环境。"""
    lot = lot_factory(project=project)

    # 初始化角色
    roles = RoleService.initialize_builtin_roles(project)

    # 创建模板
    template = WorkflowTemplate.objects.create(
        name="测试模板", scope="project", project=project, created_by=bid_manager_user
    )

    # 创建模板节点
    WorkflowNodeTemplate.objects.create(
        workflow_template=template, name="节点1", order=1,
        default_assignee_role="editor"
    )
    WorkflowNodeTemplate.objects.create(
        workflow_template=template, name="节点2", order=2,
        default_assignee_role="owner", requires_approval=True, approver_role="reviewer"
    )
    WorkflowNodeTemplate.objects.create(
        workflow_template=template, name="节点3", order=3,
        default_assignee_role="owner"
    )

    return bid_manager_user, lot, template, project


@pytest.mark.django_db
def test_initialize_workflow(setup_workflow_env):
    """测试初始化工作流。"""
    user, lot, template, project = setup_workflow_env

    workflow = WorkflowService.initialize_workflow(lot, template)

    assert workflow.id is not None
    assert workflow.status == "not_started"
    assert workflow.nodes.count() == 3


@pytest.mark.django_db
def test_initialize_workflow_already_exists(setup_workflow_env):
    """测试重复初始化工作流。"""
    user, lot, template, project = setup_workflow_env

    WorkflowService.initialize_workflow(lot, template)

    with pytest.raises(ValidationError):
        WorkflowService.initialize_workflow(lot, template)


@pytest.mark.django_db
def test_start_workflow(setup_workflow_env):
    """测试启动工作流。"""
    user, lot, template, project = setup_workflow_env

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    workflow.refresh_from_db()
    assert workflow.status == "in_progress"
    assert workflow.started_at is not None

    # 第一个节点应该开始执行
    first_node = workflow.nodes.order_by("order").first()
    assert first_node.status == "in_progress"


@pytest.mark.django_db
def test_complete_node(setup_workflow_env):
    """测试完成节点。"""
    user, lot, template, project = setup_workflow_env

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    first_node = workflow.nodes.order_by("order").first()
    WorkflowService.complete_node(first_node, user)

    first_node.refresh_from_db()
    assert first_node.status == "completed"

    # 第二个节点应该自动开始
    second_node = workflow.nodes.get(order=2)
    assert second_node.status == "in_progress"


@pytest.mark.django_db
def test_complete_node_with_approval(setup_workflow_env):
    """测试需要审批的节点完成。"""
    user, lot, template, project = setup_workflow_env

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    # 完成第一个节点
    first_node = workflow.nodes.order_by("order").first()
    WorkflowService.complete_node(first_node, user)

    # 第二个节点需要审批
    second_node = workflow.nodes.get(order=2)
    assert second_node.requires_approval is True

    # 尝试直接完成应该失败
    with pytest.raises(ValidationError):
        WorkflowService.complete_node(second_node, user)


@pytest.mark.django_db
def test_approve_node(setup_workflow_env):
    """测试审批通过节点。"""
    user, lot, template, project = setup_workflow_env

    # 初始化角色并添加用户为 reviewer
    roles = RoleService.initialize_builtin_roles(project)
    reviewer_role = next(r for r in roles if r.code == "reviewer")
    ProjectMember.objects.create(project=project, user=user, project_role=reviewer_role)

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    # 完成第一个节点
    first_node = workflow.nodes.order_by("order").first()
    WorkflowService.complete_node(first_node, user)

    # 审批第二个节点
    second_node = workflow.nodes.get(order=2)
    WorkflowService.approve_node(second_node, user, "通过")

    second_node.refresh_from_db()
    assert second_node.approval_status == "approved"
    assert second_node.approved_by == user


@pytest.mark.django_db
def test_fail_node(setup_workflow_env):
    """测试标记节点失败。"""
    user, lot, template, project = setup_workflow_env

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    first_node = workflow.nodes.order_by("order").first()
    WorkflowService.fail_node(first_node, user, "测试失败")

    first_node.refresh_from_db()
    assert first_node.status == "failed"
    assert first_node.failure_reason == "测试失败"


@pytest.mark.django_db
def test_skip_node(setup_workflow_env):
    """测试跳过节点。"""
    user, lot, template, project = setup_workflow_env

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    # 跳过第一个节点（需要先将其状态设为 pending 或 failed）
    first_node = workflow.nodes.order_by("order").first()
    first_node.status = "pending"
    first_node.save()

    WorkflowService.skip_node(first_node, user, "跳过测试")

    first_node.refresh_from_db()
    assert first_node.status == "skipped"

    # 自动推进应启动下一个节点
    WorkflowService._auto_advance(workflow)
    second_node = workflow.nodes.get(order=2)
    assert second_node.status == "in_progress"


@pytest.mark.django_db
def test_rollback_to_node(setup_workflow_env):
    """测试回退到指定节点。"""
    user, lot, template, project = setup_workflow_env

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    # 完成第一个节点
    first_node = workflow.nodes.order_by("order").first()
    WorkflowService.complete_node(first_node, user)

    # 回退到第一个节点
    WorkflowService.rollback_to_node(workflow, first_node.id, user, "测试回退")

    first_node.refresh_from_db()
    assert first_node.status == "pending"
    assert first_node.started_at is None


@pytest.mark.django_db
def test_workflow_completion(setup_workflow_env):
    """测试工作流完成。"""
    user, lot, template, project = setup_workflow_env

    # 简化模板：移除审批要求
    for node_template in template.node_templates.all():
        node_template.requires_approval = False
        node_template.save()

    workflow = WorkflowService.initialize_workflow(lot, template)
    WorkflowService.start_workflow(workflow, user)

    # 完成所有节点
    for node in workflow.nodes.order_by("order"):
        node.status = "in_progress"
        node.started_at = timezone.now()
        node.save()
        WorkflowService.complete_node(node, user)

    workflow.refresh_from_db()
    assert workflow.status == "completed"
    assert workflow.completed_at is not None

    lot.refresh_from_db()
    assert lot.workflow_status == "completed"