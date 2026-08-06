"""附件→主文件关联测试：校验规则、上传带 main_file_id、PATCH 修改关联、序列化输出。"""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.common.exceptions import ValidationError
from apps.projects.models import ProjectMember, ProjectRole
from apps.tender.models import TenderFile
from apps.tender.serializers import TenderFileSerializer
from apps.tender.services.upload_service import validate_main_file


def _create_manager_membership(project, user):
    """创建具备 tender.upload + tender.manage 的项目成员关系。"""
    role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["tender.view", "tender.upload", "tender.manage"],
        is_builtin=True,
    )
    return ProjectMember.objects.create(project=project, user=user, project_role=role)


def make_file(project, user, name, lot=None, file_category=TenderFile.CATEGORY_TENDER, main_file=None):
    return TenderFile.objects.create(
        project=project,
        lot=lot,
        original_name=name,
        file_size=1024,
        content_type="application/pdf",
        file_category=file_category,
        main_file=main_file,
        object_key=f"tender/{name}",
        status=TenderFile.STATUS_PARSED,
        created_by=user,
    )


def _stub_presign(monkeypatch):
    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.presigned_post_upload",
        lambda self, object_key, *, max_size, content_type=None, expires_seconds=None: {
            "url": "http://localhost:9000/bid-files",
            "fields": {"key": object_key},
        },
    )


# ---------- 校验规则（validate_main_file 四类） ----------

@pytest.mark.django_db
def test_validate_main_file_rejects_cross_lot(project, lot, lot_factory, bid_manager_user):
    main = make_file(project, bid_manager_user, "main.pdf", lot=lot)
    other_lot = lot_factory(project=project, name="标段二")
    with pytest.raises(ValidationError):
        validate_main_file(
            main, project=project, lot=other_lot, file_category=TenderFile.CATEGORY_ATTACHMENT
        )


@pytest.mark.django_db
def test_validate_main_file_rejects_non_tender_category(project, lot, bid_manager_user):
    not_main = make_file(
        project, bid_manager_user, "att.pdf", lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    with pytest.raises(ValidationError):
        validate_main_file(
            not_main, project=project, lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
        )


@pytest.mark.django_db
def test_validate_main_file_rejects_self_reference(project, lot, bid_manager_user):
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    with pytest.raises(ValidationError):
        validate_main_file(
            att, project=project, lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT, self_id=att.id
        )


@pytest.mark.django_db
def test_validate_main_file_rejects_category_tender_with_main(project, lot, bid_manager_user):
    """规则①：file_category=tender_file 不允许带 main_file。"""
    main = make_file(project, bid_manager_user, "main.pdf", lot=lot)
    with pytest.raises(ValidationError):
        validate_main_file(
            main, project=project, lot=lot, file_category=TenderFile.CATEGORY_TENDER
        )


@pytest.mark.django_db
def test_validate_main_file_accepts_valid(project, lot, bid_manager_user):
    main = make_file(project, bid_manager_user, "main.pdf", lot=lot)
    validate_main_file(
        main, project=project, lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    validate_main_file(
        main, project=project, lot=lot, file_category=TenderFile.CATEGORY_CLARIFICATION
    )


@pytest.mark.django_db
def test_validate_main_file_lot_none_only_requires_same_project(project, bid_manager_user):
    """文件 lot 为空时仅要求同 project。"""
    main = make_file(project, bid_manager_user, "main.pdf", lot=None)
    validate_main_file(
        main, project=project, lot=None, file_category=TenderFile.CATEGORY_ATTACHMENT
    )


# ---------- InitUpload / DirectUpload 带 main_file_id ----------

@pytest.mark.django_db
def test_init_upload_with_main_file_id(api_client, normal_user, project, lot, monkeypatch):
    _create_manager_membership(project, normal_user)
    _stub_presign(monkeypatch)
    main = make_file(project, normal_user, "main.pdf", lot=lot)
    api_client.force_authenticate(normal_user)

    response = api_client.post(
        "/api/tender/files/init-upload",
        {
            "project_id": project.id,
            "lot_id": lot.id,
            "file_name": "附件.pdf",
            "file_size": 1024,
            "file_category": "attachment",
            "main_file_id": main.id,
        },
        format="json",
    )
    assert response.status_code == 200
    tender_file = TenderFile.objects.get(pk=response.data["file_id"])
    assert tender_file.main_file_id == main.id


@pytest.mark.django_db
def test_init_upload_rejects_invalid_main_file(api_client, normal_user, project, lot, lot_factory, monkeypatch):
    _create_manager_membership(project, normal_user)
    _stub_presign(monkeypatch)
    other_lot = lot_factory(project=project, name="标段二")
    main = make_file(project, normal_user, "main.pdf", lot=other_lot)
    api_client.force_authenticate(normal_user)

    response = api_client.post(
        "/api/tender/files/init-upload",
        {
            "project_id": project.id,
            "lot_id": lot.id,
            "file_name": "附件.pdf",
            "file_size": 1024,
            "file_category": "attachment",
            "main_file_id": main.id,
        },
        format="json",
    )
    assert response.status_code == 400
    assert "main_file_id" in response.data["detail"]


@pytest.mark.django_db
def test_direct_upload_with_main_file_id(api_client, normal_user, project, lot, monkeypatch):
    _create_manager_membership(project, normal_user)
    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.upload_fileobj",
        lambda self, file_obj, object_key, content_type=None: None,
    )
    main = make_file(project, normal_user, "main.pdf", lot=lot)
    api_client.force_authenticate(normal_user)

    uploaded = SimpleUploadedFile("附件.pdf", b"%PDF-1.7\nattachment", content_type="application/pdf")
    response = api_client.post(
        "/api/tender/files/upload",
        {
            "project_id": project.id,
            "lot_id": lot.id,
            "file_category": "attachment",
            "main_file_id": main.id,
            "file": uploaded,
        },
        format="multipart",
    )
    assert response.status_code == 201
    tender_file = TenderFile.objects.get(pk=response.data["file_id"])
    assert tender_file.main_file_id == main.id
    assert tender_file.status == TenderFile.STATUS_READY


# ---------- PATCH association ----------

@pytest.fixture
def manage_user(django_user_model):
    """tender.manage 是全局权限点（见 permissions_registry），用超管持有。"""
    return django_user_model.objects.create_superuser(
        username="tender_admin", password="Str0ng-Pass-1"
    )


@pytest.mark.django_db
def test_patch_association_reassign_main_file(api_client, manage_user, project, lot, bid_manager_user):
    main1 = make_file(project, bid_manager_user, "main1.pdf", lot=lot)
    main2 = make_file(project, bid_manager_user, "main2.pdf", lot=lot)
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot,
        file_category=TenderFile.CATEGORY_ATTACHMENT, main_file=main1,
    )
    api_client.force_authenticate(manage_user)

    response = api_client.patch(
        f"/api/tender/files/{att.id}/association",
        {"main_file_id": main2.id},
        format="json",
    )
    assert response.status_code == 200
    att.refresh_from_db()
    assert att.main_file_id == main2.id
    assert response.data["main_file"] == main2.id
    assert response.data["main_file_name"] == "main2.pdf"


