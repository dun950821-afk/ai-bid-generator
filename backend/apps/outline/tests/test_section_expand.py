# backend/apps/outline/tests/test_section_expand.py
"""字数不足扩写测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.outline.services.section_expand_service import SectionExpandService

User = get_user_model()


class SectionExpandTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_expand_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_leaf_section(self, content="初始正文较短。", word_count=5):
        return Section.objects.create(
            outline=self.outline, title="1.1 测试章节", level=1, sort_order=1,
            content=content, content_word_count=word_count, word_count=word_count,
        )

    def test_apply_patch_insert_anchor_end(self):
        """insert anchor=end 追加到末尾。"""
        svc = SectionExpandService()
        result = svc._apply_patch("段落一。", {"operation": "insert", "anchor": "end", "content": "新增段落。"})
        self.assertEqual(result, "段落一。\n\n新增段落。")

    def test_apply_patch_insert_after_anchor(self):
        """insert 在指定段落后插入。"""
        svc = SectionExpandService()
        result = svc._apply_patch("段落一。\n\n段落二。", {
            "operation": "insert", "anchor": "段落一", "content": "插入段落。",
        })
        self.assertIn("插入段落。", result)
        self.assertLess(result.index("插入段落。"), result.index("段落二。"))

    def test_apply_patch_replace_anchor(self):
        """replace 替换指定段落。"""
        svc = SectionExpandService()
        result = svc._apply_patch("旧段落内容。\n\n保留段落。", {
            "operation": "replace", "anchor": "旧段落内容", "content": "新段落内容。",
        })
        self.assertIn("新段落内容。", result)
        self.assertNotIn("旧段落内容", result)
        self.assertIn("保留段落。", result)

    def test_expand_multi_round_until_target(self):
        """多轮扩写直到达标。"""
        section = self._make_leaf_section(content="短正文。", word_count=3)
        svc = SectionExpandService()

        call_count = {"n": 0}

        def mock_expand(section_id, user, minimum_words=500):
            call_count["n"] += 1
            s = Section.objects.get(pk=section_id)
            before = s.content_word_count or 3
            after = before * 4
            s.content_word_count = after
            s.content = s.content + " 扩写内容。"
            s.save(update_fields=["content", "content_word_count"])
            return {"expanded": True, "before_words": before, "after_words": after, "operation": "insert"}

        with patch.object(svc, "expand_section", side_effect=mock_expand):
            result = svc.run_expand(self.outline.id, minimum_words=10, user=self.user)

        self.assertEqual(result["total"], 1)
        self.assertGreaterEqual(call_count["n"], 1)
        section.refresh_from_db()
        self.assertGreaterEqual(section.content_word_count, 10)

    def test_expand_skip_already_long(self):
        """字数足够跳过。"""
        section = self._make_leaf_section(content="这是一段足够长的正文内容用于测试跳过扩写逻辑。", word_count=100)
        svc = SectionExpandService()
        result = svc.run_expand(self.outline.id, minimum_words=50, user=self.user)
        self.assertEqual(result["total"], 0)
        self.assertEqual(result["expanded"], 0)
