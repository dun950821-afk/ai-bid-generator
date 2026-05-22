import pytest

from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_init_upload_requires_project_permission(api_client, normal_user, project):
    api_client.force_authenticate(normal_user)
    response = api_client.post(
        "/api/tender/files/init-upload",
        {
            "project_id": project.id,
            "file_name": "招标文件.pdf",
            "file_size": 1024,
            "content_type": "application/pdf",
            "file_category": "tender_file",
        },
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_init_upload_owner_gets_upload_url(api_client, normal_user, project, monkeypatch):
    ProjectMember.objects.create(project=project, user=normal_user, project_role="owner")
    api_client.force_authenticate(normal_user)

    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.presigned_put_object",
        lambda self, object_key: "http://localhost:9000/presigned",
    )

    response = api_client.post(
        "/api/tender/files/init-upload",
        {
            "project_id": project.id,
            "file_name": "招标文件.pdf",
            "file_size": 1024,
            "content_type": "application/pdf",
            "file_category": "tender_file",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["upload_url"] == "http://localhost:9000/presigned"
    assert response.data["file_id"]


@pytest.mark.django_db
def test_complete_upload_is_idempotent(api_client, normal_user, project, monkeypatch):
    from apps.common.models import AsyncTask
    from apps.tender.models import TenderFile

    ProjectMember.objects.create(project=project, user=normal_user, project_role="owner")
    file = TenderFile.objects.create(
        project=project,
        original_name="招标文件.pdf",
        file_size=1024,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/1/original.pdf",
        status="uploading",
        created_by=normal_user,
    )
    api_client.force_authenticate(normal_user)

    class Stat:
        size = 1024

    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.stat_object", lambda self, key: Stat())
    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.read_head", lambda self, key, length=4096: b"%PDF-1.7\n")

    def fake_enqueue(tender_file, user):
        """桩必须真正落库 parse_task，否则第二次调用走幂等分支会拿不到 task_id。"""
        task = AsyncTask.objects.create(
            task_type="tender_parse",
            status=AsyncTask.STATUS_PENDING,
            created_by=user,
        )
        tender_file.parse_task = task
        tender_file.save(update_fields=["parse_task", "updated_at"])
        return task.id

    monkeypatch.setattr("apps.tender.services.upload_service.enqueue_parse_task", fake_enqueue)

    first = api_client.post(f"/api/tender/files/{file.id}/complete-upload", {}, format="json")
    second = api_client.post(f"/api/tender/files/{file.id}/complete-upload", {}, format="json")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.data["task_id"] == second.data["task_id"]


@pytest.mark.django_db
def test_complete_upload_rejects_type_mismatch(api_client, normal_user, project, monkeypatch):
    """伪造类型文件：API 返回 400，且文件状态必须真正落库为 rejected。

    回归用例：complete_upload 若整体 @transaction.atomic，_reject 写库会被随后
    抛出的 ValidationError 一起回滚，文件停在 uploading。此用例锁死该行为。
    """
    from apps.tender.models import TenderFile

    ProjectMember.objects.create(project=project, user=normal_user, project_role="owner")
    file = TenderFile.objects.create(
        project=project,
        original_name="伪造.pdf",
        file_size=1024,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/2/original.pdf",
        status="uploading",
        created_by=normal_user,
    )
    api_client.force_authenticate(normal_user)

    class Stat:
        size = 1024

    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.stat_object", lambda self, key: Stat())
    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.read_head",
        lambda self, key, length=4096: b"plain text, definitely not a pdf",
    )
    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.remove_object", lambda self, key: None)

    response = api_client.post(f"/api/tender/files/{file.id}/complete-upload", {}, format="json")

    assert response.status_code == 400
    file.refresh_from_db()
    assert file.status == TenderFile.STATUS_REJECTED
    assert file.error_message
