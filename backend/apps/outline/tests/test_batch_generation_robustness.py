# backend/apps/outline/tests/test_batch_generation_robustness.py
"""批量正文生成健壮性测试：异常兜底、瞬时错误重试、chord 派发失败。"""

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db.utils import OperationalError
from django.test import TestCase

from apps.outline.constants import (
    GenerationRecordStatus,
    GenerationTaskStatus,
    SectionGenerationStatus,
)
from apps.outline.models import (
    BatchGenerationTaskItem,
    GenerationTask,
    Outline,
    Section,
    SectionGenerationRecord,
)
from apps.projects.models import Lot, Project

User = get_user_model()


class BatchGenerationRobustnessTest(TestCase):
    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_batch_robust_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )
        self.section = Section.objects.create(
            outline=self.outline, title="1.1 章节", level=1, sort_order=1,
        )

    def _create_batch_task(self):
        task = GenerationTask.objects.create(
            outline=self.outline, task_type="batch_section_generation",
            status=GenerationTaskStatus.RUNNING, created_by=self.user,
            params={"skip_on_failure": True},
        )
        BatchGenerationTaskItem.objects.create(
            task=task, section=self.section, sort_index=0, status="pending",
        )
        return task

    def test_missing_task_does_not_raise(self):
        """GenerationTask 被删除后子任务直接返回，不向 chord 抛异常。"""
        from apps.outline.tasks import generate_single_section_for_batch

        result = generate_single_section_for_batch.apply(args=[self.section.id, 999999])
        assert result.get() is None

    def test_transient_db_error_triggers_retry(self):
        """瞬时数据库错误自动重试：首次失败后重试成功，retry_count 记录为 1。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.tasks import generate_single_section_for_batch

        task = self._create_batch_task()

        state = {"n": 0}

        def flaky_execute(section_id, record_id, user_id, user_prompt):
            state["n"] += 1
            if state["n"] == 1:
                raise OperationalError("connection lost")
            return {"success": True, "word_count": 100}

        with patch.object(
            tasks_module, "_execute_single_section_generation",
            side_effect=flaky_execute,
        ), patch.object(tasks_module, "_inline_expand_section", return_value=None):
            result = generate_single_section_for_batch.apply(args=[self.section.id, task.id])
            assert result.get() is None

        # 首次失败 + 一次重试成功
        assert state["n"] == 2
        item = BatchGenerationTaskItem.objects.get(task=task, section=self.section)
        assert item.status == "success"
        assert item.retry_count == 1

    def test_db_retries_exhausted_marks_failed(self):
        """重试次数用尽后子项标记为失败，不抛异常。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.tasks import generate_single_section_for_batch

        task = self._create_batch_task()

        with patch.object(
            tasks_module, "_execute_single_section_generation",
            side_effect=OperationalError("connection lost"),
        ), patch("apps.task_queue.services.config_service.get_task_config", return_value=0):
            result = generate_single_section_for_batch.apply(args=[self.section.id, task.id])
            assert result.get() is None

        item = BatchGenerationTaskItem.objects.get(task=task, section=self.section)
        assert item.status == "failed"
        assert "数据库连接错误" in item.error_message

        task.refresh_from_db()
        assert task.failed_count == 1

    def test_chord_dispatch_failure_finalizes_task(self):
        """chord 派发失败（如 broker 异常）时任务标记 FAILED，子项不滞留 pending。"""
        from apps.outline.tasks import batch_section_generation_task

        task = self._create_batch_task()

        with patch("apps.outline.tasks.chord", side_effect=Exception("broker down")):
            batch_section_generation_task.apply(args=[task.id]).get()

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.FAILED
        assert "任务派发失败" in task.error_message

        item = BatchGenerationTaskItem.objects.get(task=task, section=self.section)
        assert item.status == "failed"
        assert "任务派发失败" in item.error_message

    def test_on_batch_complete_finalize_failure_marks_failed(self):
        """_finalize_batch_task 异常时回调兜底：任务标记 FAILED 而非卡死。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.tasks import on_batch_complete

        task = self._create_batch_task()

        with patch.object(
            tasks_module, "_finalize_batch_task",
            side_effect=Exception("db error in finalize"),
        ):
            result = on_batch_complete.apply(args=[[None], task.id])
            assert result.get() is None

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.FAILED
        assert "批量任务收尾失败" in task.error_message

    def test_on_batch_complete_task_deleted(self):
        """任务被删除后回调直接返回，不抛异常。"""
        from apps.outline.tasks import on_batch_complete

        result = on_batch_complete.apply(args=[[], 999999])
        assert result.get() is None

    def _create_batch_record(self, task):
        """批量流程的记录：async_task=None（不再创建书签 AsyncTask）。"""
        return SectionGenerationRecord.objects.create(
            section=self.section,
            async_task=None,
            input_summary={"batch_task_id": task.id, "sort_index": 0},
            status=GenerationRecordStatus.PENDING,
            created_by=self.user,
        )

    def test_batch_flow_creates_no_async_task(self):
        """批量生成子任务不创建书签 AsyncTask（回归：队列列表堆积废弃任务）。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.tasks import generate_single_section_for_batch

        task = self._create_batch_task()
        with patch.object(
            tasks_module, "_execute_single_section_generation",
            return_value={"success": True, "word_count": 100},
        ), patch.object(tasks_module, "_inline_expand_section", return_value=None):
            result = generate_single_section_for_batch.apply(args=[self.section.id, task.id])
            assert result.get() is None

        from apps.common.models import AsyncTask

        assert not AsyncTask.objects.filter(
            task_type="section_generate", related_object_id=str(self.section.id),
        ).exists()
        record = SectionGenerationRecord.objects.get(section=self.section)
        assert record.async_task is None

    def test_generate_section_blocked_while_batch_active(self):
        """批量任务活跃时对章节重复触发单章节生成应被拒绝。"""
        from apps.outline.services.section_generation_service import SectionGenerationService

        task = self._create_batch_task()
        self._create_batch_record(task)
        self.section.generation_status = SectionGenerationStatus.PENDING
        self.section.save()

        with pytest.raises(ValueError, match="批量生成中"):
            SectionGenerationService().generate_section(
                self.section.id, {}, "", self.user,
            )

    def test_generate_section_allowed_after_batch_failed(self):
        """批量任务已失败/回收后，章节可重新单章节生成（不卡死）。"""
        from unittest.mock import patch as mock_patch

        from apps.outline.services.section_generation_service import SectionGenerationService

        task = self._create_batch_task()
        task.status = GenerationTaskStatus.FAILED
        task.save(update_fields=["status"])
        self._create_batch_record(task)
        self.section.generation_status = SectionGenerationStatus.PENDING
        self.section.save()

        with mock_patch("apps.common.tasks_utils.dispatch_async_task"):
            async_task = SectionGenerationService().generate_section(
                self.section.id, {}, "", self.user,
            )

        assert async_task is not None
        assert async_task.task_type == "section_generate"
        # 新的独立任务不再关联批量记录
        assert async_task.input_payload.get("section_id") == self.section.id

    def test_batch_inline_expand_when_word_count_short(self):
        """生成后字数不足 → 内联扩写，item 记录扩写信息与扩写后字数。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.tasks import generate_single_section_for_batch

        task = self._create_batch_task()

        with patch.object(
            tasks_module, "_execute_single_section_generation",
            return_value={"success": True, "word_count": 100},
        ), patch.object(
            tasks_module, "_inline_expand_section",
            return_value={"expanded": True, "before": 100, "after": 600},
        ):
            generate_single_section_for_batch.apply(args=[self.section.id, task.id]).get()

        item = BatchGenerationTaskItem.objects.get(task=task, section=self.section)
        assert item.status == "success"
        assert item.word_count == 600
        assert item.generation_meta["inline_expand"]["after"] == 600

    def test_batch_inline_expand_skipped_when_word_count_ok(self):
        """字数达标 → 内联扩写辅助函数内部跳过，不调 AI 扩写。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.services.section_expand_service import SectionExpandService
        from apps.outline.tasks import generate_single_section_for_batch

        task = self._create_batch_task()

        with patch.object(
            tasks_module, "_execute_single_section_generation",
            return_value={"success": True, "word_count": 800},
        ), patch.object(SectionExpandService, "expand_section") as mock_expand:
            generate_single_section_for_batch.apply(args=[self.section.id, task.id]).get()

        mock_expand.assert_not_called()
        item = BatchGenerationTaskItem.objects.get(task=task, section=self.section)
        assert item.status == "success"
        assert item.word_count == 800

    def test_inline_expand_helper_handles_failure(self):
        """辅助函数：扩写抛异常时返回失败 meta 而非抛出，不阻断批量。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.services.section_expand_service import SectionExpandService

        with patch.object(
            SectionExpandService, "expand_section", side_effect=Exception("boom")
        ):
            meta = tasks_module._inline_expand_section(self.section.id, self.user, 100)

        assert meta == {"expanded": False, "reason": "扩写异常: boom"}

    def test_inline_expand_helper_skips_when_ok(self):
        """辅助函数：字数达标直接返回 None，不调 AI。"""
        from apps.outline import tasks as tasks_module
        from apps.outline.services.section_expand_service import SectionExpandService

        with patch.object(SectionExpandService, "expand_section") as mock_expand:
            meta = tasks_module._inline_expand_section(self.section.id, self.user, 600)

        assert meta is None
        mock_expand.assert_not_called()
