# backend/apps/outline/tests/test_mermaid_illustration.py
"""Mermaid 配图服务测试（P3）。"""
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.outline.models import Outline, Section
from apps.outline.services.mermaid_illustration_service import MermaidIllustrationService

User = get_user_model()


def _make_prompt_run(json_data):
    run = MagicMock()
    run.status = "succeeded"
    run.output_json = json_data
    run.error_message = ""
    return run


def _make_image_response(content: bytes = b"\x89PNG\r\n\x1a\nfakepng"):
    resp = MagicMock()
    resp.status_code = 200
    resp.content = content
    resp.headers = {"Content-Type": "image/png"}
    return resp


def _make_failed_response():
    resp = MagicMock()
    resp.status_code = 400
    resp.content = b"bad request"
    resp.headers = {"Content-Type": "text/plain"}
    return resp


class MermaidIllustrationTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot

        self.user, _ = User.objects.get_or_create(username="test_mermaid_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_section(self, mermaid_needed=True, existing_code=""):
        return Section.objects.create(
            outline=self.outline,
            title="3.1 系统架构",
            level=2,
            sort_order=1,
            content="本节描述系统架构。" if not existing_code else f"本节描述系统架构。\n\n```mermaid\n{existing_code}\n```",
            content_word_count=10,
            word_count=10,
            content_plan={"mermaid": {"needed": mermaid_needed, "title": "架构图"}},
            mermaid_code=existing_code,
        )

    @patch("apps.common.services.storage.StorageService.put_object")
    @patch("apps.outline.services.mermaid_illustration_service.requests.get")
    def test_render_success_embed(self, mock_get, mock_put):
        """渲染成功：存 MinIO + 嵌入正文。"""
        section = self._make_section(mermaid_needed=True, existing_code="")
        svc = MermaidIllustrationService()
        mock_get.return_value = _make_image_response()

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({
                "mermaid_code": "flowchart TD\n  A --> B",
                "diagram_type": "flowchart",
            }),
        ):
            result = svc._generate_for_section(section, self.user)

        section.refresh_from_db()
        self.assertTrue(result["success"])
        self.assertEqual(section.mermaid_code, "flowchart TD\n  A --> B")
        self.assertTrue(section.mermaid_object_key.endswith(f"mermaid/{self.outline.id}/{section.id}.png"))
        self.assertIn("```mermaid\nflowchart TD\n  A --> B\n```", section.content)
        mock_put.assert_called_once()

    @patch("apps.common.services.storage.StorageService.put_object")
    @patch("apps.outline.services.mermaid_illustration_service.requests.get")
    def test_render_fail_repair_success(self, mock_get, mock_put):
        """首次渲染失败，修复后渲染成功。"""
        section = self._make_section(mermaid_needed=True, existing_code="")
        svc = MermaidIllustrationService()

        # 第一次 GET 失败，第二次成功
        mock_get.side_effect = [_make_failed_response(), _make_image_response()]

        first_run = _make_prompt_run({"mermaid_code": "flowchart TD\n  A --> B", "diagram_type": "flowchart"})
        repair_run = _make_prompt_run({"mermaid_code": "flowchart TD\n  A --> C", "diagram_type": "flowchart"})

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            side_effect=[first_run, repair_run],
        ):
            result = svc._generate_for_section(section, self.user)

        section.refresh_from_db()
        self.assertTrue(result["success"])
        self.assertEqual(section.mermaid_code, "flowchart TD\n  A --> C")
        self.assertIn("```mermaid\nflowchart TD\n  A --> C\n```", section.content)

    @patch("apps.outline.services.mermaid_illustration_service.requests.get")
    def test_render_fail_twice_no_embed(self, mock_get):
        """2 次都失败：不嵌入正文，但记录 mermaid_code。"""
        section = self._make_section(mermaid_needed=True, existing_code="")
        svc = MermaidIllustrationService()
        mock_get.side_effect = [_make_failed_response(), _make_failed_response()]

        first_run = _make_prompt_run({"mermaid_code": "flowchart TD\n  A --> B", "diagram_type": "flowchart"})
        repair_run = _make_prompt_run({"mermaid_code": "flowchart TD\n  A --> C", "diagram_type": "flowchart"})

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            side_effect=[first_run, repair_run],
        ):
            result = svc._generate_for_section(section, self.user)

        section.refresh_from_db()
        self.assertFalse(result["success"])
        # mermaid_code 记录但 mermaid_object_key 为空
        self.assertTrue(section.mermaid_code)
        self.assertEqual(section.mermaid_object_key, "")
        # 正文未追加 mermaid 代码块
        self.assertNotIn("```mermaid", section.content)

    def test_skip_already_has_mermaid(self):
        """mermaid_code 非空跳过。"""
        Section.objects.create(
            outline=self.outline,
            title="3.1 已有 Mermaid",
            level=2,
            sort_order=1,
            content="正文",
            content_word_count=5,
            word_count=5,
            content_plan={"mermaid": {"needed": True}},
            mermaid_code="flowchart TD\n  A --> B",
        )
        svc = MermaidIllustrationService()
        targets = svc._collect_target_sections(self.outline.id)
        self.assertEqual(len(targets), 0)

    def test_skip_not_needed(self):
        """content_plan.mermaid.needed=false 跳过。"""
        self._make_section(mermaid_needed=False, existing_code="")
        svc = MermaidIllustrationService()
        targets = svc._collect_target_sections(self.outline.id)
        self.assertEqual(len(targets), 0)

    @patch("apps.common.services.storage.StorageService.put_object")
    @patch("apps.outline.services.mermaid_illustration_service.requests.get")
    def test_run_illustration_batch(self, mock_get, mock_put):
        """批量扫描多章节统一生成。"""
        # 2 个需要 mermaid 的章节
        s1 = self._make_section(mermaid_needed=True, existing_code="")
        s2 = Section.objects.create(
            outline=self.outline, title="3.2 部署架构", level=2, sort_order=2,
            content="部署架构正文", content_word_count=5, word_count=5,
            content_plan={"mermaid": {"needed": True}},
        )
        svc = MermaidIllustrationService()
        mock_get.return_value = _make_image_response()

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({"mermaid_code": "flowchart TD\n  A --> B", "diagram_type": "flowchart"}),
        ):
            result = svc.run_illustration(self.outline.id, self.user)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["success"], 2)
        self.assertEqual(result["failed"], 0)
