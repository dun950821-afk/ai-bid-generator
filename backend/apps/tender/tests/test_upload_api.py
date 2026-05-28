import pytest

from apps.projects.models import ProjectMember, ProjectRole


def _create_owner_membership(project, user):
    """创建项目 owner 成员关系。"""
    owner_role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["project.view", "project.update", "tender.upload", "tender.view"],
        is_builtin=True,
    )
    return ProjectMember.objects.create(project=project, user=user, project_role=owner_role)


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
    _create_owner_membership(project, normal_user)
    api_client.force_authenticate(normal_user)

    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.presigned_post_upload",
        lambda self, object_key, *, max_size, content_type=None, expires_seconds=None: {
            "url": "http://localhost:9000/bid-files",
            "fields": {
                "key": object_key,
                "policy": "stub-policy",
                "x-amz-signature": "stub-sig",
            },
        },
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
    assert response.data["upload_url"] == "http://localhost:9000/bid-files"
    # H4：服务端必须返回 multipart 隐藏字段；前端按这些字段拼 FormData。
    assert "upload_fields" in response.data
    assert response.data["upload_fields"]["policy"] == "stub-policy"
    assert response.data["upload_fields"]["x-amz-signature"] == "stub-sig"
    assert response.data["file_id"]


@pytest.mark.django_db
def test_init_upload_rejects_oversized_file(api_client, normal_user, project, settings, monkeypatch):
    """H4 前置校验：超过 MAX_TENDER_FILE_SIZE 的文件直接被 serializer 拒绝，
    不应进入 init_upload，更不应消耗一次 MinIO 预签名。"""
    _create_owner_membership(project, normal_user)
    api_client.force_authenticate(normal_user)
    settings.MAX_TENDER_FILE_SIZE = 1024

    called = {"presign": 0}

    def should_not_be_called(self, object_key, **kwargs):
        called["presign"] += 1
        return {"url": "", "fields": {}}

    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.presigned_post_upload",
        should_not_be_called,
    )

    response = api_client.post(
        "/api/tender/files/init-upload",
        {
            "project_id": project.id,
            "file_name": "huge.pdf",
            "file_size": 10 * 1024,
            "content_type": "application/pdf",
            "file_category": "tender_file",
        },
        format="json",
    )
    assert response.status_code == 400
    assert called["presign"] == 0, "超限请求必须在 serializer 阶段被拦，不应签名"


@pytest.mark.django_db
def test_complete_upload_is_idempotent(api_client, normal_user, project, monkeypatch):
    from apps.common.models import AsyncTask
    from apps.tender.models import TenderFile

    _create_owner_membership(project, normal_user)
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
def test_complete_upload_stat_not_found_marks_rejected(api_client, normal_user, project, monkeypatch):
    """stat_object 失败（对象不在 MinIO）应同时将 TenderFile 落库为 rejected，
    否则状态卡在 uploading，cleanup 也无法识别遗留。"""
    from apps.common.services.storage import ObjectNotFound
    from apps.tender.models import TenderFile

    _create_owner_membership(project, normal_user)
    file = TenderFile.objects.create(
        project=project,
        original_name="缺失.pdf",
        file_size=1024,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/3/original.pdf",
        status="uploading",
        created_by=normal_user,
    )
    api_client.force_authenticate(normal_user)

    def boom(self, key):
        raise ObjectNotFound(key)

    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.stat_object", boom
    )
    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.remove_object",
        lambda self, key: None,
    )

    response = api_client.post(f"/api/tender/files/{file.id}/complete-upload", {}, format="json")

    assert response.status_code == 404
    file.refresh_from_db()
    assert file.status == TenderFile.STATUS_REJECTED
    assert file.error_message


@pytest.mark.django_db
def test_init_upload_does_not_hold_transaction_during_minio_call(api_client, normal_user, project, monkeypatch):
    """H3 回归：MinIO 签名必须在 DB 事务之外。

    把网络 IO 留在 atomic 内，MinIO 抖动就会长时间占用 DB 连接，连接池
    很快被吃光。

    pytest-django 默认会用一个外层事务包住整个测试做回滚，所以
    in_atomic_block 在整个测试期间都是 True；用 savepoint_ids 的深度
    区分外层包装事务与服务内部嵌套 atomic 才准确。期望签名调用时
    服务内部的 atomic 已退出，savepoint_ids 为空。
    """
    from django.db import connection

    _create_owner_membership(project, normal_user)
    api_client.force_authenticate(normal_user)

    seen_savepoint_depth = []

    def wrapper(self, object_key, *, max_size, content_type=None, expires_seconds=None):
        seen_savepoint_depth.append(len(connection.savepoint_ids))
        return {"url": "http://localhost:9000/bid-files", "fields": {"key": object_key}}

    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.presigned_post_upload",
        wrapper,
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
    assert seen_savepoint_depth == [0], (
        "presigned_put_object 必须在服务内部 atomic 之外调用，否则 MinIO 抖动会占用 DB 连接"
    )


@pytest.mark.django_db
def test_init_upload_signature_failure_marks_rejected(api_client, normal_user, project, monkeypatch):
    """H3 回归：签名失败后必须把已落库的 TenderFile 标记为 rejected，
    否则记录卡在 uploading，cleanup 任务也只能等 grace 期满才能识别。

    RuntimeError 不被 DRF 异常处理捕获，会直接冒到测试客户端；用
    pytest.raises 兜住后再断言 DB 状态。"""
    from apps.tender.models import TenderFile

    _create_owner_membership(project, normal_user)
    api_client.force_authenticate(normal_user)

    def boom(self, object_key, *, max_size, content_type=None, expires_seconds=None):
        raise RuntimeError("MinIO unreachable")

    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.presigned_post_upload",
        boom,
    )

    with pytest.raises(RuntimeError):
        api_client.post(
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

    file = TenderFile.objects.filter(project=project).first()
    assert file is not None, "DB 记录必须已落库（事务已提交），后续签名失败才能改其状态"
    assert file.status == TenderFile.STATUS_REJECTED
    assert "签名失败" in (file.error_message or "")


@pytest.mark.django_db
def test_complete_upload_rejects_type_mismatch(api_client, normal_user, project, monkeypatch):
    """伪造类型文件：API 返回 400，且文件状态必须真正落库为 rejected。

    回归用例：complete_upload 若整体 @transaction.atomic，_reject 写库会被随后
    抛出的 ValidationError 一起回滚，文件停在 uploading。此用例锁死该行为。
    """
    from apps.tender.models import TenderFile

    _create_owner_membership(project, normal_user)
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
