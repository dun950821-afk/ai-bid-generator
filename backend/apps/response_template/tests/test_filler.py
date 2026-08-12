"""填充引擎测试(内存 docx, 不碰 DB)。"""

from io import BytesIO
from types import SimpleNamespace

import pytest
from docx import Document

from apps.response_template.constants import BlockFillStatus
from apps.response_template.services.filler import OoxmlFiller

filler = OoxmlFiller()


def make_doc(paragraphs=None, tables=None):
    """构造内存 docx。"""
    doc = Document()
    for text in paragraphs or []:
        doc.add_paragraph(text)
    for rows in tables or []:
        t = doc.add_table(rows=len(rows), cols=len(rows[0]))
        for i, row in enumerate(rows):
            for j, val in enumerate(row):
                t.cell(i, j).text = val
    return doc


def make_block(**kw):
    defaults = {
        "block_key": "T1",
        "title": "t",
        "anchor_text": "",
        "binding_config": {},
        "source_config": {},
        "block_type": "AUTO_FIELD",
    }
    defaults.update(kw)
    return SimpleNamespace(**defaults)


class TestPlaceholderReplace:
    def test_underline(self):
        assert filler._replace_first_placeholder("地址：____", "北京") == "地址：北京"
        assert filler._replace_first_placeholder("____年", "2026") == "2026年"

    def test_year_month_day(self):
        text = "日    期：      年     月     日"
        out = filler._replace_first_placeholder(text, "2026年8月12日")
        assert out == "日    期：2026年8月12日"

    def test_paren(self):
        assert filler._replace_first_placeholder("（电话）", "010-1234") == "010-1234"

    def test_no_placeholder_unchanged(self):
        text = "普通文本"
        assert filler._replace_first_placeholder(text, "x") == text


class TestNormalize:
    def test_fullwidth_paren(self):
        assert filler._normalize("响应人 （名称）") == "响应人(名称)"
        assert filler._normalize("地址 ： xx") == "地址：xx"


class TestFindParagraph:
    def test_prefers_placeholder_paragraph(self):
        doc = make_doc(paragraphs=[
            "与本响应有关的一切正式信函使用以下地址：",  # 先出现, 无空位
            "地址：              （地址）",             # 有空位
        ])
        para = filler._find_paragraph(doc, "地址")
        assert "（地址）" in para.text

    def test_paragraph_in_table_cell(self):
        doc = make_doc(tables=[[["响应人名称", "____"], ["经营范围", "____"]]])
        para = filler._find_paragraph(doc, "经营范围")
        assert para is not None
        assert "经营范围" in para.text


class TestTextFill:
    def test_fill_underline(self):
        doc = make_doc(paragraphs=["电话：____"])
        block = make_block(anchor_text="电话")
        warnings = []
        status = filler._fill_text_placeholder(doc, block, "010-12345678", warnings)
        assert status == BlockFillStatus.FILLED
        assert "010-12345678" in doc.paragraphs[0].text
        assert not warnings

    def test_fill_year_month_day(self):
        doc = make_doc(paragraphs=["日    期：      年     月     日"])
        block = make_block(anchor_text="日期")
        warnings = []
        status = filler._fill_text_placeholder(doc, block, "2026年8月12日", warnings)
        assert status == BlockFillStatus.FILLED
        assert "2026年8月12日" in doc.paragraphs[0].text

    def test_missing_anchor(self):
        doc = make_doc(paragraphs=["其他内容"])
        block = make_block(anchor_text="不存在的锚点")
        warnings = []
        status = filler._fill_text_placeholder(doc, block, "v", warnings)
        assert status == BlockFillStatus.NEEDS_REVIEW
        assert warnings


class TestTableCellFill:
    def test_fill_row_after_label(self):
        doc = make_doc(tables=[[["响应人名称", "____"], ["经营范围", "____"]]])
        block = make_block(anchor_text="响应人名称")
        warnings = []
        status = filler._fill_table_by_label(doc, block, "某某科技有限公司", warnings)
        assert status == BlockFillStatus.FILLED
        assert "某某科技有限公司" in doc.tables[0].cell(0, 1).text

    def test_skips_tblpr(self):
        """含 tblPrEx 的复杂行不应报错(回归: CT_TblPrEx p_lst)。"""
        doc = make_doc(tables=[[["响应人名称", "____"], ["经营范围", "____"]]])
        block = make_block(anchor_text="响应人名称")
        warnings = []
        status = filler._fill_table_by_label(doc, block, "v", warnings)
        assert status == BlockFillStatus.FILLED


class TestRowClone:
    def test_clone_row(self):
        doc = make_doc(tables=[[["项目阶段", "工作项"], ["启动", ""], ["实施", ""]]])
        table = doc.tables[0]
        filler._clone_table_row(table, table.rows[-1])
        assert len(table.rows) == 4
        # 新行文本为空
        assert table.rows[-1].cells[0].text == ""
