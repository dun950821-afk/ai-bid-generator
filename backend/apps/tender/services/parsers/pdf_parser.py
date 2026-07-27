# backend/apps/tender/services/parsers/pdf_parser.py
"""PDF 文档解析器。

使用 pdfplumber 提取文本与表格，转换为 Markdown。
"""

import io
import logging

from apps.tender.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)


class PdfParser(BaseParser):
    """PDF 文档解析器。

    使用 pdfplumber 提取文本与表格。
    """

    SUPPORTED_EXTENSIONS = ["pdf"]

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """解析 PDF 文件。

        Args:
            content: PDF 文件二进制内容
            filename: 文件名

        Returns:
            ParseResult 包含 Markdown 和元数据
        """
        try:
            import pdfplumber
        except ImportError:
            raise RuntimeError("pdfplumber 未安装，请添加到 requirements.txt")

        markdown_parts = []
        page_map = []
        table_count = 0
        total_chars = 0

        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                page_count = len(pdf.pages)
                for page_idx, page in enumerate(pdf.pages, start=1):
                    page_text_parts = []

                    # 提取表格优先（避免文本与表格重复）
                    tables = page.extract_tables() or []
                    for table in tables:
                        table_md = self._table_to_markdown(table)
                        if table_md:
                            page_text_parts.append(table_md)
                            table_count += 1

                    # 提取页面纯文本（排除已被表格覆盖的部分）
                    text = page.extract_text() or ""
                    if text:
                        # 简单清理：去除每页页眉页脚（首尾 1 行如果太短）
                        cleaned = self._clean_page_text(text)
                        if cleaned:
                            page_text_parts.append(cleaned)
                            total_chars += len(cleaned)

                    # 累加到全文
                    if page_text_parts:
                        page_md = "\n\n".join(page_text_parts)
                        markdown_parts.append(page_md)
                        page_map.append(
                            {
                                "page": page_idx,
                                "char_offset_start": sum(
                                    len(p) + 2 for p in markdown_parts[:-1]
                                ),
                                "char_offset_end": sum(len(p) + 2 for p in markdown_parts),
                            }
                        )
        except Exception as e:
            logger.exception("Failed to parse PDF: %s", filename)
            return ParseResult(
                markdown="",
                page_count=0,
                page_map=[],
                parse_engine="pdf-pdfplumber",
                parse_quality="poor",
                quality_metrics={},
                error_message=f"PDF 解析失败: {type(e).__name__}: {e}",
            )

        markdown = "\n\n".join(markdown_parts)

        quality_metrics = {
            "page_count": page_count,
            "table_count": table_count,
            "char_count": len(markdown),
            "avg_chars_per_page": total_chars // max(page_count, 1),
        }

        parse_quality, error_message = self._evaluate_quality(markdown)

        return ParseResult(
            markdown=markdown,
            page_count=page_count,
            page_map=page_map,
            parse_engine="pdf-pdfplumber",
            parse_quality=parse_quality,
            quality_metrics=quality_metrics,
            error_message=error_message,
        )

    def _table_to_markdown(self, table) -> str:
        """pdfplumber 表格 → Markdown 表格。"""
        if not table or not table[0]:
            return ""
        rows = []
        col_count = len(table[0])
        for raw_row in table:
            row = []
            for cell in raw_row:
                cell_text = (cell or "").strip().replace("\n", " ").replace("|", "\\|")
                row.append(cell_text)
            # 补齐列数
            while len(row) < col_count:
                row.append("")
            rows.append(row)

        lines = []
        header = rows[0]
        lines.append("| " + " | ".join(header) + " |")
        lines.append("| " + " | ".join(["---"] * col_count) + " |")
        for row in rows[1:]:
            lines.append("| " + " | ".join(row[:col_count]) + " |")
        return "\n".join(lines)

    def _clean_page_text(self, text: str) -> str:
        """简单清理：合并连续空白，移除每行首尾多余空格。"""
        if not text:
            return ""
        lines = [line.strip() for line in text.splitlines()]
        # 移除首尾空行
        while lines and not lines[0]:
            lines.pop(0)
        while lines and not lines[-1]:
            lines.pop()
        return "\n".join(lines)

    def _evaluate_quality(self, markdown: str) -> tuple[str, str | None]:
        if len(markdown) < 500:
            return "poor", "解析文本过短，请确认 PDF 是否为扫描件（图片型 PDF 无法提取文本）"
        if len(markdown) < 1500:
            return "low", "解析文本较短，可能是扫描件或部分页面无法提取"
        return "high", None
