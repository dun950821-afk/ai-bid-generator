# backend/apps/outline/tests/test_matrix_batching.py
"""矩阵生成分批处理测试。"""

import re
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus, GenerationTaskType
from apps.outline.models import GenerationTask, Outline, Section
from apps.projects.models import Lot, Project

User = get_user_model()


def _make_prompt_run(sections_payload):
    run = MagicMock()
    run.status = "succeeded"
    run.output_json = {"sections": sections_payload}
    run.output_text = ""
    run.error_message = ""
    return run


def _sections_payload_from_structure(outline_structure: str):
    """按 prompt 中实际传入的大纲结构生成矩阵数据，模拟 AI 按批次返回。"""
    ids = [int(m) for m in re.findall(r"\[ID:(\d+)\]", outline_structure)]
    return [
        {
            "section_id": sid,
            "write_scope": f"scope-{sid}",
            "reference_sections": [],
            "no_duplicate_sections": [],
            "dependency_sections": [],
        }
        for sid in ids
    ]


@pytest.mark.django_db
class TestMatrixBatching:
    """generate_content_matrix_task 分批生成测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u_matrix_batch", password="p")
        self.project = Project.objects.create(name="P", created_by=self.user)
        self.lot = Lot.objects.create(name="L", project=self.project)
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="O",
            source="preset", created_by=self.user,
        )

    def _create_sections(self, count: int):
        sections = []
        for i in range(count):
            sections.append(Section.objects.create(
                outline=self.outline,
                title=f"章节{i + 1}",
                level=1,
                sort_order=i + 1,
                content_matrix_status=ContentMatrixStatus.PENDING,
            ))
        return sections

    def _create_task(self):
        return GenerationTask.objects.create(
            task_type=GenerationTaskType.MATRIX_GENERATION,
            outline=self.outline,
            status=GenerationTaskStatus.PENDING,
            created_by=self.user,
            params={},
        )

    def _run_task(self, task, fake_execute):
        from apps.outline.tasks import generate_content_matrix_task

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            fake_execute,
        ), patch(
            "apps.outline.services.matrix_service.MatrixService.acquire_matrix_generation_lock",
            return_value=True,
        ), patch(
            "apps.outline.services.matrix_service.MatrixService.release_matrix_generation_lock",
        ):
            generate_content_matrix_task(self.outline.id, task.id)

    @override_settings(CONTENT_MATRIX_BATCH_SIZE=10)
    def test_sections_split_into_batches(self):
        """25 个章节应按 10/批拆成 3 次 AI 调用，全部生成成功。"""
        sections = self._create_sections(25)
        task = self._create_task()

        calls = []

        def fake_execute(self, scenario, variables, created_by, business_context=None):
            calls.append(variables)
            return _make_prompt_run(
                _sections_payload_from_structure(variables["outline_structure"])
            )

        self._run_task(task, fake_execute)

        assert len(calls) == 3
        # 每批次的 prompt 只包含本批章节
        assert [len(re.findall(r"\[ID:", c["outline_structure"])) for c in calls] == [10, 10, 5]

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.COMPLETED
        assert task.success_count == 25
        assert task.failed_count == 0
        assert task.result["batch_progress"] == {"current_batch": 3, "total_batches": 3}

        generated = Section.objects.filter(
            outline=self.outline,
            content_matrix_status=ContentMatrixStatus.GENERATED,
        ).count()
        assert generated == 25

    @override_settings(CONTENT_MATRIX_BATCH_SIZE=10)
    def test_single_batch_failure_does_not_block_others(self):
        """单批 AI 调用失败不阻断其他批次，任务为部分成功。"""
        self._create_sections(25)
        task = self._create_task()

        state = {"n": 0}

        def fake_execute(self, scenario, variables, created_by, business_context=None):
            state["n"] += 1
            if state["n"] == 2:
                raise Exception("AI 服务异常")
            return _make_prompt_run(
                _sections_payload_from_structure(variables["outline_structure"])
            )

        self._run_task(task, fake_execute)

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.PARTIAL_SUCCESS
        assert task.success_count == 15
        assert task.failed_count == 10

        failed = Section.objects.filter(
            outline=self.outline,
            content_matrix_status=ContentMatrixStatus.FAILED,
        )
        assert failed.count() == 10
        assert all("AI 服务异常" in s.content_matrix_error for s in failed)

    @override_settings(CONTENT_MATRIX_BATCH_SIZE=10)
    def test_cancel_between_batches(self):
        """批次间检测到取消请求：已完成批次保留，剩余章节重置为 PENDING。"""
        self._create_sections(25)
        task = self._create_task()

        state = {"n": 0}

        def fake_execute(self, scenario, variables, created_by, business_context=None):
            state["n"] += 1
            if state["n"] == 1:
                # 第一批完成后用户请求取消
                GenerationTask.objects.filter(pk=task.id).update(
                    status=GenerationTaskStatus.CANCEL_REQUESTED
                )
            return _make_prompt_run(
                _sections_payload_from_structure(variables["outline_structure"])
            )

        self._run_task(task, fake_execute)

        # 只调用了第一批
        assert state["n"] == 1

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.CANCELLED
        assert task.success_count == 10

        assert Section.objects.filter(
            outline=self.outline,
            content_matrix_status=ContentMatrixStatus.GENERATED,
        ).count() == 10
        pending = Section.objects.filter(
            outline=self.outline,
            content_matrix_status=ContentMatrixStatus.PENDING,
        )
        assert pending.count() == 15
        assert all(s.content_matrix_error == "任务已取消" for s in pending)

    @override_settings(CONTENT_MATRIX_BATCH_SIZE=10)
    def test_progress_updated_between_batches(self):
        """每批完成后 success_count / failed_count 与 batch_progress 被更新。"""
        self._create_sections(15)
        task = self._create_task()

        progress_snapshots = []

        original_save = GenerationTask.save

        def spy_save(instance, *args, **kwargs):
            original_save(instance, *args, **kwargs)
            if (
                instance.pk == task.id
                and instance.result
                and "batch_progress" in (instance.result or {})
            ):
                progress_snapshots.append({
                    "success": instance.success_count,
                    "failed": instance.failed_count,
                    "batch": instance.result["batch_progress"]["current_batch"],
                })

        def fake_execute(self, scenario, variables, created_by, business_context=None):
            return _make_prompt_run(
                _sections_payload_from_structure(variables["outline_structure"])
            )

        with patch.object(GenerationTask, "save", spy_save):
            self._run_task(task, fake_execute)

        # 至少捕获到两个批次的中间进度
        assert any(s["batch"] == 1 and s["success"] == 10 for s in progress_snapshots)
        assert any(s["batch"] == 2 and s["success"] == 15 for s in progress_snapshots)

    @override_settings(CONTENT_MATRIX_BATCH_SIZE=10)
    def test_out_of_batch_sections_ignored(self):
        """AI 返回非本批次章节时忽略，不覆盖其他章节状态。"""
        sections = self._create_sections(15)
        task = self._create_task()

        def fake_execute(self, scenario, variables, created_by, business_context=None):
            payload = _sections_payload_from_structure(variables["outline_structure"])
            # 混入一个不属于本批次的章节
            payload.append({
                "section_id": sections[-1].id,
                "write_scope": "out-of-batch",
            })
            return _make_prompt_run(payload)

        self._run_task(task, fake_execute)

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.COMPLETED
        # 最后一个章节只被其所在批次写入一次（默认版本号 1 + 一次写入 = 2）
        last = Section.objects.get(pk=sections[-1].id)
        assert last.content_matrix_status == ContentMatrixStatus.GENERATED
        assert last.content_matrix_version == 2
