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
from apps.outline.models import GenerationTask, Outline, Section
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

    def test_cancel_task(self):
        """取消任务。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        result = self.service.cancel_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.CANCEL_REQUESTED

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.CANCEL_REQUESTED

    def test_cancel_completed_task_fails(self):
        """已完成任务无法取消。"""
        outline, sections = self._create_outline_with_sections()

        task = self.service.create_batch_task(
            outline_id=outline.id,
            created_by=self.user,
        )

        # 模拟任务完成
        task.status = GenerationTaskStatus.SUCCESS
        task.save()

        result = self.service.cancel_task(task.id)

        assert result["success"] is False
        assert "已完成" in result["message"]
