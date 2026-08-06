# backend/apps/requirements/tests/test_dedup_auto_trigger.py
"""抽取完成后自动触发标段去重的测试。

覆盖：
- trigger_lot_dedup：创建 Run+Task 并分发；已有进行中 Run 时返回 None；
- extract_requirements_v2：成功（含部分成功）自动触发、无 lot 不触发、
  抽取失败不触发、已有 running 去重不重复触发；
- latest 接口：有/无记录。
"""

from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.common.models import AsyncTask
from apps.projects.models import Lot, Project
from apps.requirements.constants import DedupRunStatus
from apps.requirements.models import RequirementDedupRun
from apps.requirements.services import RequirementExtractionError
from apps.requirements.services.dedup_service import trigger_lot_dedup
from apps.requirements.tasks import extract_requirements_v2
from apps.tender.models import TenderFile


def _make_env(username: str, with_lot: bool = True):
    user = User.objects.create_user(username=username, password="x")
    project = Project.objects.create(name=f"自动去重项目-{username}", created_by=user)
    lot = None
    if with_lot:
        lot = Lot.objects.create(project=project, name=f"标段-{username}")
    tender_file = TenderFile.objects.create(
        project=project,
        lot=lot,
        original_name="招标主文件.pdf",
        object_key=f"test/auto-dedup-{username}.pdf",
        file_size=100,
        created_by=user,
        file_category=TenderFile.CATEGORY_TENDER,
    )
    return user, project, lot, tender_file


def _make_extract_task(user, tender_file) -> AsyncTask:
    return AsyncTask.objects.create(
        task_type="requirement_extraction_v2",
        celery_task_id=f"celery-extract-{tender_file.id}",
        status=AsyncTask.STATUS_PENDING,
        related_object_type="TenderFile",
        related_object_id=str(tender_file.id),
        created_by=user,
    )


def _extract_result(total=3, failed_types=None):
    return {
        "run_id": 1,
        "total_count": total,
        "success_count": total,
        "failed_types": failed_types or [],
        "requirement_ids": [1, 2, 3],
    }


def _run_extract_task(task, tender_file, extract_result=None, side_effect=None):
    """以 mock 的抽取服务同步执行 extract_requirements_v2。"""
    service = MagicMock()
    if side_effect is not None:
        service.extract_requirements.side_effect = side_effect
    else:
        service.extract_requirements.return_value = extract_result
    with patch(
        "apps.requirements.tasks.RequirementExtractService",
        return_value=service,
    ):
        extract_requirements_v2(task.id, tender_file.id, {})


@pytest.mark.django_db
class TestTriggerLotDedup:
    def test_creates_run_task_and_dispatches(self):
        user, _, lot, _ = _make_env("tf1")

        with patch(
            "apps.requirements.tasks.deduplicate_lot_requirements_task.apply_async"
        ) as mock_apply, patch(
            "apps.requirements.services.dedup_service.transaction.on_commit",
            side_effect=lambda callback: callback(),
        ):
            result = trigger_lot_dedup(lot, user, source="auto_after_extract")

        assert result is not None
        dedup_run = result["dedup_run"]
        task = result["task"]
        assert dedup_run.lot_id == lot.id
        assert dedup_run.status == DedupRunStatus.PENDING
        assert dedup_run.async_task_id == task.id
        assert dedup_run.created_by_id == user.id
        assert task.task_type == "requirement_dedup"
        mock_apply.assert_called_once()
        args = mock_apply.call_args.kwargs["args"]
        assert args[0] == task.id
        assert args[1] == lot.id
        assert args[2] == {"dedup_run_id": dedup_run.id}
        assert mock_apply.call_args.kwargs["queue"] == "parse_queue"

    def test_returns_none_when_active_run_exists(self):
        user, _, lot, _ = _make_env("tf2")
        RequirementDedupRun.objects.create(
            lot=lot,
            project=lot.project,
            status=DedupRunStatus.RUNNING,
            created_by=user,
        )

        with patch(
            "apps.requirements.tasks.deduplicate_lot_requirements_task.apply_async"
        ) as mock_apply:
            result = trigger_lot_dedup(lot, user, source="auto_after_extract")

        assert result is None
        mock_apply.assert_not_called()
        assert RequirementDedupRun.objects.filter(lot=lot).count() == 1


