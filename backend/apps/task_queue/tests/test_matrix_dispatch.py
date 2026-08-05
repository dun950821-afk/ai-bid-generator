"""矩阵生成派发回归：celery_task_id 必须落库（强制结束 revoke 前置）。"""

from unittest import mock

import pytest


@pytest.fixture
def user(django_user_model):
    return django_user_model.objects.create_user(username="dispatch-user", password="x")


@pytest.fixture
def outline(db, user):
    from apps.projects.models import Project
    from apps.outline.models import Outline
    from apps.projects.models import Lot

    project = Project.objects.create(name="派发测试项目", created_by=user)
    lot = Lot.objects.create(project=project, name="派发测试标段")
    return Outline.objects.create(project=project, lot=lot, name="派发测试大纲", created_by=user)


@pytest.mark.django_db
def test_matrix_dispatch_persists_celery_task_id(outline, user):
    from apps.outline.constants import GenerationTaskStatus
    from apps.outline.models import GenerationTask, Section
    from apps.outline.services.matrix_service import MatrixService

    Section.objects.create(outline=outline, title="第一章", level=1, sort_order=1)

    fake_result = mock.Mock()
    fake_result.id = "fake-celery-matrix-id"

    with mock.patch(
        "apps.outline.tasks.generate_content_matrix_task.delay", return_value=fake_result
    ):
        task = MatrixService().start_matrix_generation(outline.id, user=user)

    task.refresh_from_db()
    assert task.celery_task_id == "fake-celery-matrix-id"
    assert task.status == GenerationTaskStatus.PENDING
