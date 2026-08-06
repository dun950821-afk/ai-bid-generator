# backend/apps/requirements/tests/test_dedup_api.py
"""标段级条款去重 API 测试（Phase 2）。

覆盖：触发接口（含 409 防重）、duplicates 溯源接口、
列表接口默认隐藏已合并 / include_duplicates / merged_count。
"""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.projects.models import Lot, Project
from apps.requirements.constants import DedupRunStatus, ExtractionRunStatus
from apps.requirements.models import (
    RequirementDedupRun,
    RequirementExtractionRun,
    TenderRequirement,
)
from apps.tender.models import TenderFile


def _make_env(username: str):
    user = User.objects.create_user(username=username, password="x")
    project = Project.objects.create(name=f"API项目-{username}", created_by=user)
    lot = Lot.objects.create(project=project, name=f"标段-{username}")
    tender_file = TenderFile.objects.create(
        project=project,
        lot=lot,
        original_name="招标主文件.pdf",
        object_key=f"test/dedup-api-{username}.pdf",
        file_size=100,
        created_by=user,
        file_category=TenderFile.CATEGORY_TENDER,
    )
    run = RequirementExtractionRun.objects.create(
        tender_file=tender_file,
        project=project,
        status=ExtractionRunStatus.SUCCESS,
        extraction_types=["qualification"],
        is_active=True,
        created_by=user,
    )
    return user, lot, tender_file, run


def _req(tender_file, run, key, title, content, **kwargs):
    defaults = {"extraction_type": "qualification"}
    defaults.update(kwargs)
    return TenderRequirement.objects.create(
        tender_file=tender_file,
        requirement_key=key,
        title=title,
        content=content,
        extraction_run=run,
        **defaults,
    )


def _auth_client(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestDedupTriggerApi:
    def test_trigger_creates_run_and_task(self, admin_user):
        _, lot, _, _ = _make_env("trig1")

        # on_commit 在 pytest-django 事务包装下不会触发，同步执行回调代替
        with patch(
            "apps.requirements.tasks.deduplicate_lot_requirements_task.apply_async"
        ) as mock_apply, patch(
            "apps.requirements.services.dedup_service.transaction.on_commit",
            side_effect=lambda callback: callback(),
        ):
            response = _auth_client(admin_user).post(
                f"/api/requirements/lots/{lot.id}/dedup/"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"
        assert data["task_id"]
        assert data["dedup_run_id"]

        dedup_run = RequirementDedupRun.objects.get(pk=data["dedup_run_id"])
        assert dedup_run.lot_id == lot.id
        assert dedup_run.status == DedupRunStatus.PENDING
        assert dedup_run.async_task_id == data["task_id"]
        assert "cosine_threshold" in dedup_run.params
        mock_apply.assert_called_once()
        assert mock_apply.call_args.kwargs["queue"] == "parse_queue"

    def test_trigger_conflict_when_running(self, admin_user):
        user, lot, _, _ = _make_env("trig2")
        RequirementDedupRun.objects.create(
            lot=lot,
            project=lot.project,
            status=DedupRunStatus.RUNNING,
            created_by=user,
        )

        response = _auth_client(admin_user).post(
            f"/api/requirements/lots/{lot.id}/dedup/"
        )

        assert response.status_code == 409
        assert response.json()["success"] is False

    def test_trigger_missing_lot_404(self, admin_user):
        response = _auth_client(admin_user).post("/api/requirements/lots/999999/dedup/")
        assert response.status_code == 404


@pytest.mark.django_db
class TestDuplicatesApi:
    def test_duplicates_list(self):
        user, lot, tender_file, run = _make_env("dup1")
        kept = _req(tender_file, run, "dup1-k1", "资格要求", "投标人应具备资质。", dedup_status="kept")
        dup1 = _req(
            tender_file, run, "dup1-k2", "企业资质", "投标人须具有相关资质证书。",
            dedup_status="duplicate", merged_into=kept, source_page=12,
        )
        dup2 = _req(
            tender_file, run, "dup1-k3", "资质条件", "投标人需提供资质证明。",
            dedup_status="duplicate", merged_into=kept, source_page=13,
        )
        _req(tender_file, run, "dup1-k4", "付款方式", "按进度付款。")

        response = _auth_client(user).get(f"/api/requirements/{kept.id}/duplicates/")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 2
        results = {r["id"]: r for r in data["results"]}
        assert set(results) == {dup1.id, dup2.id}
        item = results[dup1.id]
        assert item["tender_file_name"] == "招标主文件.pdf"
        assert item["tender_file_id"] == tender_file.id
        assert item["source_page"] == 12
        assert item["merged_into_id"] == kept.id
        assert item["dedup_status"] == "duplicate"

    def test_duplicates_empty_for_plain_requirement(self):
        user, lot, tender_file, run = _make_env("dup2")
        kept = _req(tender_file, run, "dup2-k1", "资格要求", "投标人应具备资质。")

        response = _auth_client(user).get(f"/api/requirements/{kept.id}/duplicates/")

        assert response.status_code == 200
        assert response.json()["count"] == 0


@pytest.mark.django_db
class TestListApiDedupFilter:
    def _make_marked(self, username="list1"):
        user, lot, tender_file, run = _make_env(username)
        kept = _req(
            tender_file, run, f"{username}-k1", "资格要求", "投标人应具备资质。",
            dedup_status="kept",
        )
        dup = _req(
            tender_file, run, f"{username}-k2", "企业资质", "投标人须具有相关资质证书。",
            dedup_status="duplicate", merged_into=kept,
        )
        plain = _req(tender_file, run, f"{username}-k3", "付款方式", "按进度付款。")
        return user, tender_file, kept, dup, plain

    def test_default_hides_duplicates(self):
        user, tender_file, kept, dup, plain = self._make_marked("list2")
        response = _auth_client(user).get(f"/api/requirements/files/{tender_file.id}/")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 2
        ids = {r["id"] for r in data["results"]}
        assert ids == {kept.id, plain.id}

    def test_include_duplicates_returns_all(self):
        user, tender_file, kept, dup, plain = self._make_marked("list3")
        response = _auth_client(user).get(
            f"/api/requirements/files/{tender_file.id}/?include_duplicates=true"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 3
        results = {r["id"]: r for r in data["results"]}
        assert results[dup.id]["dedup_status"] == "duplicate"

    def test_merged_count_annotated(self):
        user, tender_file, kept, dup, plain = self._make_marked("list4")
        response = _auth_client(user).get(f"/api/requirements/files/{tender_file.id}/")

        assert response.status_code == 200
        results = {r["id"]: r for r in response.json()["results"]}
        assert results[kept.id]["merged_count"] == 1
        assert results[plain.id]["merged_count"] == 0
