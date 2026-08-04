"""多文件合并解析服务。

把主文件 + 附件各自解析后的 markdown 合并为统一文档：
- 主文件在前，附件按传入顺序，附件前插入 `# 文件：{name}（附件）` H1 分隔
- 附件正文页码整体 + 主文件累计 page_count（只替换独立行页码，避免误伤正文）
- 合并全文写入主文件 ParsedDocument 新版本（历史版本保留）与 document_text
"""

import logging
import re
from hashlib import sha256

from django.db import transaction

from apps.common.services.storage import StorageService
from apps.tender.constants import PARSER_VERSION, ParseQuality
from apps.tender.models import ParsedDocument, TenderFile
from apps.tender.services.parse_service import ParseService

logger = logging.getLogger(__name__)

# 独立行页码模式：第5页 / P5 / P5/32 / 10/32（非独立行不替换）
PAGE_LINE_PATTERN = re.compile(r"(?m)^\s*(P?\d+/\d+|P\d+|第\d+页)\s*$")


def _offset_page_lines(text: str, offset: int) -> str:
    """把独立行页码整体 +offset。"""
    if offset <= 0:
        return text

    def _replace(match):
        token = match.group(1)
        m = re.match(r"^(P?)(\d+)/(\d+)$", token)
        if m:
            prefix, num, total = m.group(1), int(m.group(2)), int(m.group(3))
            return f"{prefix}{num + offset}/{total + offset}"
        m = re.match(r"^P(\d+)$", token)
        if m:
            return f"P{int(m.group(1)) + offset}"
        m = re.match(r"^第(\d+)页$", token)
        if m:
            return f"第{int(m.group(1)) + offset}页"
        return token

    return PAGE_LINE_PATTERN.sub(_replace, text)


class MergeParseService:
    """合并解析服务。"""

    def merge(self, main_file: TenderFile, attachments: list[TenderFile]) -> tuple[ParsedDocument, dict[str, TenderFile]]:
        """合并解析主文件 + 附件。

        Returns:
            (merged_doc, source_file_map)：merged_doc 为主文件新版本 ParsedDocument；
            source_file_map 键为附件 section_path，值为附件 TenderFile。
        """
        storage = StorageService()
        parse_service = ParseService()

        # 1. 逐个解析（附件解析产物保留，独立查看）
        main_doc = parse_service.parse(main_file)
        attachment_docs = [parse_service.parse(a) for a in attachments]

        # 2. 合并 markdown（主文件在前，附件按顺序，页码偏移）
        main_markdown = storage.get_object(main_doc.markdown_uri).decode("utf-8")
        parts = [main_markdown]
        cumulative_pages = main_doc.page_count or 0
        source_file_map: dict[str, TenderFile] = {}
        for attachment, doc in zip(attachments, attachment_docs):
            markdown = storage.get_object(doc.markdown_uri).decode("utf-8")
            markdown = _offset_page_lines(markdown, cumulative_pages)
            section_path = f"文件：{attachment.original_name}（附件）"
            parts.append(f"# {section_path}\n\n{markdown}")
            source_file_map[section_path] = attachment
            cumulative_pages += doc.page_count or 0
        merged_markdown = "\n\n".join(parts)

        # 3. 上传合并全文
        merged_uri = f"parsed/{main_file.id}/document.md"
        storage.put_object(merged_uri, merged_markdown.encode("utf-8"), "text/markdown")
        total_pages = (main_doc.page_count or 0) + sum(doc.page_count or 0 for doc in attachment_docs)
        input_hash = sha256(merged_markdown.encode("utf-8")).hexdigest()

        # 4. 写 document_text（条款抽取零改动读合并全文）
        from apps.requirements.services.document_text_service import DocumentTextService
        text_service = DocumentTextService()
        main_text = text_service.get_document_text(main_file)
        text_parts = [main_text]
        cumulative_pages = main_doc.page_count or 0
        for attachment, doc in zip(attachments, attachment_docs):
            att_text = text_service.get_document_text(attachment)
            text_parts.append(
                f"# 文件：{attachment.original_name}（附件）\n\n{_offset_page_lines(att_text, cumulative_pages)}"
            )
            cumulative_pages += doc.page_count or 0
        merged_text = "\n\n".join(text_parts)
        text_key = f"parsed/{main_file.id}/document_text.txt"
        storage.put_object(text_key, merged_text.encode("utf-8"), "text/plain; charset=utf-8")
        main_file.document_text_object_key = text_key
        main_file.document_text_hash = sha256(merged_text.encode("utf-8")).hexdigest()
        main_file.save(update_fields=["document_text_object_key", "document_text_hash", "updated_at"])

        # 5. 主文件 ParsedDocument 新版本（复用现有版本机制，历史保留）
        with transaction.atomic():
            ParsedDocument.objects.filter(tender_file=main_file).update(is_active=False)
            merged_doc, _ = ParsedDocument.objects.update_or_create(
                tender_file=main_file,
                parser_version=PARSER_VERSION,
                input_hash=input_hash,
                defaults={
                    "is_active": True,
                    "markdown_uri": merged_uri,
                    "page_count": total_pages,
                    "parse_engine": "merge",
                    "parse_quality": ParseQuality.HIGH,
                    "quality_metrics": {
                        "merged_files": [main_file.original_name] + [a.original_name for a in attachments],
                        "parse_engine": "merge",
                        "parse_quality": ParseQuality.HIGH,
                    },
                    "output_hash": input_hash,
                },
            )

        logger.info(
            "Merged tender_file=%s attachments=%s chars=%d",
            main_file.id, [a.id for a in attachments], len(merged_markdown),
        )
        return merged_doc, source_file_map
