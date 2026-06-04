# backend/apps/tender/services/parsers/__init__.py
"""文档解析器模块。"""

from apps.tender.services.parsers.base import BaseParser, ParseResult
from apps.tender.services.parsers.docx_parser import DocxParser
from apps.tender.services.parsers.text_parser import TextParser
from apps.tender.services.parsers.mock_parser import MockParser

__all__ = [
    "BaseParser",
    "ParseResult",
    "DocxParser",
    "TextParser",
    "MockParser",
]
