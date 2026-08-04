"""MergeParseService 测试。"""

from unittest.mock import patch

import pytest

from apps.tender.models import ParsedDocument, TenderFile
from apps.tender.services.merge_parse_service import (
    MergeParseService,
    _offset_page_lines,
)


@pytest.mark.django_db
class TestPageOffset:
    def test_offset_standalone_page_lines(self):
        text = "第5页\n\n正文内容\n\nP3\n\n10/32\n\nP5/32\n\n5/32 出现在正文不处理"
        out = _offset_page_lines(text, 32)
        assert "第37页" in out
        assert "P35" in out
        assert "42/64" in out
        assert "P37/64" in out  # P5/32 + 32 → P37/64（P 前缀保留）
        assert "5/32 出现在正文不处理" in out  # 非独立行不替换

    def test_offset_zero_no_change(self):
        assert _offset_page_lines("第5页", 0) == "第5页"


@pytest.mark.django_db
class TestMerge:
    def _make_file(self, project, user, name, status=TenderFile.STATUS_PARSED):
        return TenderFile.objects.create(
            project=project, original_name=name, file_size=1024,
            content_type="application/pdf", object_key=f"tender/{name}",
            status=status, created_by=user,
        )

    def test_merge_concatenates_with_separators(self, project, bid_manager_user):
        main = self._make_file(project, bid_manager_user, "main.pdf")
        att = self._make_file(project, bid_manager_user, "tech.pdf")

        def fake_parse(tf):
            return ParsedDocument(
                tender_file=tf, is_active=True,
                markdown_uri=f"parsed/{tf.id}/document.md",
                page_count=10 if tf == main else 5,
                parse_engine="mock", parser_version="mock-v1",
                parse_quality="high", input_hash=f"in-{tf.id}", output_hash=f"out-{tf.id}",
            )

        def fake_get_object(key):
            if "document.md" in key:
                return f"# 第一章\n主文件内容\n第3页".encode()
            return "".encode()

        with patch("apps.tender.services.parse_service.ParseService.parse", side_effect=fake_parse):
            with patch("apps.requirements.services.document_text_service.DocumentTextService.get_document_text",
                       side_effect=lambda tf: f"全文{tf.id}"):
                with patch("apps.tender.services.merge_parse_service.StorageService") as StorageMock:
                    storage = StorageMock.return_value
                    storage.get_object.side_effect = fake_get_object
                    storage.put_object.return_value = None

                    merged_doc, source_map = MergeParseService().merge(main, [att])

        assert merged_doc.tender_file == main
        assert merged_doc.page_count == 15
        assert source_map == {"文件：tech.pdf（附件）": att}
        # 合并全文包含分隔标题（内容在 put_object 的 args[1]，第一次调用是合并 markdown）
        merged_markdown = storage.put_object.call_args_list[0].args[1].decode()
        assert "# 文件：tech.pdf（附件）" in merged_markdown
        # 附件页码偏移：第3页 → 第13页（主文件 10 页）
        assert "第13页" in merged_markdown
        # 主文件在前、附件在后
        assert merged_markdown.index("# 第一章") < merged_markdown.index("# 文件：tech.pdf（附件）")

    def test_merge_writes_document_text(self, project, bid_manager_user):
        main = self._make_file(project, bid_manager_user, "main.pdf")
        att = self._make_file(project, bid_manager_user, "tech.pdf")

        with patch("apps.tender.services.parse_service.ParseService.parse",
                   side_effect=lambda tf: ParsedDocument(
                       tender_file=tf, is_active=True,
                       markdown_uri=f"parsed/{tf.id}/document.md",
                       page_count=10, parse_engine="mock", parser_version="mock-v1",
                       parse_quality="high", input_hash=f"in-{tf.id}", output_hash=f"out-{tf.id}",
                   )):
            with patch("apps.tender.services.merge_parse_service.StorageService") as StorageMock:
                storage = StorageMock.return_value
                storage.get_object.return_value = "正文内容\n第3页".encode("utf-8")
                with patch("apps.requirements.services.document_text_service.DocumentTextService.get_document_text",
                           side_effect=lambda tf: f"全文{tf.id}\n第3页"):
                    MergeParseService().merge(main, [att])

        main.refresh_from_db()
        assert main.document_text_object_key == f"parsed/{main.id}/document_text.txt"
        assert main.document_text_hash
        # document_text 是第二次 put_object（第一次是合并 markdown），内容在 args[1]
        text = storage.put_object.call_args_list[1].args[1].decode()
        assert "文件：tech.pdf（附件）" in text

    def test_remerge_creates_new_version(self, project, bid_manager_user):
        main = self._make_file(project, bid_manager_user, "main.pdf")
        att1 = self._make_file(project, bid_manager_user, "att1.pdf")
        att2 = self._make_file(project, bid_manager_user, "att2.pdf")

        with patch("apps.tender.services.parse_service.ParseService.parse",
                   side_effect=lambda tf: ParsedDocument(
                       tender_file=tf, is_active=True,
                       markdown_uri=f"parsed/{tf.id}/document.md",
                       page_count=10, parse_engine="mock", parser_version="mock-v1",
                       parse_quality="high", input_hash=f"in-{tf.id}", output_hash=f"out-{tf.id}",
                   )):
            with patch("apps.tender.services.merge_parse_service.StorageService") as StorageMock:
                storage = StorageMock.return_value
                storage.get_object.return_value = b"x"
                with patch("apps.requirements.services.document_text_service.DocumentTextService.get_document_text",
                           side_effect=lambda tf: f"全文{tf.id}"):
                    MergeParseService().merge(main, [att1])
                    MergeParseService().merge(main, [att1])  # 同内容重复合并 → 幂等，不产生新版本
                    MergeParseService().merge(main, [att1, att2])  # 内容变化 → 新版本

        # 同内容合并幂等（1 行）+ 内容变化新版本（+1 行）→ 共 2 行
        assert ParsedDocument.objects.filter(tender_file=main).count() == 2
        active_doc = ParsedDocument.objects.get(tender_file=main, is_active=True)
        # 最新一条是 [att1, att2] 的合并版本
        assert "att2.pdf" in active_doc.quality_metrics["merged_files"]
