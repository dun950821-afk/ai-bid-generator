# backend/apps/outline/tests/test_consistency_audit.py
"""一致性审计服务测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.projects.models import Project, Lot
from apps.outline.services.consistency_audit_service import ConsistencyAuditService

User = get_user_model()


def _make_outline_with_sections(user):
    """造一个 outline + 1 个一级目录 + 2 个叶子章节。"""
    project = Project.objects.create(name="测试项目", created_by=user)
    lot = Lot.objects.create(project=project, name="测试标段")
    outline = Outline.objects.create(project=project, lot=lot, name="测试大纲", created_by=user)
    top = Section.objects.create(outline=outline, parent=None, title="技术方案", level=1, sort_order=0)
    Section.objects.create(outline=outline, parent=top, title="项目实施方案", level=2, sort_order=0, content="本项目工期60天。")
    Section.objects.create(outline=outline, parent=top, title="售后方案", level=2, sort_order=1, content="质保期1年。")
    return outline, top


class ConsistencyAuditServiceTest(TestCase):
    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_audit_user")

    def test_no_global_facts_runs_clean(self):
        """无全局事实变量时审计正常跑完，不报错。"""
        outline, _ = _make_outline_with_sections(self.user)
        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(status="succeeded", output_json={"conflicts": []})
            result = ConsistencyAuditService().run_audit(outline.id, self.user)
        self.assertEqual(result["total_groups"], 1)
        self.assertEqual(result["total_conflicts"], 0)

    def test_conflict_written_to_section_meta(self):
        """冲突写入 Section.content_generation_meta.consistency_conflicts。"""
        outline, _ = _make_outline_with_sections(self.user)
        leaf = Section.objects.get(outline=outline, title="项目实施方案")
        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(
                status="succeeded",
                output_json={"conflicts": [{
                    "section_id": leaf.section_number,
                    "fact_title": "交货期",
                    "evidence": "工期60天",
                    "reason": "与事实90天矛盾",
                    "severity": "high",
                }]},
            )
            ConsistencyAuditService().run_audit(outline.id, self.user)
        leaf.refresh_from_db()
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["fact_title"], "交货期")
        self.assertFalse(conflicts[0]["resolved"])

    def test_reaudit_clears_old_conflicts(self):
        """重审前清空旧冲突，避免累积。"""
        outline, _ = _make_outline_with_sections(self.user)
        leaf = Section.objects.get(outline=outline, title="项目实施方案")
        meta = leaf.content_generation_meta or {}
        meta["consistency_conflicts"] = [{"fact_title": "旧冲突", "resolved": False}]
        leaf.content_generation_meta = meta
        leaf.save()

        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(status="succeeded", output_json={"conflicts": []})
            ConsistencyAuditService().run_audit(outline.id, self.user)

        leaf.refresh_from_db()
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertEqual(conflicts, [])

    def test_repair_section_overwrites_content(self):
        """单章修复覆盖正文，冲突标记 resolved。"""
        outline, _ = _make_outline_with_sections(self.user)
        leaf = Section.objects.get(outline=outline, title="项目实施方案")
        meta = leaf.content_generation_meta or {}
        meta["consistency_conflicts"] = [{
            "fact_title": "交货期", "evidence": "工期60天",
            "reason": "矛盾", "severity": "high", "resolved": False,
        }]
        leaf.content_generation_meta = meta
        leaf.save()

        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(
                status="succeeded",
                output_json={"content": "修复后工期90天。", "fixed_conflicts": ["交货期"]},
            )
            result = ConsistencyAuditService().repair_section(leaf.id, self.user)

        leaf.refresh_from_db()
        self.assertIn("90天", leaf.content)
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertTrue(conflicts[0]["resolved"])
