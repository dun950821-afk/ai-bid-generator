"""PdfParser 测试。"""
import io

import pytest


def _make_simple_pdf(text: str = "Hello PDF world content") -> bytes:
    """生成一个最简 PDF（仅文本），用于测试。

    使用 reportlab 若可用；否则手工构造一个最小 PDF。
    """
    try:
        from reportlab.pdfgen import canvas
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(100, 750, text)
        c.showPage()
        c.save()
        return buf.getvalue()
    except ImportError:
        # 手工构造最小 PDF
        # 一个 page 的 content stream 包含 (text) Tj
        text_escaped = text.replace("(", "\\(").replace(")", "\\)")
        content_stream = f"BT /F1 12 Tf 100 750 Td ({text_escaped}) Tj ET"
        objects = [
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n%s\nendstream" % (
                len(content_stream), content_stream.encode(),
            ),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ]
        pdf = bytearray(b"%PDF-1.4\n")
        offsets = []
        for i, obj in enumerate(objects, start=1):
            offsets.append(len(pdf))
            pdf.extend(f"{i} 0 obj\n".encode())
            pdf.extend(obj)
            pdf.extend(b"\nendobj\n")
        xref_offset = len(pdf)
        pdf.extend(b"xref\n0 6\n")
        pdf.extend(b"0000000000 65535 f \n")
        for off in offsets:
            pdf.extend(f"{off:010d} 00000 n \n".encode())
        pdf.extend(b"trailer\n<< /Size 6 /Root 1 0 R >>\n")
        pdf.extend(b"startxref\n")
        pdf.extend(f"{xref_offset}\n".encode())
        pdf.extend(b"%%EOF\n")
        return bytes(pdf)


def test_pdf_parser_supports_pdf():
    from apps.tender.services.parsers.pdf_parser import PdfParser
    parser = PdfParser()
    assert parser.supports("pdf")
    assert not parser.supports("docx")


def test_pdf_parser_extracts_text():
    from apps.tender.services.parsers.pdf_parser import PdfParser
    pdf_bytes = _make_simple_pdf("Hello PDF world content")
    parser = PdfParser()
    result = parser.parse(pdf_bytes, "test.pdf")
    assert result.parse_engine == "pdf-pdfplumber"
    assert "Hello" in result.markdown or "PDF" in result.markdown
    assert result.page_count == 1


def test_pdf_parser_returns_empty_for_corrupt():
    from apps.tender.services.parsers.pdf_parser import PdfParser
    parser = PdfParser()
    result = parser.parse(b"not a real pdf", "broken.pdf")
    assert result.parse_engine == "pdf-pdfplumber"
    assert result.parse_quality == "poor"
    assert result.error_message is not None
    assert "PDF 解析失败" in result.error_message


def test_pdf_parser_quality_assessment():
    """短文本 → poor/low 质量。"""
    from apps.tender.services.parsers.pdf_parser import PdfParser
    parser = PdfParser()
    pdf_bytes = _make_simple_pdf("Short text")
    result = parser.parse(pdf_bytes, "short.pdf")
    # 文本 < 500 字符 → poor
    assert result.parse_quality in ("poor", "low")


def test_pdf_parser_extension_check():
    """PdfParser.SUPPORTED_EXTENSIONS 只包含 pdf。"""
    from apps.tender.services.parsers.pdf_parser import PdfParser
    assert PdfParser.SUPPORTED_EXTENSIONS == ["pdf"]


def test_parse_service_routes_pdf():
    """ParseService 应将 pdf 文件路由到 PdfParser。"""
    from apps.tender.services.parse_service import ParseService
    pdf_bytes = _make_simple_pdf("Routing through ParseService works")
    service = ParseService()
    result = service._do_parse(pdf_bytes, "doc.pdf")
    assert result.parse_engine == "pdf-pdfplumber"
