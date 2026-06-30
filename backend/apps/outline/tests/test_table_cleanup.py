# backend/apps/outline/tests/test_table_cleanup.py
"""表格清理服务测试（P3）。"""
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.outline.models import Outline, Section, SectionVersion
from apps.outline.services.table_cleanup_service import TableCleanupService, TABLE_PATTERN

User = get_user_model()


def _make_prompt_run(json_data):
    """构造一个 status=succeeded 的 PromptRun mock。"""
    run = MagicMock()
    run.status = "succeeded"
    run.output_json = json_data
    run.error_message = ""
    return run


class TableCleanupTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot

        self.user, _ = User.objects.get_or_create(username="test_table_cleanup_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_section(self, content, word_count=0):
        return Section.objects.create(
            outline=self.outline,
            title="2.1 测试章节",
            level=2,
            sort_order=1,
            content=content,
            content_word_count=word_count,
            word_count=word_count,
        )

    def test_table_keep(self):
        """keep=true 时保留原表格，不改 content。"""
        table_md = """| 参数 | 值 |
| --- | --- |
| CPU | 8 核 |
| 内存 | 16GB |"""
        section = self._make_section(content=f"前置文字。\n\n{table_md}\n\n后置文字。", word_count=10)
        svc = TableCleanupService()

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({"keep": True, "reason": "参数表保留", "text_alternative": ""}),
        ):
            result = svc.cleanup_section(section.id, self.user)

        section.refresh_from_db()
        self.assertEqual(result["total_tables"], 1)
        self.assertEqual(result["kept"], 1)
        self.assertEqual(result["converted"], 0)
        self.assertIn("| CPU | 8 核 |", section.content)

    def test_table_convert_to_text(self):
        """keep=false 时用 text_alternative 替换表格。"""
        table_md = """| 项目 | 1 |
| --- | --- |
| 描述这是一段长句子的内容 | 2 |"""
        section = self._make_section(content=f"前文。\n\n{table_md}\n\n后文。", word_count=5)
        svc = TableCleanupService()
        text_alt = "本节描述了项目相关内容，包括 1 项内容。"

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            return_value=_make_prompt_run({"keep": False, "reason": "单列长句", "text_alternative": text_alt}),
        ):
            result = svc.cleanup_section(section.id, self.user)

        section.refresh_from_db()
        self.assertEqual(result["converted"], 1)
        self.assertNotIn("| --- |", section.content)
        self.assertIn(text_alt, section.content)
        # 创建 SectionVersion
        self.assertTrue(SectionVersion.objects.filter(section=section).exists())

    def test_single_table_failure_isolated(self):
        """单表失败跳过，其他表仍可处理。"""
        table1 = """| 参数 | 值 |\n| --- | --- |\n| CPU | 8 核 |"""
        table2 = """| 备注 |\n| --- |\n| 这是一段长句子描述 |"""
        content = f"前文。\n\n{table1}\n\n中间。\n\n{table2}\n\n后文。"
        section = self._make_section(content=content, word_count=10)
        svc = TableCleanupService()

        call_count = {"n": 0}

        def fake_execute(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                run = MagicMock()
                run.status = "failed"
                run.output_json = None
                run.error_message = "AI 异常"
                return run
            return _make_prompt_run({"keep": False, "reason": "单列", "text_alternative": "本节备注说明。"})

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
            side_effect=fake_execute,
        ):
            result = svc.cleanup_section(section.id, self.user)

        self.assertEqual(result["total_tables"], 2)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["converted"], 1)
        # 第一个表格保留（失败跳过），第二个被替换
        section.refresh_from_db()
        self.assertIn("| CPU | 8 核 |", section.content)
        self.assertIn("本节备注说明。", section.content)

    def test_no_tables_skip(self):
        """无表格时直接返回 0。"""
        section = self._make_section(content="纯文字正文，无表格。", word_count=5)
        svc = TableCleanupService()

        with patch(
            "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute"
        ) as mock_execute:
            result = svc.cleanup_section(section.id, self.user)

        self.assertEqual(result["total_tables"], 0)
        self.assertEqual(result["kept"], 0)
        self.assertEqual(result["converted"], 0)
        mock_execute.assert_not_called()

    def test_extract_tables_finds_markdown_tables(self):
        """TABLE_PATTERN 能正确识别 Markdown 表格。"""
        content = "前文。\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后文。"
        svc = TableCleanupService()
        tables = list(svc._extract_tables(content))
        self.assertEqual(len(tables), 1)
        self.assertIn("| A | B |", tables[0])
