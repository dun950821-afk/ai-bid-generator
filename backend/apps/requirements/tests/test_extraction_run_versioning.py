# backend/apps/requirements/tests/test_extraction_run_versioning.py
"""条款抽取 Run 版本机制测试（Phase 1）。"""

import pytest
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.projects.models import Project
from apps.requirements.constants import ExtractionRunStatus
from apps.requirements.models import RequirementExtractionRun, TenderRequirement
from apps.requirements.services.extraction.orchestrator import SingleTypeExtractor
from apps.requirements.services.requirement_extract_service import RequirementExtractService
from apps.tender.models import TenderFile


def _make_env(username="ver-user"):
    user = User.objects.create_user(username=username, password="x")
    project = Project.objects.create(name=f"版本项目-{username}", created_by=user)
    tender_file = TenderFile.objects.create(
        project=project,
        original_name="ver.pdf",
        object_key=f"test/ver-{username}.pdf",
        file_size=100,
        created_by=user,
        status="parsed",
    )
    return user, tender_file


def _run_extraction(user, tender_file, fake_extract, extraction_types=None):
    """走完整编排流程（上下文 mock、抽取 mock），返回 (result, run)。"""
    extraction_types = extraction_types or ["scoring"]
    service = RequirementExtractService()

    def fake_build_all(tender_file_, model_config_id, valid_types):
        return {
            t: SimpleNamespace(document_text="doc", chunk_context="", model_config=None)
            for t in valid_types
        }

    with patch.object(
        service.orchestrator.context_builder, "build_all", fake_build_all
    ), patch.object(SingleTypeExtractor, "extract", fake_extract):
        result = service.extract_requirements(
            tender_file_id=tender_file.id,
            extraction_types=extraction_types,
            created_by=user,
        )
    run = RequirementExtractionRun.objects.get(pk=result["run_id"])
    return result, run


def _ok_extract(self, **kwargs):
    return {"count": 1, "ids": [1], "prompt_version": {"version": "3.1"}}


@pytest.mark.django_db
class TestRunAutoActivation:
    """抽取成功后自动成为当前版本，同文件唯一 active。"""

    def test_success_run_auto_activates(self):
        user, tender_file = _make_env("act-user")
        _, run = _run_extraction(user, tender_file, _ok_extract)
        assert run.status == ExtractionRunStatus.SUCCESS
        assert run.is_active is True

    def test_second_extraction_switches_active(self):
        """连续两次抽取：active 切换到新 run，且全文件恰有一个 active。"""
        user, tender_file = _make_env("switch-user")
        _, run1 = _run_extraction(user, tender_file, _ok_extract)
        _, run2 = _run_extraction(user, tender_file, _ok_extract)

        run1.refresh_from_db()
        run2.refresh_from_db()
        assert run1.is_active is False
        assert run2.is_active is True
        active_count = RequirementExtractionRun.objects.filter(
            tender_file=tender_file, is_active=True
        ).count()
        assert active_count == 1

    def test_failed_run_keeps_old_active(self):
        """FAILED 不切换：旧当前版本保留。"""
        from apps.requirements.services import RequirementExtractionError

        user, tender_file = _make_env("fail-user")
        _, run1 = _run_extraction(user, tender_file, _ok_extract)

        def fail_extract(self, **kwargs):
            raise RequirementExtractionError("模拟失败")

        _, run2 = _run_extraction(user, tender_file, fail_extract)

        run1.refresh_from_db()
        run2.refresh_from_db()
        assert run2.status == ExtractionRunStatus.FAILED
        assert run2.is_active is False
        assert run1.is_active is True

    def test_partial_success_activates(self):
        from apps.requirements.services import RequirementExtractionError

        user, tender_file = _make_env("part-user")

        def half_fail(self, **kwargs):
            if kwargs["extraction_type"] == "technical":
                raise RequirementExtractionError("模拟失败")
            return {"count": 1, "ids": [1], "prompt_version": {"version": "3.1"}}

        _, run = _run_extraction(user, tender_file, half_fail, ["scoring", "technical"])
        assert run.status == ExtractionRunStatus.PARTIAL_SUCCESS
        assert run.is_active is True


@pytest.mark.django_db
class TestRequirementListActiveRun:
    """列表 API：默认当前版本 / 指定历史版本 / 无当前版本回退。"""

    def _make_runs_with_requirements(self, username="list-user"):
        """构造：两个 run 各 2 条条款，run1 active。"""
        user, tender_file = _make_env(username)
        run1 = RequirementExtractionRun.objects.create(
            tender_file=tender_file,
            project=tender_file.project,
            status=ExtractionRunStatus.SUCCESS,
            extraction_types=["scoring"],
            created_by=user,
        )
        run2 = RequirementExtractionRun.objects.create(
            tender_file=tender_file,
            project=tender_file.project,
            status=ExtractionRunStatus.SUCCESS,
            extraction_types=["scoring"],
            created_by=user,
        )
        for i, run in enumerate((run1, run2)):
            for j in range(2):
                TenderRequirement.objects.create(
                    tender_file=tender_file,
                    requirement_key=f"{username}-run{i}-key{j}",
                    content=f"run{i} 条款 {j}",
                    extraction_type="scoring",
                    extraction_run=run,
                )
        run1.activate()
        return user, tender_file, run1, run2

    def _get(self, user, tender_file, params=""):
        client = APIClient()
        client.force_authenticate(user=user)
        url = f"/api/requirements/files/{tender_file.id}/"
        if params:
            url += f"?{params}"
        response = client.get(url)
        assert response.status_code == 200
        return response.json()

    def test_default_lists_active_run_only(self):
        user, tender_file, run1, run2 = self._make_runs_with_requirements("def-user")
        data = self._get(user, tender_file)
        assert data["active_run_id"] == run1.id
        assert data["count"] == 2
        contents = {r["content"] for r in data["results"]}
        assert all("run0" in c for c in contents)

    def test_explicit_run_id_lists_history(self):
        """指定 extraction_run_id 时按指定 run 过滤，不叠加 active。"""
        user, tender_file, run1, run2 = self._make_runs_with_requirements("his-user")
        data = self._get(user, tender_file, f"extraction_run_id={run2.id}")
        assert data["active_run_id"] == run1.id
        assert data["count"] == 2
        contents = {r["content"] for r in data["results"]}
        assert all("run1" in c for c in contents)

    def test_fallback_when_no_active_run(self):
        """无 active run 时回退现状（全部 is_active 条款）。"""
        user, tender_file, run1, run2 = self._make_runs_with_requirements("fb-user")
        RequirementExtractionRun.objects.filter(tender_file=tender_file).update(
            is_active=False
        )
        data = self._get(user, tender_file)
        assert data["active_run_id"] is None
        assert data["count"] == 4


