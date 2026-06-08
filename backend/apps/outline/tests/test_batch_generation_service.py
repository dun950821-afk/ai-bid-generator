# backend/apps/outline/tests/test_batch_generation_service.py
"""批量正文生成服务测试。"""

import pytest
from django.contrib.auth import get_user_model

from apps.outline.constants import (
    ContentGenerationStatus,
    ContentMatrixStatus,
    GenerationTaskStatus,
    GenerationTaskType,
    SectionGenerationStatus,
)
from apps.outline.models import BatchGenerationTaskItem, GenerationTask, Outline, Section
from apps.outline.services.batch_generation_service import BatchGenerationService
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestBatchGenerationService:
    """BatchGenerationService 测试。"""

    def setup_method(self):
        self.service = BatchGenerationService()
        self.user = User.objects.create_user(username="test", password="test")

    def _create_outline_with_sections(self):
        """创建测试大纲和章节。"""
        project = Project.objects.create(name="Test Project", created_by=self.user)
        lot = Lot.objects.create(name="Test Lot", project=project)

        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name="Test Outline",
            source="preset",
            created_by=self.user,
        )

        # 创建章节树
        section1 = Section.objects.create(
            outline=outline,
            title="第一章",
            level=1,
            sort_order=0,
            content_matrix_status=ContentMatrixStatus.GENERATED,
        )
        section1_1 = Section.objects.create(
            outline=outline,
            parent=section1,
            title="1.1 节",
            level=2,
            sort_order=0,
            content_matrix_status=ContentMatrixStatus.GENERATED,
        )
        section1_2 = Section.objects.create(
            outline=outline,
            parent=section1,
            title="1.2 节",
            level=2,
            sort_order=1,
            content_matrix_status=ContentMatrixStatus.GENERATED,
        )
        section2 = Section.objects.create(
            outline=outline,
            title="第二章",
            level=1,
            sort_order=1,
            content_matrix_status=ContentMatrixStatus.EDITED,
        )

        return outline, [section1, section1_1, section1_2, section2]

    def test_precheck_no_sections(self):
        """大纲无章节时预检查返回错误。"""
        project = Project.objects.create(name="Test Project", created_by=self.user)
        lot = Lot.objects.create(name="Test Lot", project=project)

        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name="Empty Outline",
            source="preset",
            created_by=self.user,
        )

        result = self.service.precheck(outline.id)

        assert result["can_generate"] is False
        assert result["total_sections"] == 0
        assert any(e["type"] == "no_sections" for e in result["errors"])

    def test_precheck_no_matrix(self):
        """章节无矩阵时预检查返回错误。"""
        project = Project.objects.create(name="Test Project", created_by=self.user)
        lot = Lot.objects.create(name="Test Lot", project=project)

        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name="No Matrix Outline",
            source="preset",
            created_by=self.user,
        )

        Section.objects.create(
            outline=outline,
            title="第一章",
            level=1,
            sort_order=0,
            content_matrix_status=ContentMatrixStatus.PENDING,
        )

        result = self.service.precheck(outline.id)

        assert result["can_generate"] is False
        assert result["matrix_ready_sections"] == 0
        assert any(e["type"] == "no_matrix_ready" for e in result["errors"])

    def test_precheck_success(self):
        """正常情况预检查通过。"""
        outline, sections = self._create_outline_with_sections()

        result = self.service.precheck(outline.id)

        assert result["can_generate"] is True
        assert result["total_sections"] == 4
        assert result["matrix_ready_sections"] == 4
        assert result["eligible_sections"] == 4
        assert len(result["eligible_section_ids"]) == 4

    def test_precheck_already_generated(self):
        """已生成章节会被检测。"""
        outline, sections = self._create_outline_with_sections()

        # 标记一个章节为已生成
        sections[1].content_generation_status = ContentGenerationStatus.SUCCESS
        sections[1].save()

        result = self.service.precheck(outline.id)

        assert result["already_generated"] == 1
        assert result["eligible_sections"] == 3
        assert any(w["type"] == "already_generated" for w in result["warnings"])

    def test_calculate_generation_order_leaf_first(self):
        """叶子章节优先排序。"""
        outline, sections = self._create_outline_with_sections()

        order = self.service.calculate_generation_order(outline.id)

        # 叶子章节应该排在前面
        section_ids = [item["section_id"] for item in order]

        # section1_1 和 section1_2 是叶子（leaf_depth=0）
        # section1 有子章节（leaf_depth=1）
        # section2 是叶子（leaf_depth=0）

        # 找出 section1 的位置（应该靠后）
        section1_order = next(item for item in order if item["section_id"] == sections[0].id)

        # section1 有子章节，leaf_depth 应该 > 0
        assert section1_order["leaf_depth"] > 0

        # 叶子章节的 leaf_depth == 0
        leaf_sections = [item for item in order if item["leaf_depth"] == 0]
        assert len(leaf_sections) >= 2

    def test_create_batch_task_success(self):
        """创建批量生成任务成功。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        assert task.task_type == GenerationTaskType.SECTION_BATCH_GENERATION
        assert task.status == GenerationTaskStatus.PENDING
        assert task.total_count == 4
        assert len(task.params["section_ids"]) == 4
        assert "generation_order" in task.params

        # 验证 BatchGenerationTaskItem 创建
        items = BatchGenerationTaskItem.objects.filter(task=task)
        assert items.count() == 4
        assert all(item.status == "pending" for item in items)

    def test_create_batch_task_with_specific_sections(self):
        """指定章节创建任务。"""
        outline, sections = self._create_outline_with_sections()

        target_ids = [sections[1].id, sections[2].id]

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
            section_ids=target_ids,
        )

        assert task.total_count == 2
        assert set(task.params["section_ids"]) == set(target_ids)

    def test_create_batch_task_no_eligible_sections(self):
        """无可用章节时创建任务失败。"""
        project = Project.objects.create(name="Test Project", created_by=self.user)
        lot = Lot.objects.create(name="Test Lot", project=project)

        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name="No Matrix Outline",
            source="preset",
            created_by=self.user,
        )

        Section.objects.create(
            outline=outline,
            title="第一章",
            level=1,
            sort_order=0,
            content_matrix_status=ContentMatrixStatus.PENDING,
        )

        with pytest.raises(ValueError, match="没有需要生成的章节"):
            self.service.create_batch_task(
                outline_id=outline.id,
                created_by=self.user,
            )

    def test_create_batch_task_prevent_duplicate(self):
        """已有运行中任务时阻止创建新任务。"""
        outline, sections = self._create_outline_with_sections()

        # 创建第一个任务
        task1 = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        # 尝试创建第二个任务
        with pytest.raises(ValueError, match="已有正在执行的批量生成任务"):
            self.service.create_batch_task(
                outline_id=outline.id,
                created_by=self.user,
            )

    def test_create_batch_task_prevent_duplicate_when_paused(self):
        """已暂停任务时阻止创建新任务。"""
        outline, sections = self._create_outline_with_sections()

        # 创建任务并设置为暂停
        task1 = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )
        task1.status = GenerationTaskStatus.PAUSED
        task1.save()

        # 尝试创建第二个任务
        with pytest.raises(ValueError, match="已有正在执行的批量生成任务"):
            self.service.create_batch_task(
                outline_id=outline.id,
                created_by=self.user,
            )

    def test_get_batch_progress(self):
        """获取批量生成进度。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        progress = self.service.get_batch_progress(task.id)

        assert progress["task_id"] == task.id
        assert progress["status"] == GenerationTaskStatus.PENDING
        assert progress["total"] == 4
        assert progress["pending"] == 4
        assert progress["success"] == 0
        assert "paused_at_index" in progress

    def test_pause_task_running(self):
        """暂停运行中的任务。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        result = self.service.pause_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.PAUSE_REQUESTED

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.PAUSE_REQUESTED

    def test_pause_task_not_running(self):
        """只能暂停运行中的任务。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        result = self.service.pause_task(task.id)

        assert result["success"] is False
        assert "只有运行中的任务才能暂停" in result["message"]

    def test_resume_task_paused(self):
        """恢复暂停的任务。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )
        task.status = GenerationTaskStatus.PAUSED
        task.save()

        # 标记部分子项为已完成
        items = BatchGenerationTaskItem.objects.filter(task=task)
        items.filter(sort_index=0).update(status="success")

        result = self.service.resume_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.RUNNING

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.RUNNING
        assert task.celery_task_id != ""  # 应该有新的 Celery 任务 ID

    def test_resume_task_not_paused(self):
        """只能恢复暂停的任务。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        result = self.service.resume_task(task.id)

        assert result["success"] is False
        assert "只有已暂停的任务才能恢复" in result["message"]

    def test_cancel_task_running(self):
        """取消运行中的任务（软取消）。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        result = self.service.cancel_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.CANCEL_REQUESTED

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.CANCEL_REQUESTED

    def test_cancel_task_paused(self):
        """取消暂停的任务（直接取消）。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )
        task.status = GenerationTaskStatus.PAUSED
        task.save()

        result = self.service.cancel_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.CANCELLED

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.CANCELLED
        assert task.finished_at is not None

        # 待执行的子项应该被标记为 cancelled
        items = BatchGenerationTaskItem.objects.filter(task=task, status="cancelled")
        assert items.count() > 0

    def test_cancel_completed_task_fails(self):
        """已完成任务无法取消。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        # 模拟任务完成
        task.status = GenerationTaskStatus.COMPLETED
        task.save()

        result = self.service.cancel_task(task.id)

        assert result["success"] is False
        assert "已完成" in result["message"]

    def test_retry_failed_sections(self):
        """重试失败的章节。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )
        task.status = GenerationTaskStatus.PARTIAL_SUCCESS
        task.save()

        # 标记部分子项为失败
        items = BatchGenerationTaskItem.objects.filter(task=task)
        items.filter(sort_index__in=[0, 1]).update(status="success")
        items.filter(sort_index=2).update(status="failed", error_message="Test error")

        result = self.service.retry_failed(task.id)

        assert result["success"] is True
        assert result["retried_count"] == 1

        # 失败的子项应该被重置为 pending
        failed_item = BatchGenerationTaskItem.objects.get(task=task, sort_index=2)
        assert failed_item.status == "pending"
        assert failed_item.error_message == ""

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.RUNNING

    def test_retry_no_failed_sections(self):
        """没有失败章节时重试返回错误。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )
        task.status = GenerationTaskStatus.COMPLETED
        task.save()

        # 所有子项都是成功
        items = BatchGenerationTaskItem.objects.filter(task=task)
        items.update(status="success")

        result = self.service.retry_failed(task.id)

        assert result["success"] is False
        assert result["retried_count"] == 0
