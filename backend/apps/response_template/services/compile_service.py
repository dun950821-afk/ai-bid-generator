# -*- coding: utf-8 -*-
"""Content Control 编译服务(v2 定位)。

识别完成后, 在原始 docx 的每个块锚点段落中注入 run 级 SDT 控件
(Tag = bid.rt:<block_key>), 生成 compiled 模板快照。

填充时 OoxmlFiller 优先按 SDT Tag 精确定位, 找不到再回退文本锚点,
彻底解决锚点文本歧义问题。

SDT 注入为 run 级(段落内部), 不包裹段落, 不破坏 python-docx 的
段落/表格遍历结构。
"""

import io
import logging

from lxml import etree

from apps.common.services.storage import StorageService
from apps.response_template.constants import TemplateStatus

logger = logging.getLogger(__name__)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def _qn(local: str) -> str:
    return f"{{{W_NS}}}{local}"


def build_sdt_xml(tag: str) -> etree._Element:
    """构造 run 级 sdt: <w:sdt><w:sdtPr><w:tag/></w:sdtPr><w:sdtContent><w:r><w:t/></w:r></w:sdtContent></w:sdt>"""
    sdt = etree.Element(_qn("sdt"))
    sdt_pr = etree.SubElement(sdt, _qn("sdtPr"))
    tag_el = etree.SubElement(sdt_pr, _qn("tag"))
    tag_el.set(_qn("val"), tag)
    content = etree.SubElement(sdt, _qn("sdtContent"))
    run = etree.SubElement(content, _qn("r"))
    t = etree.SubElement(run, _qn("t"))
    t.set(XML_SPACE, "preserve")
    t.text = ""
    return sdt


def iter_sdts(root: etree._Element):
    """遍历所有 sdt 元素。"""
    return root.iter(_qn("sdt"))


def find_sdt_by_tag(root: etree._Element, tag: str):
    """按 Tag 查找 sdt 元素。"""
    for sdt in iter_sdts(root):
        tag_el = sdt.find(f"{_qn('sdtPr')}/{_qn('tag')}")
        if tag_el is not None and tag_el.get(_qn("val")) == tag:
            return sdt
    return None


def compile_template(template) -> str:
    """为响应模板生成 compiled 模板, 返回 MinIO object_key。

    - 拉取原始 docx
    - 对每个块: 定位锚点段落, 段落开头注入 run 级 sdt(tag=bid.rt:<block_key>)
    - 保存到 MinIO: projects/<pid>/response/<tid>/compiled.docx
    - 更新 template.compiled_file_key
    """
    from docx import Document
    from apps.response_template.services.filler import OoxmlFiller

    storage = StorageService()
    raw = storage.get_object(template.source_file.object_key)
    doc = Document(io.BytesIO(raw))
    filler = OoxmlFiller()

    injected = 0
    for block in template.blocks.all():
        anchor = (block.anchor_text or "").strip()
        if not anchor:
            continue
        # 附件限定定位(与填充一致), 避免同一 label 多附件歧义
        attachment_no = (block.source_config or {}).get("attachment_no")
        para = filler._find_paragraph(doc, anchor, attachment_no=attachment_no)
        if para is None:
            continue
        tag = f"bid.rt:{block.block_key}"
        p_el = para._p
        sdt = build_sdt_xml(tag)
        # 插入到段落第一个 run 之前(段落开头)
        first_run = p_el.find(_qn("r"))
        if first_run is not None:
            first_run.addprevious(sdt)
        else:
            p_el.append(sdt)
        injected += 1

    buffer = io.BytesIO()
    doc.save(buffer)
    object_key = (
        f"projects/{template.project_id}/response/{template.id}/compiled.docx"
    )
    storage.put_object(
        object_key,
        buffer.getvalue(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    template.compiled_file_key = object_key
    template.save(update_fields=["compiled_file_key", "updated_at"])
    logger.info("compiled template generated: template=%s injected=%s", template.id, injected)
    return object_key
