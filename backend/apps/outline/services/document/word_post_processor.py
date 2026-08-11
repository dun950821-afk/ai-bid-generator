# backend/apps/outline/services/document/word_post_processor.py
"""OOXML 后处理：替换带标记的图片（方案 §32 页眉动态 Logo）。

docxtpl 无法向页眉/页脚注入动态图片，官方推荐的做法是模板预置
占位图片、渲染后替换图片二进制。约定：

模板设计者在页眉/页脚插入占位图片（PNG），把图片的「替代文本/
描述」(wp:docPr 的 descr) 设置为 bid.image:company.logo；渲染完成后
本模块把对应 media 文件替换为真实企业 Logo（尺寸/位置自动保留）。

注意：替换仅按字节覆盖 media part，占位图与 Logo 需同格式（建议 PNG）。
"""

import logging
import re
import zipfile
from io import BytesIO
from posixpath import dirname, normpath
from typing import Dict

from lxml import etree

logger = logging.getLogger(__name__)

WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

DOC_PART_RE = re.compile(r"^word/(document|header\d*|footer\d*)\.xml$")


def _rels_part_for(part_name: str) -> str:
    """word/header1.xml → word/_rels/header1.xml.rels"""
    return f"{dirname(part_name)}/_rels/{part_name.rsplit('/', 1)[-1]}.rels"


def replace_tagged_images(docx_bytes: bytes, replacements: Dict[str, bytes]) -> bytes:
    """替换 docx 中所有 descr/name 匹配标记的图片。

    Args:
        docx_bytes: 渲染产物
        replacements: {标记: 新图片字节}，标记如 bid.image:company.logo

    Returns:
        替换后的 docx 字节（无匹配时原样返回）
    """
    if not replacements:
        return docx_bytes

    src = BytesIO(docx_bytes)
    media_replacements: Dict[str, bytes] = {}

    with zipfile.ZipFile(src, "r") as zf:
        names = set(zf.namelist())
        for part_name in sorted(names):
            if not DOC_PART_RE.match(part_name):
                continue
            root = etree.fromstring(zf.read(part_name))

            # 收集 docPr 标记 → r:embed
            embed_ids = set()
            for doc_pr in root.iter(f"{{{WP_NS}}}docPr"):
                marker = doc_pr.get("descr") or doc_pr.get("name") or ""
                if marker in replacements:
                    drawing = doc_pr.getparent()
                    while drawing is not None and drawing.tag != f"{{{WP_NS}}}inline" and drawing.tag != f"{{{WP_NS}}}anchor":
                        drawing = drawing.getparent()
                    if drawing is None:
                        continue
                    for blip in drawing.iter(f"{{{A_NS}}}blip"):
                        embed = blip.get(f"{{{R_NS}}}embed")
                        if embed:
                            embed_ids.add((embed, marker))

            if not embed_ids:
                continue

            rels_name = _rels_part_for(part_name)
            if rels_name not in names:
                continue
            rels_root = etree.fromstring(zf.read(rels_name))
            rel_targets = {
                rel.get("Id"): rel.get("Target")
                for rel in rels_root.iter(f"{{{RELS_NS}}}Relationship")
            }
            for embed_id, marker in embed_ids:
                target = rel_targets.get(embed_id)
                if not target:
                    continue
                media_part = normpath(f"{dirname(part_name)}/{target}")
                media_replacements[media_part] = replacements[marker]
                logger.info(
                    f"Header/footer image replaced: {media_part} <- {marker}"
                )

    if not media_replacements:
        return docx_bytes

    # 重写 zip，覆盖命中的 media part
    out = BytesIO()
    with zipfile.ZipFile(BytesIO(docx_bytes), "r") as zin, zipfile.ZipFile(
        out, "w", zipfile.ZIP_DEFLATED
    ) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename in media_replacements:
                data = media_replacements[item.filename]
            zout.writestr(item, data)
    out.seek(0)
    return out.read()
