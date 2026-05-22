import pytest

from apps.common.models import AsyncTask


@pytest.mark.django_db
def test_task_detail_returns_owner_task(api_client, normal_user):
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status="running",
        progress=30,
        current_step="正在解析",
        created_by=normal_user,
    )
    api_client.force_authenticate(normal_user)

    response = api_client.get(f"/api/tasks/{task.id}")
    assert response.status_code == 200
    assert response.data["id"] == task.id
    assert response.data["progress"] == 30


@pytest.mark.django_db
def test_task_detail_forbidden_for_other_user(api_client, normal_user, bid_manager_user):
    task = AsyncTask.objects.create(task_type="tender_parse", created_by=bid_manager_user)
    api_client.force_authenticate(normal_user)

    response = api_client.get(f"/api/tasks/{task.id}")
    assert response.status_code == 403


@pytest.mark.django_db
def test_task_detail_system_admin_can_view(api_client, admin_user, normal_user):
    task = AsyncTask.objects.create(task_type="tender_parse", created_by=normal_user)
    api_client.force_authenticate(admin_user)

    response = api_client.get(f"/api/tasks/{task.id}")
    assert response.status_code == 200