@pytest.mark.django_db
def test_patch_association_change_category_clears_main_file(api_client, manage_user, project, lot, bid_manager_user):
    """改为 tender_file 时强制清空 main_file。"""
    main = make_file(project, bid_manager_user, "main.pdf", lot=lot)
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot,
        file_category=TenderFile.CATEGORY_ATTACHMENT, main_file=main,
    )
    api_client.force_authenticate(manage_user)

    response = api_client.patch(
        f"/api/tender/files/{att.id}/association",
        {"file_category": "tender_file"},
        format="json",
    )
    assert response.status_code == 200
    att.refresh_from_db()
    assert att.file_category == TenderFile.CATEGORY_TENDER
    assert att.main_file_id is None
    assert response.data["main_file"] is None
    assert response.data["main_file_name"] is None


@pytest.mark.django_db
def test_patch_association_clear_main_file_with_null(api_client, manage_user, project, lot, bid_manager_user):
    main = make_file(project, bid_manager_user, "main.pdf", lot=lot)
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot,
        file_category=TenderFile.CATEGORY_ATTACHMENT, main_file=main,
    )
    api_client.force_authenticate(manage_user)

    response = api_client.patch(
        f"/api/tender/files/{att.id}/association",
        {"main_file_id": None},
        format="json",
    )
    assert response.status_code == 200
    att.refresh_from_db()
    assert att.main_file_id is None


@pytest.mark.django_db
def test_patch_association_rejects_cross_lot(api_client, manage_user, project, lot, lot_factory, bid_manager_user):
    other_lot = lot_factory(project=project, name="标段二")
    main = make_file(project, bid_manager_user, "main.pdf", lot=other_lot)
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    api_client.force_authenticate(manage_user)

    response = api_client.patch(
        f"/api/tender/files/{att.id}/association",
        {"main_file_id": main.id},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_patch_association_rejects_self_reference(api_client, manage_user, project, lot, bid_manager_user):
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    api_client.force_authenticate(manage_user)

    response = api_client.patch(
        f"/api/tender/files/{att.id}/association",
        {"main_file_id": att.id},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_patch_association_rejects_non_tender_main(api_client, manage_user, project, lot, bid_manager_user):
    other_att = make_file(
        project, bid_manager_user, "other.pdf", lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    api_client.force_authenticate(manage_user)

    response = api_client.patch(
        f"/api/tender/files/{att.id}/association",
        {"main_file_id": other_att.id},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_patch_association_requires_manage_permission(api_client, normal_user, project, lot):
    """仅有 tender.upload、无 tender.manage 的成员不能修改关联。"""
    role = ProjectRole.objects.create(
        project=project, name="上传者", code="uploader",
        permissions=["tender.view", "tender.upload"], is_builtin=True,
    )
    ProjectMember.objects.create(project=project, user=normal_user, project_role=role)
    att = make_file(
        project, normal_user, "att.pdf", lot=lot, file_category=TenderFile.CATEGORY_ATTACHMENT
    )
    api_client.force_authenticate(normal_user)

    response = api_client.patch(
        f"/api/tender/files/{att.id}/association",
        {"main_file_id": None},
        format="json",
    )
    assert response.status_code == 403


# ---------- Serializer 输出字段 ----------

@pytest.mark.django_db
def test_serializer_outputs_main_file_fields(project, lot, bid_manager_user):
    main = make_file(project, bid_manager_user, "main.pdf", lot=lot)
    att = make_file(
        project, bid_manager_user, "att.pdf", lot=lot,
        file_category=TenderFile.CATEGORY_ATTACHMENT, main_file=main,
    )
    data = TenderFileSerializer(att).data
    assert data["main_file"] == main.id
    assert data["main_file_name"] == "main.pdf"

    main_data = TenderFileSerializer(main).data
    assert main_data["main_file"] is None
    assert main_data["main_file_name"] is None
