"""招标文件删除级联测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.outline.models import BidDocument, Outline, Section
from apps.projects.models import Lot, Project, ProjectMember, ProjectRole
from apps.tender.models import ParsedDocument, PipelineJob, TenderChunk, TenderFile

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
def test_delete_tender_file_cascades_parse_data(client, setup_data):
    """删除招标文件级联删除解析数据。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsed",
        created_by=setup_data["user"],
    )

    parsed_doc = ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
        input_hash="hash1",
    )
    TenderChunk.objects.create(
        parsed_document=parsed_doc,
        chunk_level="section",
        chunk_index=0,
        content="测试分块内容",
    )
    PipelineJob.objects.create(
        tender_file=tender_file,
        stage="parse",
        status="completed",
    )

    response = client.delete(f"/api/tender/files/{tender_file.id}")

    assert response.status_code == 204
    assert not TenderFile.objects.filter(pk=tender_file.id).exists()
    assert not ParsedDocument.objects.filter(pk=parsed_doc.id).exists()
    assert TenderChunk.objects.filter(parsed_document=parsed_doc).count() == 0
    assert PipelineJob.objects.filter(tender_file=tender_file).count() == 0


@pytest.mark.django_db
def test_delete_tender_file_cascades_outline_and_documents(client, setup_data):
    """删除招标文件级联删除基于它生成的标书（Outline 全链）。"""
    project = setup_data["project"]
    user = setup_data["user"]

    lot = Lot.objects.create(project=project, name="标段一")

    tender_file = TenderFile.objects.create(
        project=project,
        lot=lot,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsed",
        created_by=user,
    )

    outline = Outline.objects.create(
        project=project,
        lot=lot,
        name="生成的标书大纲",
        source="ai",
        status="active",
        source_tender_file=tender_file,
        created_by=user,
    )
    section = Section.objects.create(
        outline=outline,
        title="第一章 投标函",
        status="generated",
        sort_order=1,
    )
    bid_document = BidDocument.objects.create(
        outline=outline,
        title="标书.docx",
        object_key="bid_documents/2026/08/03/标书.docx",
    )

    response = client.delete(f"/api/tender/files/{tender_file.id}")

    assert response.status_code == 204
    assert not TenderFile.objects.filter(pk=tender_file.id).exists()
    assert not Outline.objects.filter(pk=outline.id).exists()
    assert not Section.objects.filter(pk=section.id).exists()
    assert not BidDocument.objects.filter(pk=bid_document.id).exists()
    # 标段本身不受影响
    assert Lot.objects.filter(pk=lot.id).exists()


@pytest.mark.django_db
def test_delete_tender_file_serializer_outline_count(client, setup_data):
    """序列化器返回 outline_count。"""
    project = setup_data["project"]
    user = setup_data["user"]

    lot = Lot.objects.create(project=project, name="标段一")

    tender_file = TenderFile.objects.create(
        project=project,
        lot=lot,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsed",
        created_by=user,
    )

    Outline.objects.create(
        project=project,
        lot=lot,
        name="标书一",
        source="ai",
        status="active",
        source_tender_file=tender_file,
        created_by=user,
    )
    Outline.objects.create(
        project=project,
        lot=lot,
        name="标书二",
        source="ai",
        status="active",
        is_current=False,
        source_tender_file=tender_file,
        created_by=user,
    )

    response = client.get(f"/api/tender/files/{tender_file.id}")

    assert response.status_code == 200
    assert response.data["outline_count"] == 2
