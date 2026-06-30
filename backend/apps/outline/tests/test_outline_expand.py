# backend/apps/outline/tests/test_outline_expand.py
"""字数补目录服务测试（P3）。"""
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.outline.models import Outline, Section
from apps.outline.services.outline_expand_service import OutlineExpandService

User = get_user_model()


def _make_prompt_run(json_data):
    run = MagicMock()
    run.status = "succeeded"
    run.output_json = json_data
    run.error_message = ""
    return run


class OutlineExpandTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot

        self.user, _ = User.objects.get_or_create(username="test_outline_expand_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )
        # 一级目录
        self.root = Section.objects.create(
            outline=self.outline, title="一、技术方案", level=1, sort_order=0,
        )
        # 二级叶子
        self.leaf = Section.objects.create(
            outline=self.outline, parent=self.root, title="1.1 系统架构", level=2, sort_order=0,
        )

    def test_add_sections_under_leaf(self):
        """AI 返回 added_sections，挂到 parent 下，level=parent.level+1。"""
        svc = OutlineExpandService()
        added_json = {
            "added_sections": [
                {
                    "parent_section_id": self.leaf.id,
                    "title": "1.1.1 总体架构",
                    "level": 3,
                    "write_scope": "总体架构设计",
                },
                {
                    "parent_section_id": self.leaf.id,
                    "title": "1.1.2 部署架构",
                    "level": 3,
                    "write_scope": "部署架构设计",
                },
            ]
        }

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run(added_json),
        ):
            result = svc.expand_outline(self.outline.id, target_total_words=10000, user=self.user)

        self.assertEqual(result["created_count"], 2)
        self.assertEqual(result["skipped_count"], 0)
        new_sections = Section.objects.filter(parent=self.leaf).order_by("sort_order")
        self.assertEqual(new_sections.count(), 2)
        for s in new_sections:
            self.assertEqual(s.level, 3)
            self.assertTrue(s.title.startswith("1.1."))
        # sort_order 排在末尾
        self.assertEqual(new_sections[0].sort_order, 0)
        self.assertEqual(new_sections[1].sort_order, 1)
        # write_scope 写入 content_matrix
        self.assertEqual(new_sections[0].content_matrix["write_scope"], "总体架构设计")

    def test_empty_added_returns(self):
        """AI 返回空 added_sections，提示无需补充。"""
        svc = OutlineExpandService()

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({"added_sections": []}),
        ):
            result = svc.expand_outline(self.outline.id, target_total_words=10000, user=self.user)

        self.assertTrue(result["skipped"])
        self.assertEqual(result["added"], [])
        self.assertEqual(result["reason"], "AI 返回空，无需补充")
        # 没有新增章节
        self.assertEqual(Section.objects.filter(outline=self.outline).count(), 2)

    def test_level_not_exceed_5(self):
        """level 超过 5 时跳过。"""
        # 构造 5 级深度的章节
        s1 = self.root            # level 1
        s2 = self.leaf            # level 2
        s3 = Section.objects.create(outline=self.outline, parent=s2, title="1.1.1 x", level=3, sort_order=0)
        s4 = Section.objects.create(outline=self.outline, parent=s3, title="1.1.1.1 x", level=4, sort_order=0)
        s5 = Section.objects.create(outline=self.outline, parent=s4, title="1.1.1.1.1 x", level=5, sort_order=0)

        svc = OutlineExpandService()
        # parent 是 level 5，new_level = 6 应跳过
        added_json = {
            "added_sections": [
                {
                    "parent_section_id": s5.id,
                    "title": "超 5 级",
                    "level": 6,
                    "write_scope": "应跳过",
                },
            ]
        }

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run(added_json),
        ):
            result = svc.expand_outline(self.outline.id, target_total_words=10000, user=self.user)

        self.assertEqual(result["created_count"], 0)
        self.assertEqual(result["skipped_count"], 1)

    def test_ai_failure_returns_skipped(self):
        """AI 调用失败时返回 skipped。"""
        svc = OutlineExpandService()

        failed_run = MagicMock()
        failed_run.status = "failed"
        failed_run.output_json = None
        failed_run.error_message = "AI 异常"

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=failed_run,
        ):
            result = svc.expand_outline(self.outline.id, target_total_words=10000, user=self.user)

        self.assertTrue(result["skipped"])
        self.assertEqual(result["reason"], "AI 失败")
        self.assertEqual(result["added"], [])
