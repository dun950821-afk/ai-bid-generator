# backend/apps/outline/tests/test_integration_fixes.py
"""接入 BUG 修复测试。

覆盖：
- BUG 1：plan_section_content 的 mermaid/image 开关随 settings 动态化
- BUG 2：generate_outline_task 成功后自动触发全局事实提取
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model

from apps.common.models import AsyncTask
from apps.outline.models import Outline, Section
from apps.outline.services.section_generation_service import SectionGenerationService
from apps.projects.models import Project, Lot

User = get_user_model()


def _make_outline_with_section(user):
    project = Project.objects.create(name="测试项目", created_by=user)
    lot = Lot.objects.create(project=project, name="测试标段")
    outline = Outline.objects.create(project=project, lot=lot, name="测试大纲", created_by=user)
    top = Section.objects.create(outline=outline, parent=None, title="技术方案", level=1, sort_order=0)
    leaf = Section.objects.create(
        outline=outline, parent=top, title="项目实施方案", level=2, sort_order=0,
        content="本项目工期60天。",
    )
    return outline, leaf


class PlanSectionContentDynamicFlagsTest(TestCase):
    """BUG 1：编排开关随 settings 动态化。"""

    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_plan_flags_user")
        self.outline, self.section = _make_outline_with_section(self.user)

    @override_settings(MERMAID_RENDER_URL="https://mermaid.ink", IMAGE_GEN_MODEL="dall-e-3")
    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    def test_flags_true_when_both_configured(self, mock_exec):
        mock_exec.return_value = MagicMock(
            status="succeeded",
            output_json={"writing_focus": "测试", "table": {"needed": False}},
        )
        SectionGenerationService().plan_section_content(self.section.id, self.user)

        variables = mock_exec.call_args.kwargs["variables"]
        self.assertTrue(variables["mermaid_generation_available"])
        self.assertTrue(variables["image_generation_available"])
        self.assertIn("候选池", variables["image_limit_instruction"])

    @override_settings(MERMAID_RENDER_URL="", IMAGE_GEN_MODEL="")
    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    def test_flags_false_when_neither_configured(self, mock_exec):
        mock_exec.return_value = MagicMock(
            status="succeeded",
            output_json={"writing_focus": "测试", "table": {"needed": False}},
        )
        SectionGenerationService().plan_section_content(self.section.id, self.user)

        variables = mock_exec.call_args.kwargs["variables"]
        self.assertFalse(variables["mermaid_generation_available"])
        self.assertFalse(variables["image_generation_available"])
        self.assertIn("不可用", variables["image_limit_instruction"])

    @override_settings(MERMAID_RENDER_URL="https://mermaid.ink", IMAGE_GEN_MODEL="")
    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    def test_mermaid_true_image_false_partial_config(self, mock_exec):
        mock_exec.return_value = MagicMock(
            status="succeeded",
            output_json={"writing_focus": "测试", "table": {"needed": False}},
        )
        SectionGenerationService().plan_section_content(self.section.id, self.user)

        variables = mock_exec.call_args.kwargs["variables"]
        self.assertTrue(variables["mermaid_generation_available"])
        self.assertFalse(variables["image_generation_available"])


class GenerateOutlineTriggersGlobalFactTest(TestCase):
    """BUG 2 + BUG 4：三步流程生成大纲后自动触发全局事实提取。"""

    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_outline_trigger_user")

    @patch("apps.outline.services.outline_review_service.OutlineReviewService.generate_with_review")
    @patch("apps.outline.services.global_fact_service.GlobalFactService.extract_global_facts")
    @patch("apps.outline.services.matrix_service.MatrixService.start_matrix_generation")
    @patch("apps.common.services.storage.StorageService.get_object")
    def test_outline_generation_uses_three_step_flow_and_triggers_global_fact(
        self, mock_get_object, mock_matrix, mock_global_fact, mock_generate_with_review,
    ):
        """generate_outline_task 应调三步流程（generate_with_review）并将返回树写入 Section，
        成功后自动触发矩阵生成 + 全局事实提取。"""
        from apps.outline.tasks import generate_outline_task
        from apps.tender.models import TenderFile, ParsedDocument

        mock_get_object.return_value = "招标文件正文".encode("utf-8")
        mock_generate_with_review.return_value = [
            {
                "id": "1",
                "title": "技术方案",
                "description": "技术评分大类1",
                "children": [
                    {
                        "id": "1.1",
                        "title": "项目实施方案",
                        "description": "实施方案",
                        "children": [
                            {"id": "1.1.1", "title": "实施要点", "description": ""},
                        ],
                    },
                ],
            },
        ]

        project = Project.objects.create(name="测试项目", created_by=self.user)
        lot = Lot.objects.create(project=project, name="测试标段")
        tender_file = TenderFile.objects.create(
            project=project, lot=lot, original_name="test.docx",
            object_key="tender/test.docx", file_size=1024,
            status=TenderFile.STATUS_PARSED, created_by=self.user,
        )
        ParsedDocument.objects.create(
            tender_file=tender_file, is_active=True, markdown_uri="tender/test.md",
        )

        async_task = AsyncTask.objects.create(
            task_type="generate_outline", status=AsyncTask.STATUS_PENDING,
            created_by=self.user,
        )

        generate_outline_task.apply(
            args=[tender_file.id, async_task.id, self.user.id]
        ).get()

        # 三步流程被调用
        mock_generate_with_review.assert_called_once()
        gw_kwargs = mock_generate_with_review.call_args.kwargs
        self.assertEqual(gw_kwargs["tender_file"].id, tender_file.id)
        self.assertEqual(gw_kwargs["user"], self.user)

        # 树被写入 Section（3 个节点：1 一级 + 1 二级 + 1 三级）
        outline = Outline.objects.get(lot=lot, is_current=True)
        self.assertEqual(Section.objects.filter(outline=outline).count(), 3)
        top = Section.objects.get(outline=outline, parent=None)
        self.assertEqual(top.title, "技术方案")
        self.assertEqual(top.level, 1)
        leaf = Section.objects.get(outline=outline, title="实施要点")
        self.assertEqual(leaf.level, 3)

        # 矩阵 + 全局事实自动触发
        mock_matrix.assert_called_once()
        mock_global_fact.assert_called_once()
        gf_kwargs = mock_global_fact.call_args.kwargs
        self.assertEqual(gf_kwargs["outline_id"], outline.id)
        self.assertEqual(gf_kwargs["created_by"], self.user)

        # 任务成功完成
        async_task.refresh_from_db()
        self.assertEqual(async_task.status, AsyncTask.STATUS_SUCCESS)

    @patch("apps.outline.services.outline_review_service.OutlineReviewService.generate_with_review")
    @patch("apps.outline.services.global_fact_service.GlobalFactService.extract_global_facts")
    @patch("apps.outline.services.matrix_service.MatrixService.start_matrix_generation")
    @patch("apps.common.services.storage.StorageService.get_object")
    def test_three_step_flow_review_failure_does_not_block_outline(
        self, mock_get_object, mock_matrix, mock_global_fact, mock_generate_with_review,
    ):
        """三步流程内部审核不通过（generate_with_review 仍返回树但 outline.review_status=failed）
        不应阻断大纲生成，仍应写入章节并触发后续 task。"""
        from apps.outline.tasks import generate_outline_task
        from apps.tender.models import TenderFile, ParsedDocument

        mock_get_object.return_value = "招标文件正文".encode("utf-8")
        mock_generate_with_review.return_value = [
            {"id": "1", "title": "技术方案", "description": "", "children": [
                {"id": "1.1", "title": "实施方案", "description": "", "children": [
                    {"id": "1.1.1", "title": "要点", "description": ""},
                ]},
            ]},
        ]

        project = Project.objects.create(name="测试项目2", created_by=self.user)
        lot = Lot.objects.create(project=project, name="测试标段2")
        tender_file = TenderFile.objects.create(
            project=project, lot=lot, original_name="test2.docx",
            object_key="tender/test2.docx", file_size=1024,
            status=TenderFile.STATUS_PARSED, created_by=self.user,
        )
        ParsedDocument.objects.create(
            tender_file=tender_file, is_active=True, markdown_uri="tender/test2.md",
        )

        async_task = AsyncTask.objects.create(
            task_type="generate_outline", status=AsyncTask.STATUS_PENDING,
            created_by=self.user,
        )

        # 让 generate_with_review 内部把 review_status 置 failed（模拟审核不通过但回退首次结果）
        def _side_effect(*args, **kwargs):
            outline = kwargs["outline"]
            outline.review_status = "failed"
            outline.review_suggestions = ["模拟审核不通过"]
            outline.save(update_fields=["review_status", "review_suggestions", "updated_at"])
            return mock_generate_with_review.return_value

        mock_generate_with_review.side_effect = _side_effect

        generate_outline_task.apply(
            args=[tender_file.id, async_task.id, self.user.id]
        ).get()

        outline = Outline.objects.get(lot=lot, is_current=True)
        self.assertEqual(outline.review_status, "failed")
        # 章节仍写入
        self.assertEqual(Section.objects.filter(outline=outline).count(), 3)
        # 后续 task 仍触发
        mock_matrix.assert_called_once()
        mock_global_fact.assert_called_once()
        async_task.refresh_from_db()
        self.assertEqual(async_task.status, AsyncTask.STATUS_SUCCESS)


class TableCleanupBatchChainTest(TestCase):
    """BUG 3：on_batch_complete 触发 outline 级表格清理批量任务。"""

    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_table_batch_user")

    @patch("apps.outline.tasks.table_cleanup_outline_task.delay")
    @patch("apps.outline.tasks.mermaid_illustration_task.delay")
    @patch("apps.outline.tasks.image_generation_task.delay")
    @patch("apps.outline.tasks.expand_sections_task.delay")
    @patch("apps.outline.tasks.consistency_audit_task.delay")
    @patch("apps.outline.tasks._finalize_batch_task")
    def test_on_batch_complete_triggers_table_cleanup_before_mermaid(
        self, mock_finalize, mock_audit, mock_expand, mock_image, mock_mermaid, mock_table_cleanup,
    ):
        """on_batch_complete 在 mermaid/image 之前触发 table_cleanup_outline_task。"""
        from apps.outline.tasks import on_batch_complete
        from apps.outline.constants import GenerationTaskStatus
        from apps.outline.models import GenerationTask

        project = Project.objects.create(name="测试项目", created_by=self.user)
        lot = Lot.objects.create(project=project, name="测试标段")
        outline = Outline.objects.create(
            project=project, lot=lot, name="测试大纲", created_by=self.user,
        )
        task = GenerationTask.objects.create(
            outline=outline, created_by=self.user,
            status=GenerationTaskStatus.COMPLETED,
        )

        # finalize 会读 task 状态并触发 consistency_audit；mock 后需手动设 status
        def _finalize_side_effect(t):
            t.status = GenerationTaskStatus.COMPLETED
            t.save()
        mock_finalize.side_effect = _finalize_side_effect

        on_batch_complete([], task.id)

        mock_finalize.assert_called_once()
        mock_table_cleanup.assert_called_once()
        mock_mermaid.assert_called_once()
        mock_image.assert_called_once()
        # 顺序断言：on_batch_complete 内部 try 块顺序创建 AsyncTask，table_async.id < mermaid_async.id
        table_async = AsyncTask.objects.filter(task_type="table_cleanup_outline").first()
        mermaid_async = AsyncTask.objects.filter(task_type="mermaid_illustration").first()
        self.assertIsNotNone(table_async)
        self.assertIsNotNone(mermaid_async)
        self.assertLess(table_async.id, mermaid_async.id)


class ConsistencyRepairPatchModeTest(TestCase):
    """BUG 5：一致性修复改 patch 模式（old_text 唯一匹配 / 行号定位）。"""

    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_repair_patch_user")

    def _make_section_with_conflict(self, content, fact_title="交货期", evidence="工期60天"):
        project = Project.objects.create(name="测试项目", created_by=self.user)
        lot = Lot.objects.create(project=project, name="测试标段")
        outline = Outline.objects.create(
            project=project, lot=lot, name="测试大纲", created_by=self.user,
        )
        top = Section.objects.create(
            outline=outline, parent=None, title="技术方案", level=1, sort_order=0,
        )
        leaf = Section.objects.create(
            outline=outline, parent=top, title="项目实施方案",
            level=2, sort_order=0, content=content,
        )
        meta = leaf.content_generation_meta or {}
        meta["consistency_conflicts"] = [{
            "fact_title": fact_title, "evidence": evidence,
            "reason": "矛盾", "severity": "high", "resolved": False,
        }]
        leaf.content_generation_meta = meta
        leaf.save()
        return leaf

    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    def test_patch_mode_replaces_old_text_uniquely(self, mock_exec):
        """patch 模式：old_text 唯一匹配时精确替换，不动其他正文。"""
        leaf = self._make_section_with_conflict(
            "本项目工期60天，含安装调试。\n售后质保1年。",
        )
        mock_exec.return_value = MagicMock(
            status="succeeded",
            output_json={
                "patches": [{
                    "section_id": "1.1",
                    "start_line": 1, "end_line": 1,
                    "old_text": "工期60天",
                    "new_text": "工期90天",
                    "reason": "修复交货期冲突",
                }],
            },
        )

        from apps.outline.services.consistency_audit_service import ConsistencyAuditService
        result = ConsistencyAuditService().repair_section(leaf.id, self.user)

        leaf.refresh_from_db()
        self.assertIn("工期90天", leaf.content)
        self.assertNotIn("工期60天", leaf.content)
        # 其他正文未动
        self.assertIn("售后质保1年", leaf.content)
        self.assertEqual(result["applied_patches"], 1)
        self.assertEqual(result["failed_patches"], 0)
        # conflict 标记已修复，repaired_diff 来自 patch 的 old_text/new_text
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertTrue(conflicts[0]["resolved"])
        diff = conflicts[0]["repaired_diff"]
        self.assertEqual(diff["before"], "工期60天")
        self.assertEqual(diff["after"], "工期90天")

    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    def test_patch_mode_rejects_non_unique_old_text(self, mock_exec):
        """old_text 在正文中出现多次时，该 patch 失败；全部失败则 repair 抛错。"""
        leaf = self._make_section_with_conflict(
            "工期60天，质保期60天。",
        )
        mock_exec.return_value = MagicMock(
            status="succeeded",
            output_json={
                "patches": [{
                    "section_id": "1.1",
                    "old_text": "60天",
                    "new_text": "90天",
                    "reason": "修复交货期",
                }],
            },
        )

        from apps.outline.services.consistency_audit_service import ConsistencyAuditService
        with self.assertRaises(Exception) as ctx:
            ConsistencyAuditService().repair_section(leaf.id, self.user)
        self.assertIn("应用失败", str(ctx.exception))

    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    def test_patch_mode_uses_line_range_when_old_text_matches(self, mock_exec):
        """start_line/end_line 定位：行号区间文本与 old_text 一致时按行替换。"""
        content = "第一行工期60天。\n第二行质保1年。\n第三行售后。"
        leaf = self._make_section_with_conflict(content)
        mock_exec.return_value = MagicMock(
            status="succeeded",
            output_json={
                "patches": [{
                    "section_id": "1.1",
                    "start_line": 1, "end_line": 1,
                    "old_text": "第一行工期60天。",
                    "new_text": "第一行工期90天。",
                    "reason": "修复交货期",
                }],
            },
        )

        from apps.outline.services.consistency_audit_service import ConsistencyAuditService
        ConsistencyAuditService().repair_section(leaf.id, self.user)

        leaf.refresh_from_db()
        self.assertIn("工期90天", leaf.content)
        self.assertIn("第二行质保1年。", leaf.content)

    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    def test_patch_mode_falls_back_to_whole_chapter_when_no_patches(self, mock_exec):
        """线上 prompt 未升级（返回 {content, fixed_conflicts}）时走降级整体替换。"""
        leaf = self._make_section_with_conflict("本项目工期60天。")
        mock_exec.return_value = MagicMock(
            status="succeeded",
            output_json={"content": "修复后工期90天。", "fixed_conflicts": ["交货期"]},
        )

        from apps.outline.services.consistency_audit_service import ConsistencyAuditService
        result = ConsistencyAuditService().repair_section(leaf.id, self.user)

        leaf.refresh_from_db()
        self.assertIn("90天", leaf.content)
        self.assertTrue(result.get("degraded"))
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertTrue(conflicts[0]["resolved"])
