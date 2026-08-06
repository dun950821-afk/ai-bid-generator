# backend/apps/outline/tests/test_batch_concurrency.py
"""批量生成并发测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.outline.models import Outline, Section, GenerationTask, BatchGenerationTaskItem
from apps.outline.constants import GenerationTaskStatus

User = get_user_model()


class BatchConcurrencyTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_batch_concurrency_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )
        self.sections = []
        for i in range(3):
            self.sections.append(Section.objects.create(
                outline=self.outline, title=f"1.{i+1} 章节", level=1, sort_order=i,
            ))

    def _create_batch_task(self):
        task = GenerationTask.objects.create(
            outline=self.outline, task_type="batch_section_generation",
            status=GenerationTaskStatus.RUNNING, created_by=self.user,
            params={"skip_on_failure": True},
        )
        for i, s in enumerate(self.sections):
            BatchGenerationTaskItem.objects.create(
                task=task, section=s, sort_index=i, status="pending",
            )
        return task

    @patch("apps.outline.tasks.generate_single_section_for_batch")
    @patch("apps.outline.tasks.on_batch_complete")
    def test_group_dispatch_all_pending(self, mock_on_complete, mock_single):
        """batch_section_generation_task 应为每个 pending 章节派发 generate_single_section_for_batch。"""
        from apps.outline.tasks import batch_section_generation_task
        task = self._create_batch_task()

        mock_single.s = MagicMock(return_value="sig")
        mock_on_complete.s = MagicMock(return_value="cb")

        with patch("apps.outline.tasks.chord") as mock_chord:
            batch_section_generation_task.apply(args=[task.id]).get()

        mock_chord.assert_called_once()
        # chord 第一个参数是 group 对象；group 内部任务的签名由 generate_single_section_for_batch.s 生成
        # 由于 chord 被 mock，group 会在 chord 调用时被作为参数传入，此时已消费生成器
        group_arg = mock_chord.call_args[0][0]
        # group 对象的 tasks 属性包含所有签名
        self.assertEqual(len(group_arg.tasks), 3)

    def test_chord_callback_triggers_expand(self):
        """on_batch_complete 在批量完成后触发 expand_sections_task。"""
        from apps.outline.tasks import on_batch_complete
        from apps.outline import tasks as tasks_module
        task = self._create_batch_task()
        BatchGenerationTaskItem.objects.filter(task=task).update(status="success", finished_at=timezone.now())
        task.success_count = 3
        task.save()

        def fake_finalize(t):
            t.status = GenerationTaskStatus.COMPLETED
            t.finished_at = timezone.now()
            t.save(update_fields=["status", "finished_at"])

        with patch.object(tasks_module, "expand_sections_task") as mock_expand, \
             patch.object(tasks_module, "_finalize_batch_task", side_effect=fake_finalize):
            on_batch_complete.apply(args=[[], task.id]).get()

        mock_expand.delay.assert_called_once()
        call_args = mock_expand.delay.call_args
        self.assertEqual(call_args.args[0], self.outline.id)

    def test_chord_callback_triggers_mermaid_and_image(self):
        """on_batch_complete 在批量完成后也触发 mermaid_illustration_task + image_generation_task。"""
        from apps.outline.tasks import on_batch_complete
        from apps.outline import tasks as tasks_module
        task = self._create_batch_task()
        BatchGenerationTaskItem.objects.filter(task=task).update(status="success", finished_at=timezone.now())
        task.success_count = 3
        task.save()

        def fake_finalize(t):
            t.status = GenerationTaskStatus.COMPLETED
            t.finished_at = timezone.now()
            t.save(update_fields=["status", "finished_at"])

        with patch.object(tasks_module, "expand_sections_task"), \
             patch.object(tasks_module, "mermaid_illustration_task") as mock_mermaid, \
             patch.object(tasks_module, "image_generation_task") as mock_image, \
             patch.object(tasks_module, "_finalize_batch_task", side_effect=fake_finalize):
            on_batch_complete.apply(args=[[], task.id]).get()

        mock_mermaid.delay.assert_called_once()
        self.assertEqual(mock_mermaid.delay.call_args.args[0], self.outline.id)
        mock_image.delay.assert_called_once()
        self.assertEqual(mock_image.delay.call_args.args[0], self.outline.id)


    def test_single_section_failure_isolated(self):
        """单章失败不阻断其他，BatchGenerationTaskItem 记 failed。"""
        from apps.outline.tasks import generate_single_section_for_batch
        from apps.outline import tasks as tasks_module
        task = self._create_batch_task()

        call_log = {"n": 0}

        def mock_execute(section_id, record_id, user_id, user_prompt):
            call_log["n"] += 1
            if call_log["n"] == 1:
                raise Exception("模拟失败")
            return {"success": True, "word_count": 100}

        with patch.object(tasks_module, "_execute_single_section_generation", side_effect=mock_execute), \
             patch.object(tasks_module, "_inline_expand_section", return_value=None):
            for sid in [self.sections[0].id, self.sections[1].id, self.sections[2].id]:
                generate_single_section_for_batch.apply(args=[sid, task.id]).get()

        failed_count = BatchGenerationTaskItem.objects.filter(task=task, status="failed").count()
        success_count = BatchGenerationTaskItem.objects.filter(task=task, status="success").count()
        self.assertEqual(failed_count, 1)
        self.assertEqual(success_count, 2)
