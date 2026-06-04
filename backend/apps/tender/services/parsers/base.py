# backend/apps/tender/services/parsers/base.py
"""解析器基类和数据结构。"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParseResult:
    """解析结果数据结构。"""

    markdown: str
    page_count: int = 0
    page_map: list = field(default_factory=list)
    parse_engine: str = ""
    parse_quality: str = "high"
    quality_metrics: dict = field(default_factory=dict)
    error_message: Optional[str] = None


class BaseParser:
    """解析器基类。"""

    SUPPORTED_EXTENSIONS: list[str] = []

    def supports(self, extension: str) -> bool:
        """检查是否支持该文件扩展名。"""
        return extension.lower() in self.SUPPORTED_EXTENSIONS

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """解析文件内容。

        Args:
            content: 文件二进制内容
            filename: 文件名（用于判断类型）

        Returns:
            ParseResult 解析结果
        """
        raise NotImplementedError("Subclasses must implement parse()")