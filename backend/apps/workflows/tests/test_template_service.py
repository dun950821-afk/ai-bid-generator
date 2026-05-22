"""模板服务测试。"""
import pytest
from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate
from apps.workflows.services.template_service import TemplateService


@pytest.mark.django_db
def test_create_system_templates(bid_manager_user):
    """测试初始化系统预设模板。"""
    templates = TemplateService.create_system_templates(created_by=bid_manager_user)

    assert len(templates) == 3
    assert all(t.scope == "system" for t in templates)
    assert all(t.is_builtin for t in templates)

    # 验证节点数量
    template_names = [t.name for t in templates]
    assert "工程类投标" in template_names
    assert "服务类采购" in template_names
    assert "简易流程" in template_names


@pytest.mark.django_db
def test_clone_template_to_project(bid_manager_user, project):
    """测试深拷贝模板到项目。"""
    # 先创建系统模板
    system_templates = TemplateService.create_system_templates(created_by=bid_manager_user)
    system_template = system_templates[0]

    # 克隆到项目
    project_template = TemplateService.clone_template_to_project(
        system_template, project, created_by=bid_manager_user
    )

    assert project_template.id is not None
    assert project_template.scope == "project"
    assert project_template.project == project
    assert project_template.is_builtin is False

    # 验证节点数量一致
    assert project_template.node_templates.count() == system_template.node_templates.count()

    # 验证节点内容
    for system_node, project_node in zip(
        system_template.node_templates.all().order_by("order"),
        project_template.node_templates.all().order_by("order")
    ):
        assert system_node.name == project_node.name
        assert system_node.order == project_node.order
        # 系统模板的 user 字段不应拷贝
        assert project_node.default_assignee_user is None
        assert project_node.approver_user is None


@pytest.mark.django_db
def test_reorder_nodes(bid_manager_user):
    """测试批量重排节点顺序。"""
    template = WorkflowTemplate.objects.create(
        name="测试模板", scope="system", created_by=bid_manager_user
    )
    node1 = WorkflowNodeTemplate.objects.create(
        workflow_template=template, name="节点1", order=1
    )
    node2 = WorkflowNodeTemplate.objects.create(
        workflow_template=template, name="节点2", order=2
    )
    node3 = WorkflowNodeTemplate.objects.create(
        workflow_template=template, name="节点3", order=3
    )

    # 重排顺序：3, 1, 2
    node_orders = [
        {"id": node3.id, "order": 1},
        {"id": node1.id, "order": 2},
        {"id": node2.id, "order": 3},
    ]
    updated = TemplateService.reorder_nodes(template.id, node_orders)

    assert updated == 3

    # 刷新并验证
    node1.refresh_from_db()
    node2.refresh_from_db()
    node3.refresh_from_db()

    assert node3.order == 1
    assert node1.order == 2
    assert node2.order == 3


@pytest.mark.django_db
def test_get_active_system_templates(bid_manager_user):
    """测试获取启用的系统模板。"""
    TemplateService.create_system_templates(created_by=bid_manager_user)

    # 禁用一个模板
    WorkflowTemplate.objects.filter(name="简易流程").update(is_active=False)

    templates = TemplateService.get_active_system_templates()
    assert templates.count() == 2


@pytest.mark.django_db
def test_get_project_templates(bid_manager_user, project):
    """测试获取项目模板。"""
    system_templates = TemplateService.create_system_templates(created_by=bid_manager_user)
    TemplateService.clone_template_to_project(
        system_templates[0], project, created_by=bid_manager_user
    )

    templates = TemplateService.get_project_templates(project)
    assert templates.count() == 1
    assert templates.first().project == project