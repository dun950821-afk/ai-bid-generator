# backend/apps/outline/services/template/template_compiler.py
"""模板编译器（方案 §7）：Content Control → docxtpl 内部渲染指令。

设计层协议（用户可见）：Word Content Control，Tag = bid.<type>:<key>
渲染层工具（后端内部）：docxtpl + Jinja2

编译规则：
- bid.var:company.name      → 文本 run `{{ company.name }}`
- bid.image:company.logo    → 文本 run `{{ images.company_logo }}`（图片变量，Phase 3 提供 InlineImage）
- bid.material:<usage_key>  → 文本 run `{{ materials.<usage_key> }}`
- bid.slot:body             → 段落级指令 `{{p body }}`（独占所在段落）

用户永远不需要看到 Jinja 语法（方案 §3.1）。
"""

import re
import zipfile
from io import BytesIO
from typing import Dict, List, Optional

from lxml import etree

from apps.outline.services.template.template_variable_registry import (
    CONTROL_IMAGE,
    CONTROL_MATERIAL,
    CONTROL_SLOT,
    CONTROL_VAR,
    TemplateVariableRegistry,
)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"

# 处理的主文档 + 页眉页脚（页眉页脚不允许放正文插槽）
DOCUMENT_PART = "word/document.xml"
EXTRA_PART_RE = re.compile(r"^word/(header\d*|footer\d*)\.xml$")

# 高级模式：用户在模板里直接写的简单 Jinja 变量（扫描用）
RAW_JINJA_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][\w.]*?)\s*\}\}")

# 任意 Jinja 标签（表达式 {{ }} / 语句 {% %} / 注释 {# #}）。
# 凡不匹配 RAW_JINJA_VAR_RE 白名单形式的标签一律视为非法表达式：
# 简单变量名正则无法约束带括号/引号/运算符的表达式，后者可造成 SSTI。
ANY_JINJA_TAG_RE = re.compile(r"\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\}", re.S)


def _qn(local: str) -> str:
    return f"{{{W_NS}}}{local}"


def _iter_parts(zf: zipfile.ZipFile):
    """产出需要处理的 XML part：(part_name, is_main_document)。"""
    names = set(zf.namelist())
    if DOCUMENT_PART in names:
        yield DOCUMENT_PART, True
    for name in sorted(names):
        if EXTRA_PART_RE.match(name):
            yield name, False


def _sdt_tag(sdt: etree._Element) -> Optional[str]:
    """取 w:sdt 的 Tag 值。"""
    tag_el = sdt.find(f"{_qn('sdtPr')}/{_qn('tag')}")
    if tag_el is None:
        return None
    return tag_el.get(_qn("val"))


def _first_run_rpr(sdt: etree._Element) -> Optional[etree._Element]:
    """取控件内容里第一个 run 的 rPr，用于保留用户设置的字体格式。"""
    run = sdt.find(f".//{_qn('r')}")
    if run is not None:
        rpr = run.find(_qn("rPr"))
        if rpr is not None:
            return rpr
    return None


def _new_el(local: str) -> etree._Element:
    return etree.Element(_qn(local))


def _build_text_run(text: str, rpr: Optional[etree._Element] = None) -> etree._Element:
    """构造 <w:r><w:t xml:space="preserve">text</w:t></w:r>。"""
    run = _new_el("r")
    if rpr is not None:
        run.append(etree.fromstring(etree.tostring(rpr)))
    t = etree.SubElement(run, _qn("t"))
    t.set(XML_SPACE, "preserve")
    t.text = text
    return run


def _jinja_text_for(parsed: dict) -> str:
    """控件 Tag → 渲染指令文本。"""
    control_type, key = parsed["type"], parsed["key"]
    if control_type == CONTROL_VAR:
        return "{{ " + key + " }}"
    if control_type == CONTROL_IMAGE:
        return "{{ images." + key.replace(".", "_") + " }}"
    if control_type == CONTROL_MATERIAL:
        return "{{ materials." + key + " }}"
    raise ValueError(f"slot 控件不能转换为文本 run: {key}")


def _compile_part(root: etree._Element, is_main_document: bool) -> int:
    """编译单个 XML part，返回转换的控件数量。"""
    count = 0
    # 收集所有带 bid.* Tag 的 sdt；按嵌套深度倒序处理，避免外层替换吞掉内层
    sdts = []
    for sdt in root.iter(_qn("sdt")):
        tag = _sdt_tag(sdt)
        parsed = TemplateVariableRegistry.parse_control_tag(tag or "")
        if parsed is None:
            continue
        depth = sum(1 for _ in sdt.iterancestors())
        sdts.append((depth, sdt, parsed))
    sdts.sort(key=lambda item: item[0], reverse=True)

    for _, sdt, parsed in sdts:
        if parsed["type"] == CONTROL_SLOT:
            if not is_main_document:
                # 页眉页脚不允许正文插槽，跳过（校验器会报错）
                continue
            _replace_slot(sdt, parsed["key"])
        else:
            _replace_inline_sdt(sdt, _jinja_text_for(parsed))
        count += 1
    return count