@pytest.mark.django_db
class TestExtractionRunApis:
    """运行历史列表 API 与手动激活 API。"""

    def _make_runs(self, username="api-user"):
        user, tender_file = _make_env(username)
        run1 = RequirementExtractionRun.objects.create(
            tender_file=tender_file,
            project=tender_file.project,
            status=ExtractionRunStatus.SUCCESS,
            extraction_types=["scoring"],
            total_count=2,
            success_count=2,
            created_by=user,
        )
        run2 = RequirementExtractionRun.objects.create(
            tender_file=tender_file,
            project=tender_file.project,
            status=ExtractionRunStatus.FAILED,
            extraction_types=["scoring", "technical"],
            failed_types=["scoring", "technical"],
            created_by=user,
        )
        run1.activate()
        return user, tender_file, run1, run2

    def test_run_list_api(self, admin_user):
        user, tender_file, run1, run2 = self._make_runs()
        client = APIClient()
        client.force_authenticate(user=admin_user)
        response = client.get(f"/api/requirements/files/{tender_file.id}/runs/")
        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 2
        # 按创建时间倒序：run2 在前
        assert results[0]["id"] == run2.id
        assert results[1]["id"] == run1.id
        assert results[1]["is_active"] is True
        for field in (
            "id", "status", "extraction_types", "total_count", "success_count",
            "failed_types", "prompt_versions", "overwrite", "is_active",
            "created_at", "finished_at",
        ):
            assert field in results[0]

    def test_activate_api_switches_exclusively(self, admin_user):
        user, tender_file, run1, run2 = self._make_runs("sw-api-user")
        # run2 置为 partial_success 以便可激活
        run2.status = ExtractionRunStatus.PARTIAL_SUCCESS
        run2.save(update_fields=["status"])

        client = APIClient()
        client.force_authenticate(user=admin_user)
        response = client.post(f"/api/requirements/runs/{run2.id}/activate/")
        assert response.status_code == 200
        assert response.json()["run_id"] == run2.id

        run1.refresh_from_db()
        run2.refresh_from_db()
        assert run2.is_active is True
        assert run1.is_active is False
        assert RequirementExtractionRun.objects.filter(
            tender_file=tender_file, is_active=True
        ).count() == 1

    def test_activate_failed_run_rejected(self, admin_user):
        user, tender_file, run1, run2 = self._make_runs("rej-api-user")
        client = APIClient()
        client.force_authenticate(user=admin_user)
        response = client.post(f"/api/requirements/runs/{run2.id}/activate/")
        assert response.status_code == 400

        run1.refresh_from_db()
        assert run1.is_active is True

    def test_activate_missing_run_404(self, admin_user):
        client = APIClient()
        client.force_authenticate(user=admin_user)
        response = client.post("/api/requirements/runs/999999/activate/")
        assert response.status_code == 404


@pytest.mark.django_db
class TestReparseKeepsOldRequirements:
    """重解析链路 overwrite=False：旧条款保留，新版本生效。"""

    def test_reparse_no_overwrite_keeps_old_and_switches_version(self):
        user, tender_file = _make_env("reparse-user")

        # 第一次抽取成功（成为当前版本），并预置一条属于该 run 的条款
        _, run1 = _run_extraction(user, tender_file, _ok_extract)
        old_req = TenderRequirement.objects.create(
            tender_file=tender_file,
            requirement_key="reparse-old-key",
            content="人工编辑过的旧条款",
            extraction_type="scoring",
            extraction_run=run1,
        )

        # 重解析自动抽取：overwrite=False（不删除旧条款）
        service = RequirementExtractService()

        def fake_build_all(tender_file_, model_config_id, valid_types):
            return {
                t: SimpleNamespace(document_text="doc", chunk_context="", model_config=None)
                for t in valid_types
            }

        with patch.object(
            service.orchestrator.context_builder, "build_all", fake_build_all
        ), patch.object(SingleTypeExtractor, "extract", _ok_extract):
            result = service.extract_requirements(
                tender_file_id=tender_file.id,
                extraction_types=["scoring"],
                created_by=user,
                overwrite=False,
            )

        # 旧条款保留（含人工编辑）
        assert TenderRequirement.objects.filter(pk=old_req.pk).exists()
        # 新 run 成为当前版本
        run1.refresh_from_db()
        run2 = RequirementExtractionRun.objects.get(pk=result["run_id"])
        assert run2.is_active is True
        assert run1.is_active is False
