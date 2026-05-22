from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.tender.models import TenderFile
from apps.tender.tasks import cleanup_stale_uploads


@pytest.mark.django_db
def test_cleanup_stale_uploads_marks_expired(project, normal_user, monkeypatch):
    file = TenderFile.objects.create(
        project=project,
        original_name="old.pdf",
        file_size=1,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/1/original.pdf",
        status=TenderFile.STATUS_UPLOADING,
        created_by=normal_user,
    )
    TenderFile.objects.filter(pk=file.pk).update(created_at=timezone.now() - timedelta(hours=25))

    monkeypatch.setattr("apps.tender.tasks.StorageService.remove_object", lambda self, key: None)

    result = cleanup_stale_uploads()
    file.refresh_from_db()
    assert result["expired"] == 1
    assert file.status == TenderFile.STATUS_UPLOAD_EXPIRED


@pytest.mark.django_db
def test_cleanup_stale_uploads_picks_up_rejected(project, normal_user, monkeypatch):
    """H3 回归：init_upload 拆事务后，签名失败留下的 rejected 记录
    必须也被 cleanup 任务回收，否则孤儿记录永久残留。"""
    file = TenderFile.objects.create(
        project=project,
        original_name="signfail.pdf",
        file_size=1,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/9/original.pdf",
        status=TenderFile.STATUS_REJECTED,
        created_by=normal_user,
    )
    TenderFile.objects.filter(pk=file.pk).update(created_at=timezone.now() - timedelta(hours=2))

    monkeypatch.setattr("apps.tender.tasks.StorageService.remove_object", lambda self, key: None)

    result = cleanup_stale_uploads()
    file.refresh_from_db()
    assert result["expired"] == 1
    assert file.status == TenderFile.STATUS_UPLOAD_EXPIRED


@pytest.mark.django_db
def test_cleanup_stale_uploads_respects_upload_grace_hours(project, normal_user, monkeypatch):
    """UPLOAD_GRACE_HOURS 必须可配；测试用 override_settings 把 grace 拉到
    100h，验证 2h 前创建的孤儿记录不会被回收。"""
    file = TenderFile.objects.create(
        project=project,
        original_name="recent.pdf",
        file_size=1,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/7/original.pdf",
        status=TenderFile.STATUS_UPLOADING,
        created_by=normal_user,
    )
    TenderFile.objects.filter(pk=file.pk).update(created_at=timezone.now() - timedelta(hours=2))

    monkeypatch.setattr("apps.tender.tasks.StorageService.remove_object", lambda self, key: None)

    with override_settings(UPLOAD_GRACE_HOURS=100):
        result = cleanup_stale_uploads()

    file.refresh_from_db()
    assert result["expired"] == 0
    assert file.status == TenderFile.STATUS_UPLOADING
