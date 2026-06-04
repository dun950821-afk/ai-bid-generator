# backend/apps/tender/services/parsers/text_parser.py
"""文本文件解析器（TXT/MD 和粘贴文本）。"""

import logging
from apps.tender.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)


class TextParser(BaseParser):
    """文本文件解析器。

    处理 .txt、.md 文件和用户粘贴的文本内容。
    """

    SUPPORTED_EXTENSIONS = ["txt", "md"]

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """解析文本文件。

        Args:
            content: 文件二进制内容
            filename: 文件名（用于判断类型）

        Returns:
            ParseResult 包含 Markdown 和元数据
        """
        # 尝试多种编码解码
        text = self._decode_content(content)

        extension = filename.lower().split(".")[-1] if "." in filename else "txt"

        if extension == "md":
            # Markdown 文件直接使用
            markdown = text
        else:
            # TXT 文件或粘贴文本，检测标题结构
            markdown = self._convert_to_markdown(text, filename)

        # 计算质量指标
        lines = markdown.split("\n")
        quality_metrics = {
            "char_count": len(markdown),
            "line_count": len(lines),
            "heading_count": sum(1 for line in lines if line.startswith("#")),
            "paragraph_count": sum(1 for line in lines if line.strip() and not line.startswith("#")),
        }

        # 质量评估
        parse_quality, error_message = self._evaluate_quality(markdown)

        return ParseResult(
            markdown=markdown,
            page_count=1,  # 文本文件视为单页
            page_map=[{"page": 1, "offset": 0, "length": len(markdown)}],
            parse_engine="text-direct",
            parse_quality=parse_quality,
            quality_metrics=quality_metrics,
            error_message=error_message,
        )

    def _decode_content(self, content: bytes) -> str:
        """解码二进制内容为文本。"""
        encodings = ["utf-8", "gbk", "gb2312", "utf-16", "latin-1"]

        for encoding in encodings:
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue

        # 最后尝试 utf-8 忽略错误
        return content.decode("utf-8", errors="ignore")

    def _convert_to_markdown(self, text: str, filename: str) -> str:
        """将纯文本转换为 Markdown 格式。"""
        lines = text.strip().split("\n")

        if not lines:
            return ""

        # 检测是否已有标题结构
        has_heading = any(line.strip().startswith("#") for line in lines)

        # 检测是否有数字编号标题（如 1. xxx 或 一、xxx）
        import re
        has_numbered_heading = any(
            re.match(r"^\d+\.\s+\S", line) or re.match(r"^[一二三四五六七八九十]+、", line)
            for line in lines
        )

        if has_heading:
            # 已有 Markdown 标题，直接使用
            return text.strip()

        if has_numbered_heading:
            # 有数字编号，转换为 Markdown 标题
            result_lines = []
            for line in lines:
                stripped = line.strip()
                # 一级标题：一、xxx 或 1. xxx
                if re.match(r"^[一二三四五六七八九十]+、", stripped):
                    result_lines.append(f"# {stripped}")
                elif re.match(r"^\d+\.\s+\S", stripped):
                    # 短行作为标题
                    if len(stripped) < 50:
                        result_lines.append(f"## {stripped}")
                    else:
                        result_lines.append(stripped)
                else:
                    result_lines.append(stripped)
            return "\n".join(result_lines)

        # 没有标题结构，添加一个默认标题
        title = "粘贴文本"
        if filename and filename != "pasted_text.txt":
            title = filename.rsplit(".", 1)[0]

        return f"# {title}\n\n{text.strip()}"

    def _evaluate_quality(self, markdown: str) -> tuple[str, str | None]:
        """评估解析质量。"""
        if len(markdown) < 500:
            return "poor", "解析文本过短，请确认文档内容是否正确"
        if len(markdown) < 1500:
            return "low", "解析文本较短，可能存在提取问题"
        return "high", None

    def parse_pasted_text(self, text: str, title: str = "粘贴文本") -> ParseResult:
        """解析用户粘贴的文本。

        Args:
            text: 粘贴的文本内容
            title: 可选标题

        Returns:
            ParseResult 包含 Markdown 和元数据
        """
        text = text.strip()

        if not text:
            return ParseResult(
                markdown="",
                page_count=0,
                page_map=[],
                parse_engine="text-pasted",
                parse_quality="poor",
                quality_metrics={"char_count": 0},
                error_message="粘贴内容为空",
            )

        # 检测是否已有标题结构
        lines = text.split("\n")
        has_heading = any(line.strip().startswith("#") for line in lines)

        if has_heading:
            markdown = text
        else:
            markdown = f"# {title}\n\n{text}"

        quality_metrics = {
            "char_count": len(markdown),
            "line_count": len(lines),
        }

        parse_quality, error_message = self._evaluate_quality(markdown)

        return ParseResult(
            markdown=markdown,
            page_count=1,
            page_map=[{"page": 1, "offset": 0, "length": len(markdown)}],
            parse_engine="text-pasted",
            parse_quality=parse_quality,
            quality_metrics=quality_metrics,
            error_message=error_message,
        )