@pytest.mark.django_db
class TestExtractAutoTrigger:
    def test_success_triggers_dedup(self):
        user, _, lot, tender_file = _make_env("ex1")
        task = _make_extract_task(user, tender_file)

        with patch(
            "apps.requirements.tasks.trigger_lot_dedup"
        ) as mock_trigger:
            _run_extract_task(task, tender_file, _extract_result())

        mock_trigger.assert_called_once_with(
            lot, user, source="auto_after_extract"
        )
        task.refresh_from_db()
        assert task.status == AsyncTask.STATUS_SUCCESS

    def test_partial_success_still_triggers(self):
        user, _, lot, tender_file = _make_env("ex2")
        task = _make_extract_task(user, tender_file)

        with patch(
            "apps.requirements.tasks.trigger_lot_dedup"
        ) as mock_trigger:
            _run_extract_task(
                task, tender_file, _extract_result(total=2, failed_types=["scoring"])
            )

        mock_trigger.assert_called_once()
        task.refresh_from_db()
        assert task.status == AsyncTask.STATUS_SUCCESS

    def test_no_lot_does_not_trigger(self):
        user, _, lot, tender_file = _make_env("ex3", with_lot=False)
        assert lot is None
        task = _make_extract_task(user, tender_file)

        with patch(
            "apps.requirements.tasks.trigger_lot_dedup"
        ) as mock_trigger:
            _run_extract_task(task, tender_file, _extract_result())

        mock_trigger.assert_not_called()
        task.refresh_from_db()
        assert task.status == AsyncTask.STATUS_SUCCESS

    def test_extraction_failure_does_not_trigger(self):
        user, _, lot, tender_file = _make_env("ex4")
        task = _make_extract_task(user, tender_file)

        with patch(
            "apps.requirements.tasks.trigger_lot_dedup"
        ) as mock_trigger:
            _run_extract_task(
                task,
                tender_file,
                side_effect=RequirementExtractionError("抽取失败"),
            )

        mock_trigger.assert_not_called()
        task.refresh_from_db()
        assert task.status == AsyncTask.STATUS_FAILED

    def test_existing_running_dedup_not_duplicated(self):
        """真实 trigger：已有 running 去重时抽取成功不重复创建。"""
        user, _, lot, tender_file = _make_env("ex5")
        task = _make_extract_task(user, tender_file)
        RequirementDedupRun.objects.create(
            lot=lot,
            project=lot.project,
            status=DedupRunStatus.RUNNING,
            created_by=user,
        )

        with patch(
            "apps.requirements.tasks.deduplicate_lot_requirements_task.apply_async"
        ) as mock_apply:
            _run_extract_task(task, tender_file, _extract_result())

        mock_apply.assert_not_called()
        assert RequirementDedupRun.objects.filter(lot=lot).count() == 1
        task.refresh_from_db()
        assert task.status == AsyncTask.STATUS_SUCCESS

    def test_success_creates_dedup_run_end_to_end(self):
        """真实 trigger：抽取成功后自动预建 DedupRun 并分发。"""
        user, _, lot, tender_file = _make_env("ex6")
        task = _make_extract_task(user, tender_file)

        with patch(
            "apps.requirements.tasks.deduplicate_lot_requirements_task.apply_async"
        ) as mock_apply, patch(
            "apps.requirements.services.dedup_service.transaction.on_commit",
            side_effect=lambda callback: callback(),
        ):
            _run_extract_task(task, tender_file, _extract_result())

        dedup_run = RequirementDedupRun.objects.get(lot=lot)
        assert dedup_run.status == DedupRunStatus.PENDING
        assert dedup_run.created_by_id == user.id
        mock_apply.assert_called_once()


@pytest.mark.django_db
class TestLatestDedupRunApi:
    def _auth_client(self, user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_latest_returns_null_when_no_runs(self):
        user, _, lot, _ = _make_env("latest1")

        response = self._auth_client(user).get(
            f"/api/requirements/lots/{lot.id}/dedup-runs/latest/"
        )

        assert response.status_code == 200
        assert response.json() == {"result": None}

    def test_latest_returns_most_recent_run(self):
        user, _, lot, _ = _make_env("latest2")
        RequirementDedupRun.objects.create(
            lot=lot,
            project=lot.project,
            status=DedupRunStatus.SUCCESS,
            total_count=10,
            cluster_count=2,
            duplicate_count=3,
            created_by=user,
        )
        newer = RequirementDedupRun.objects.create(
            lot=lot,
            project=lot.project,
            status=DedupRunStatus.RUNNING,
            created_by=user,
        )

        response = self._auth_client(user).get(
            f"/api/requirements/lots/{lot.id}/dedup-runs/latest/"
        )

        assert response.status_code == 200
        result = response.json()["result"]
        assert result["id"] == newer.id
        assert result["status"] == DedupRunStatus.RUNNING
        assert result["total_count"] == 0
        assert result["cluster_count"] == 0
        assert result["duplicate_count"] == 0
        assert result["async_task_id"] is None
        assert result["created_at"]
        assert result["finished_at"] is None

    def test_latest_missing_lot_404(self):
        user, _, _, _ = _make_env("latest3")
        response = self._auth_client(user).get(
            "/api/requirements/lots/999999/dedup-runs/latest/"
        )
        assert response.status_code == 404

    def test_latest_unauthenticated_403(self):
        _, _, lot, _ = _make_env("latest4")
        response = APIClient().get(
            f"/api/requirements/lots/{lot.id}/dedup-runs/latest/"
        )
        assert response.status_code in (401, 403)
