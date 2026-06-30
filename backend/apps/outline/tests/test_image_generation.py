# backend/apps/outline/tests/test_image_generation.py
"""AI 生图服务测试（P3）。"""
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.outline.models import Outline, Section
from apps.outline.services.image_generation_service import ImageGenerationService

User = get_user_model()


def _make_prompt_run(json_data):
    run = MagicMock()
    run.status = "succeeded"
    run.output_json = json_data
    run.error_message = ""
    return run


class ImageGenerationTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot

        self.user, _ = User.objects.get_or_create(username="test_image_gen_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_section(self, image_needed=True, existing_key=""):
        return Section.objects.create(
            outline=self.outline,
            title="4.1 系统部署",
            level=2,
            sort_order=1,
            content="本节描述系统部署。",
            content_word_count=5,
            word_count=5,
            content_plan={"image": {"needed": image_needed, "title": "部署图", "style": "flat illustration"}},
            image_object_key=existing_key,
        )

    @override_settings(IMAGE_GEN_MODEL="dall-e-3")
    @patch("apps.common.services.storage.StorageService.put_object")
    @patch("apps.outline.services.image_generation_service.ImageGenerationService._call_image_model")
    def test_image_gen_success_embed(self, mock_call_image, mock_put):
        """配置模型 + 生图成功，存 MinIO + 嵌入正文。"""
        section = self._make_section(image_needed=True, existing_key="")
        svc = ImageGenerationService()
        mock_call_image.return_value = b"\x89PNG\r\n\x1a\nfakepng"

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({
                "image_prompt": "flat illustration of system deployment architecture",
                "style": "flat illustration",
                "negative_prompt": "real people, brand logo",
            }),
        ):
            result = svc._generate_for_section(section, self.user)

        section.refresh_from_db()
        self.assertTrue(result["success"])
        self.assertTrue(section.image_prompt)
        self.assertTrue(section.image_object_key.endswith(f"images/{self.outline.id}/{section.id}.png"))
        self.assertIn(f"![{section.title}]", section.content)
        mock_put.assert_called_once()

    @override_settings(IMAGE_GEN_MODEL="dall-e-3")
    @patch("apps.outline.services.image_generation_service.ImageGenerationService._call_image_model")
    def test_image_gen_fail_keep_prompt(self, mock_call_image):
        """配置模型但生图失败，只存 prompt。"""
        section = self._make_section(image_needed=True, existing_key="")
        svc = ImageGenerationService()
        mock_call_image.return_value = None

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({
                "image_prompt": "system deployment diagram",
                "style": "technical diagram",
                "negative_prompt": "",
            }),
        ):
            result = svc._generate_for_section(section, self.user)

        section.refresh_from_db()
        self.assertFalse(result["success"])
        self.assertTrue(result["prompt_only"])
        self.assertTrue(section.image_prompt)
        self.assertEqual(section.image_object_key, "")
        self.assertNotIn("![", section.content)

    @override_settings(IMAGE_GEN_MODEL="")
    def test_no_model_only_prompt(self):
        """未配置模型，只存 prompt + 提示。"""
        section = self._make_section(image_needed=True, existing_key="")
        svc = ImageGenerationService()

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({
                "image_prompt": "system deployment diagram",
                "style": "technical diagram",
                "negative_prompt": "",
            }),
        ):
            result = svc._generate_for_section(section, self.user)

        section.refresh_from_db()
        self.assertFalse(result["success"])
        self.assertTrue(result["prompt_only"])
        self.assertIn("未配置生图模型", result["reason"])
        self.assertTrue(section.image_prompt)
        self.assertEqual(section.image_object_key, "")

    def test_skip_already_has_image(self):
        """image_object_key 非空跳过。"""
        Section.objects.create(
            outline=self.outline,
            title="4.1 已有图",
            level=2,
            sort_order=1,
            content="正文",
            content_word_count=5,
            word_count=5,
            content_plan={"image": {"needed": True}},
            image_object_key="images/existing.png",
        )
        svc = ImageGenerationService()
        targets = svc._collect_target_sections(self.outline.id)
        self.assertEqual(len(targets), 0)

    def test_skip_not_needed(self):
        """content_plan.image.needed=false 跳过。"""
        self._make_section(image_needed=False, existing_key="")
        svc = ImageGenerationService()
        targets = svc._collect_target_sections(self.outline.id)
        self.assertEqual(len(targets), 0)

    @override_settings(IMAGE_GEN_MODEL="")
    def test_run_generation_batch(self):
        """批量扫描多章节统一处理（未配置模型，仅 prompt）。"""
        s1 = self._make_section(image_needed=True, existing_key="")
        s2 = Section.objects.create(
            outline=self.outline, title="4.2 备份架构", level=2, sort_order=2,
            content="备份架构正文", content_word_count=5, word_count=5,
            content_plan={"image": {"needed": True}},
        )
        svc = ImageGenerationService()

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({
                "image_prompt": "backup architecture diagram",
                "style": "technical",
                "negative_prompt": "",
            }),
        ):
            result = svc.run_generation(self.outline.id, self.user)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["prompt_only"], 2)
        self.assertEqual(result["success"], 0)