def _replace_inline_sdt(sdt: etree._Element, jinja_text: str) -> None:
    """把 inline 控件替换为含渲染指令的文本 run，保留首个 run 的格式。"""
    parent = sdt.getparent()
    if parent is None:
        return
    index = parent.index(sdt)
    run = _build_text_run(jinja_text, _first_run_rpr(sdt))
    parent.remove(sdt)
    parent.insert(index, run)


def _slot_directive(key: str) -> str:
    """插槽 key → docxtpl 段落级指令名。

    body              → {{p body }}
    role.<role>       → {{p slot_role_<role> }}（扁平 key，避免 jinja 点号歧义）
    """
    if key == "body":
        return "body"
    if key.startswith("role."):
        return "slot_role_" + key.split(".", 1)[1]
    return "slot_" + key.replace(".", "_")


def _replace_slot(sdt: etree._Element, key: str) -> None:
    """正文插槽：指令必须独占段落（docxtpl 段落级语法要求）。

    - inline 控件：清空所在 w:p 的内容（保留 pPr），写入 `{{p body }}` run
    - block 控件：整个 sdt 替换为新的 w:p
    """
    directive = "{{p " + _slot_directive(key) + " }}"
    paragraph = None
    node = sdt
    while node is not None:
        if node.tag == _qn("p"):
            paragraph = node
            break
        node = node.getparent()

    if paragraph is not None:
        for child in list(paragraph):
            if child.tag != _qn("pPr"):
                paragraph.remove(child)
        paragraph.append(_build_text_run(directive, _first_run_rpr(sdt)))
    else:
        # block 级控件：直接用新段落替换 sdt
        parent = sdt.getparent()
        if parent is None:
            return
        index = parent.index(sdt)
        paragraph = _new_el("p")
        paragraph.append(_build_text_run(directive, _first_run_rpr(sdt)))
        parent.remove(sdt)
        parent.insert(index, paragraph)


def compile_template(content: bytes) -> bytes:
    """把模板 docx 编译为 docxtpl 内部模板。

    Args:
        content: 原始模板 docx 字节

    Returns:
        编译后的 docx 字节（可缓存，缓存 key = 原文件 hash）
    """
    src = BytesIO(content)
    out = BytesIO()

    with zipfile.ZipFile(src, "r") as zin:
        part_names = {name for name, _ in _iter_parts(zin)}
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename in part_names:
                    root = etree.fromstring(data)
                    _compile_part(root, item.filename == DOCUMENT_PART)
                    data = etree.tostring(
                        root, xml_declaration=True, encoding="UTF-8", standalone=True
                    )
                zout.writestr(item, data)

    out.seek(0)
    return out.read()


def scan_template(content: bytes) -> dict:
    """扫描模板中的模板控件与裸 Jinja 变量。

    Returns:
        {
            "controls": [{"tag", "type", "key", "part"}],
            "raw_variables": ["company.name", ...],
            "suspicious_tags": ["{{ ... }}"/"{% ... %}"/"{# ... #}" 形式的非白名单标签],
            "body_slot_count": int,
        }
    """
    controls: List[Dict] = []
    raw_variables: List[str] = []
    slot_keys: List[str] = []
    suspicious_tags: List[str] = []

    with zipfile.ZipFile(BytesIO(content), "r") as zf:
        for part_name, is_main in _iter_parts(zf):
            root = etree.fromstring(zf.read(part_name))

            for sdt in root.iter(_qn("sdt")):
                tag = _sdt_tag(sdt)
                parsed = TemplateVariableRegistry.parse_control_tag(tag or "")
                if parsed is None:
                    continue
                controls.append(
                    {
                        "tag": tag,
                        "type": parsed["type"],
                        "key": parsed["key"],
                        "part": part_name,
                    }
                )
                if parsed["type"] == CONTROL_SLOT and is_main:
                    slot_keys.append(parsed["key"])

            # 裸 Jinja 变量（高级模式）：合并所有 w:t 文本后正则提取
            text = "".join(t.text or "" for t in root.iter(_qn("t")))
            for match in RAW_JINJA_VAR_RE.finditer(text):
                var = match.group(1)
                if var not in raw_variables:
                    raw_variables.append(var)

            # 非白名单形式的 Jinja 标签：可能是任意表达式/语句，必须拦截
            for match in ANY_JINJA_TAG_RE.finditer(text):
                tag = match.group(0)
                if not RAW_JINJA_VAR_RE.fullmatch(tag) and tag not in suspicious_tags:
                    suspicious_tags.append(tag)

    return {
        "controls": controls,
        "raw_variables": raw_variables,
        "suspicious_tags": suspicious_tags,
        "slot_keys": slot_keys,
        # 兼容字段：body 插槽数量
        "body_slot_count": slot_keys.count("body"),
    }
