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
    """BUG 2：generate_outline_task 成功后自动触发全局事实提取。"""

    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_outline_trigger_user")

    @patch("apps.outline.services.global_fact_service.GlobalFactService.extract_global_facts")
    @patch("apps.outline.services.matrix_service.MatrixService.start_matrix_generation")
    @patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute")
    @patch("apps.outline.tasks._parse_outline_response")
    @patch("apps.common.services.storage.StorageService.get_object")
    def test_outline_generation_triggers_global_fact_extraction(
        self, mock_get_object, mock_parse, mock_ai_exec, mock_matrix, mock_global_fact,
    ):
        """generate_outline_task 成功后应调 GlobalFactService.extract_global_facts。"""
        from apps.outline.tasks import generate_outline_task
        from apps.tender.models import TenderFile, ParsedDocument

        mock_get_object.return_value = "招标文件正文".encode("utf-8")
        mock_parse.return_value = [{"level": 1, "title": "技术方案"}]
        mock_ai_exec.return_value = MagicMock(
            status="succeeded",
            output_text="# 一、技术方案\n## 1.1 项目实施方案",
            output_json=None,
            error_message="",
            id=9999,
            prompt_template_id=1,
            prompt_version="v1",
            model_config=MagicMock(display_name="mock-model"),
        )

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

        mock_matrix.assert_called_once()
        mock_global_fact.assert_called_once()
        call_kwargs = mock_global_fact.call_args.kwargs
        self.assertIn("outline_id", call_kwargs)
        self.assertEqual(call_kwargs["created_by"], self.user)
