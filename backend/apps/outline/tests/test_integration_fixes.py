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
