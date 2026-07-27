# backend/apps/tender/services/parse_service.py
"""文档解析服务。"""

import logging
from hashlib import sha256

from django.conf import settings
from django.db import transaction

from apps.tender.constants import PARSER_VERSION, ParseQuality
from apps.tender.models import ParsedDocument
from apps.common.services.storage import StorageService
from apps.tender.services.parsers.base import ParseResult
from apps.tender.services.parsers.docx_parser import DocxParser
from apps.tender.services.parsers.text_parser import TextParser
from apps.tender.services.parsers.mock_parser import MockParser
from apps.tender.services.parsers.pdf_parser import PdfParser

logger = logging.getLogger(__name__)


class UnsupportedFormatError(Exception):
    """不支持的文件格式错误。"""

    pass


class ParseService:
    """文档解析服务。

    根据 settings.PARSER_ENGINE 选择解析器：
    - "mock": 使用 MockParser（测试用）
    - 其他: 使用真实解析器（DocxParser / TextParser / PdfParser）
    """

    VERSION = PARSER_VERSION

    # 支持的文件扩展名
    SUPPORTED_EXTENSIONS = ["docx", "txt", "md", "pdf"]

    # 不支持的扩展名及提示
    UNSUPPORTED_MESSAGE: dict = {}

    def __init__(self):
        self.docx_parser = DocxParser()
        self.text_parser = TextParser()
        self.pdf_parser = PdfParser()
        self.mock_parser = MockParser()

    def parse(self, tender_file) -> ParsedDocument:
        """解析招标文件，返回 ParsedDocument。

        Args:
            tender_file: TenderFile 实例

        Returns:
            ParsedDocument 实例

        Raises:
            UnsupportedFormatError: 文件格式不支持
        """
        # 获取文件扩展名
        extension = self._get_extension(tender_file.original_name)

        # 校验文件格式
        if extension not in self.SUPPORTED_EXTENSIONS:
            message = self.UNSUPPORTED_MESSAGE.get(
                extension, f"不支持的文件格式: {extension}"
            )
            raise UnsupportedFormatError(message)

        # 计算输入哈希（基于文件内容）
        storage = StorageService()
        content = storage.get_object(tender_file.object_key)
        input_hash = sha256(content).hexdigest()

        # 选择解析器并执行解析
        parse_result = self._do_parse(content, tender_file.original_name)

        # 处理解析结果
        markdown = parse_result.markdown
        quality_metrics = self._merge_quality_metrics(parse_result)

        # 上传到 MinIO
        markdown_uri = self._upload_to_minio(markdown, tender_file)

        # 计算输出哈希（基于 Markdown 内容）
        output_hash = self._compute_output_hash(markdown)

        # 切换活跃版本（事务保护）
        with transaction.atomic():
            ParsedDocument.objects.filter(
                tender_file=tender_file
            ).update(is_active=False)

            parsed_doc, _ = ParsedDocument.objects.update_or_create(
                tender_file=tender_file,
                parser_version=self.VERSION,
                input_hash=input_hash,
                defaults={
                    "is_active": True,
                    "markdown_uri": markdown_uri,
                    "page_count": parse_result.page_count,
                    "parse_engine": parse_result.parse_engine,
                    "parse_quality": parse_result.parse_quality,
                    "quality_metrics": quality_metrics,
                    "output_hash": output_hash,
                },
            )

        logger.info(
            "Parsed tender_file=%s parsed_document=%s engine=%s quality=%s chars=%d",
            tender_file.id,
            parsed_doc.id,
            parse_result.parse_engine,
            parse_result.parse_quality,
            len(markdown),
        )

        return parsed_doc

    def _get_extension(self, filename: str) -> str:
        """获取文件扩展名（小写）。"""
        if "." in filename:
            return filename.rsplit(".", 1)[-1].lower()
        return ""

    def _do_parse(self, content: bytes, filename: str) -> ParseResult:
        """执行解析。

        Args:
            content: 文件二进制内容
            filename: 文件名

        Returns:
            ParseResult 解析结果
        """
        extension = self._get_extension(filename)

        # 检查是否使用 Mock 解析器
        use_mock = getattr(settings, "PARSER_ENGINE", "real") == "mock"

        if use_mock:
            logger.info("Using MockParser as configured")
            return self.mock_parser.parse(content, filename)

        # 使用真实解析器
        if extension == "docx":
            return self.docx_parser.parse(content, filename)
        elif extension in ["txt", "md"]:
            return self.text_parser.parse(content, filename)
        elif extension == "pdf":
            return self.pdf_parser.parse(content, filename)
        else:
            raise UnsupportedFormatError(f"不支持的文件格式: {extension}")

    def _upload_to_minio(self, markdown: str, tender_file) -> str:
        """上传 Markdown 到 MinIO。"""
        storage = StorageService()
        object_key = f"parsed/{tender_file.id}/document.md"
        storage.put_object(object_key, markdown.encode("utf-8"), "text/markdown")
        return object_key

    def _compute_output_hash(self, markdown: str) -> str:
        """计算输出哈希（基于 Markdown 内容）。"""
        return sha256(markdown.encode("utf-8")).hexdigest()

    def _merge_quality_metrics(self, result: ParseResult) -> dict:
        """合并质量指标。"""
        metrics = result.quality_metrics.copy()
        metrics["parse_engine"] = result.parse_engine
        metrics["parse_quality"] = result.parse_quality
        if result.error_message:
            metrics["error_message"] = result.error_message
        return metrics

    def parse_pasted_text(self, text: str, tender_file) -> ParsedDocument:
        """解析用户粘贴的文本。

        Args:
            text: 粘贴的文本内容
            tender_file: TenderFile 实例（source_type 应为 pasted_text）

        Returns:
            ParsedDocument 实例
        """
        # 上传粘贴文本到 MinIO（作为 .md 文件）
        storage = StorageService()

        # 将粘贴文本保存为原始文件
        if not tender_file.object_key:
            object_key = f"pasted/{tender_file.id}/content.md"
            storage.put_object(object_key, text.encode("utf-8"), "text/markdown")
            tender_file.object_key = object_key
            tender_file.save(update_fields=["object_key"])

        # 计算哈希
        input_hash = sha256(text.encode("utf-8")).hexdigest()

        # 使用 TextParser 解析
        parse_result = self.text_parser.parse_pasted_text(text)

        # 处理解析结果
        markdown = parse_result.markdown
        quality_metrics = self._merge_quality_metrics(parse_result)

        # 上传 Markdown 到 MinIO
        markdown_uri = self._upload_to_minio(markdown, tender_file)

        # 计算输出哈希
        output_hash = self._compute_output_hash(markdown)

        # 切换活跃版本
        with transaction.atomic():
            ParsedDocument.objects.filter(
                tender_file=tender_file
            ).update(is_active=False)

            parsed_doc, _ = ParsedDocument.objects.update_or_create(
                tender_file=tender_file,
                parser_version=self.VERSION,
                input_hash=input_hash,
                defaults={
                    "is_active": True,
                    "markdown_uri": markdown_uri,
                    "page_count": parse_result.page_count,
                    "parse_engine": parse_result.parse_engine,
                    "parse_quality": parse_result.parse_quality,
                    "quality_metrics": quality_metrics,
                    "output_hash": output_hash,
                },
            )

        logger.info(
            "Parsed pasted text tender_file=%s chars=%d quality=%s",
            tender_file.id,
            len(text),
            parse_result.parse_quality,
        )

        return parsed_doc