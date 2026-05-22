"""工作流实例模型测试。"""
import pytest
from django.utils import timezone
from apps.workflows.models import LotWorkflow, WorkflowNodeInstance
from apps.projects.models import ProjectMember
from apps.projects.services.role_service import RoleService
from apps.workflows.services.template_service import TemplateService


@pytest.fixture
def setup_workflow(bid_manager_user, project, lot_factory):
    """创建完整的工作流环境。"""
    lot = lot_factory(project=project)

    # 初始化角色
    roles = RoleService.initialize_builtin_roles(project)

    # 创建模板
    template = TemplateService.create_system_templates(created_by=bid_manager_user)[0]

    # 克隆到项目
    project_template = TemplateService.clone_template_to_project(
        template, project, created_by=bid_manager_user
    )

    return bid_manager_user, lot, project_template, project


@pytest.mark.django_db
def test_create_lot_workflow(setup_workflow):
    """测试创建标段工作流。"""
    user, lot, template, project = setup_workflow

    workflow = LotWorkflow.objects.create(
        lot=lot,
        workflow_template=template,
    )

    assert workflow.id is not None
    assert workflow.status == "not_started"
    assert workflow.lot == lot


@pytest.mark.django_db
def test_progress_percentage(setup_workflow):
    """测试进度计算。"""
    user, lot, template, project = setup_workflow

    workflow = LotWorkflow.objects.create(
        lot=lot,
        workflow_template=template,
    )

    # 创建 3 个节点
    node1 = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="节点1",
        order=1,
        status="completed",
    )
    node2 = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="节点2",
        order=2,
        status="in_progress",
    )
    node3 = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="节点3",
        order=3,
        status="pending",
    )

    assert workflow.progress_percentage == 33.3


@pytest.mark.django_db
def test_current_node(setup_workflow):
    """测试获取当前节点。"""
    user, lot, template, project = setup_workflow

    workflow = LotWorkflow.objects.create(
        lot=lot,
        workflow_template=template,
    )

    # 没有进行中的节点
    assert workflow.current_node is None

    # 创建节点
    node1 = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="节点1",
        order=1,
        status="completed",
    )
    node2 = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="节点2",
        order=2,
        status="in_progress",
    )

    assert workflow.current_node == node2


@pytest.mark.django_db
def test_node_can_start(setup_workflow):
    """测试节点是否可以开始执行。"""
    user, lot, template, project = setup_workflow

    workflow = LotWorkflow.objects.create(
        lot=lot,
        workflow_template=template,
    )

    node1 = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="节点1",
        order=1,
        status="pending",
    )
    node2 = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="节点2",
        order=2,
        status="pending",
    )

    # 第一个节点可以开始
    can, msg = node1.can_start()
    assert can is True

    # 第二个节点不能开始（前置节点未完成）
    can, msg = node2.can_start()
    assert can is False
    assert "节点1" in msg


@pytest.mark.django_db
def test_node_can_complete_with_approval(setup_workflow):
    """测试需要审批的节点完成条件。"""
    user, lot, template, project = setup_workflow

    workflow = LotWorkflow.objects.create(
        lot=lot,
        workflow_template=template,
    )

    node = WorkflowNodeInstance.objects.create(
        lot_workflow=workflow,
        name="审批节点",
        order=1,
        status="in_progress",
        requires_approval=True,
        approval_status="pending",
    )

    # 未审批不能完成
    can, msg = node.can_complete()
    assert can is False
    assert "审批" in msg

    # 审批通过后可以完成
    node.approval_status = "approved"
    can, msg = node.can_complete()
    assert can is True