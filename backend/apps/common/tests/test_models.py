import pytest
from django.contrib.auth import get_user_model

from apps.common.models import AsyncTask

User = get_user_model()


@pytest.mark.django_db
def test_create_async_task_defaults():
    user = User.objects.create_user(username="taskuser", password="Str0ng-Pass-1")
    task = AsyncTask.objects.create(task_type="tender_parse", created_by=user)
    assert task.status == "pending"
    assert task.progress == 0
    assert task.total_steps == 1
    assert task.input_payload == {}
    assert task.result_payload == {}
    assert task.created_at is not None


@pytest.mark.django_db
def test_async_task_status_choices_accept_terminal_states():
    task = AsyncTask.objects.create(task_type="export")
    for status in ["running", "success", "failed", "cancelled", "retrying"]:
        task.status = status
        task.save(update_fields=["status"])
        task.refresh_from_db()
        assert task.status == status
