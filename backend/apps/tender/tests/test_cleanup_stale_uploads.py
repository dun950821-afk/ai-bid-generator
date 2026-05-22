from datetime import timedelta

import pytest
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
