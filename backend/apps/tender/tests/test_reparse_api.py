"""重新解析 API 测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.projects.models import Project, ProjectRole, ProjectMember
from apps.tender.models import TenderFile, ParsedDocument

User = get_user_model()


def _create_owner_membership(project, user):
    """创建项目 owner 成员关系。"""
    owner_role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["project.view", "project.update", "tender.upload", "tender.view", "tender.delete"],
        is_builtin=True,
    )
    return ProjectMember.objects.create(project=project, user=user, project_role=owner_role)


@pytest.fixture
def setup_data(db):
    """测试数据准备。"""
    user = User.objects.create_user(username="testuser", password="testpass")
    project = Project.objects.create(name="测试项目", created_by=user)
    _create_owner_membership(project, user)
    return {"user": user, "project": project}


@pytest.fixture
def client(setup_data):
    """认证客户端。"""
    c = APIClient()
    c.force_authenticate(user=setup_data["user"])
    return c


@pytest.mark.django_db
def test_reparse_allowed_for_parsed_status(client, setup_data):
    """已解析状态允许重新解析。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsed",
        created_by=setup_data["user"],
    )

    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
        input_hash="hash1",
    )

    response = client.post(f"/api/tender/files/{tender_file.id}/reparse")

    assert response.status_code == 200
    assert response.data["status"] == "parsing"

    tender_file.refresh_from_db()
    assert tender_file.status == "parsing"


@pytest.mark.django_db
def test_reparse_blocked_for_parsing_status(client, setup_data):
    """解析中状态禁止重新解析。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsing",
        created_by=setup_data["user"],
    )

    response = client.post(f"/api/tender/files/{tender_file.id}/reparse")

    assert response.status_code == 400
    assert "正在处理中" in response.data["message"]


@pytest.mark.django_db
def test_reparse_blocked_for_uploading_status(client, setup_data):
    """上传中状态禁止重新解析。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="uploading",
        created_by=setup_data["user"],
    )

    response = client.post(f"/api/tender/files/{tender_file.id}/reparse")

    assert response.status_code == 400
    assert "不支持重新解析" in response.data["message"]


@pytest.mark.django_db
def test_parse_versions_list(client, setup_data):
    """获取解析版本列表。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsed",
        created_by=setup_data["user"],
    )

    # 创建两个版本
    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=False,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
        input_hash="hash1",
    )

    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        page_count=12,
        parse_engine="mock",
        parser_version="v1",
        input_hash="hash2",
    )

    response = client.get(f"/api/tender/files/{tender_file.id}/parse-versions")

    assert response.status_code == 200
    assert len(response.data["results"]) == 2
    # 最新版本在前
    assert response.data["results"][0]["is_active"] is True
    assert response.data["results"][0]["page_count"] == 12


@pytest.mark.django_db
def test_activate_version_success(client, setup_data):
    """激活历史版本成功。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="chunked",
        created_by=setup_data["user"],
    )

    old_doc = ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=False,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
        input_hash="hash1",
    )

    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        page_count=12,
        parse_engine="mock",
        parser_version="v1",
        input_hash="hash2",
    )

    response = client.post(
        f"/api/tender/files/{tender_file.id}/parse-versions/{old_doc.id}/activate"
    )

    assert response.status_code == 200
    assert "已切换" in response.data["message"]

    # 验证版本切换
    old_doc.refresh_from_db()
    assert old_doc.is_active is True

    new_active_count = ParsedDocument.objects.filter(
        tender_file=tender_file, is_active=True
    ).count()
    assert new_active_count == 1


@pytest.mark.django_db
def test_activate_version_blocked_for_parsing(client, setup_data):
    """解析中禁止切换版本。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsing",
        created_by=setup_data["user"],
    )

    old_doc = ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=False,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
        input_hash="hash1",
    )

    response = client.post(
        f"/api/tender/files/{tender_file.id}/parse-versions/{old_doc.id}/activate"
    )

    assert response.status_code == 400
    assert "正在处理中" in response.data["message"]
