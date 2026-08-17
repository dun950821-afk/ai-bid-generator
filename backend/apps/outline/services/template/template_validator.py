# backend/apps/outline/services/template/template_validator.py
"""模板校验器（方案 §19/§20）。

五层校验：
1. DOCX 基础检查（ZIP/OOXML 完整性、python-docx 可打开）
2. 变量白名单检查（对照 TemplateVariableRegistry）
3. 正文插槽检查（必须且只能 1 个 bid.slot:body）
4. Style 检查（逻辑样式映射是否存在，缺失记 warning 不阻断发布）
5. 测试渲染（用注册表示例值真实执行一次渲染，必须成功）
"""

import logging
import zipfile
from io import BytesIO
from typing import List, Optional

from apps.outline.services.template.sandboxed_render import render_docx
from apps.outline.services.template.template_compiler import (
    compile_template,
    scan_template,
)

logger = logging.getLogger(__name__)
from apps.outline.services.template.template_variable_registry import (
    CONTROL_IMAGE,
    CONTROL_MATERIAL,
    CONTROL_SLOT,
    CONTROL_VAR,
    TemplateVariableRegistry,
    registry as default_registry,
)

# 已知的图片变量 key
KNOWN_IMAGE_KEYS = {"company.logo"}

# 逻辑样式 → 内置样式名（第四层校验用）
LOGICAL_STYLE_FALLBACK = {
    "heading1": "Heading 1",
    "heading2": "Heading 2",
    "heading3": "Heading 3",
    "heading4": "Heading 4",
    "body": "Normal",
    "list_bullet": "List Bullet",
    "list_number": "List Number",
    "table": "Table Grid",
    "quote": "Intense Quote",
    "image_caption": "Caption",
}

# 测试渲染用的 1x1 PNG
_DEMO_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class _DemoSection:
    """测试渲染用的演示章节（方案 §19 第五层 DemoBidContent）。"""

    def __init__(self, id, title, content, sort_order=0, parent_id=None, level=1):
        self.id = id
        self.title = title
        self.content = content
        self.sort_order = sort_order
        self.parent_id = parent_id
        self.level = level


DEMO_SECTIONS = [
    _DemoSection(1, "演示章节", "这是**演示正文**，包含加粗。\n\n- 要点一\n- 要点二"),
    _DemoSection(2, "演示表格", "| 项 | 值 |\n|---|---|\n| 工期 | 30天 |"),
]


class TemplateValidator:
    """模板校验器。"""

    def __init__(self, variable_registry: Optional[TemplateVariableRegistry] = None):
        self.registry = variable_registry or default_registry

    def validate(self, content: bytes, style_mapping: Optional[dict] = None) -> dict:
        """校验模板 docx。

        Args:
            content: 模板 docx 字节
            style_mapping: 草稿级样式映射（第四层校验映射目标是否存在）

        Returns:
            {"valid", "errors", "warnings", "variables", "styles"}
        """
        style_mapping = style_mapping or {}
        errors: List[dict] = []
        warnings: List[dict] = []
        variables: List[str] = []
        style_report: List[dict] = []

        # ---- 第一层：DOCX 基础检查 ----
        if not zipfile.is_zipfile(BytesIO(content)):
            return self._result(False, [{
                "code": "DOCX_INVALID",
                "message": "文件不是合法的 DOCX（ZIP/OOXML 结构损坏）",
            }], warnings, variables, style_report)

        try:
            with zipfile.ZipFile(BytesIO(content)) as zf:
                if "word/document.xml" not in zf.namelist():
                    return self._result(False, [{
                        "code": "DOCX_INVALID",
                        "message": "DOCX 缺少 word/document.xml，文件不完整",
                    }], warnings, variables, style_report)
        except zipfile.BadZipFile:
            return self._result(False, [{
                "code": "DOCX_INVALID",
                "message": "DOCX 文件损坏，无法读取",
            }], warnings, variables, style_report)

        try:
            from docx import Document

            doc = Document(BytesIO(content))
        except Exception as exc:
            return self._result(False, [{
                "code": "DOCX_INVALID",
                "message": f"DOCX 结构不合法：{exc}",
            }], warnings, variables, style_report)

        # ---- 扫描控件 ----
        scan = scan_template(content)

        # ---- 第二层：变量白名单检查 ----
        for control in scan["controls"]:
            control_type = control["type"]
            key = control["key"]

            if control_type == CONTROL_VAR:
                definition = self.registry.get(key)
                if definition is None:
                    errors.append({
                        "code": "VARIABLE_UNKNOWN",
                        "message": f"未知变量：{key}（{control['part']}）",
                    })
                elif key not in variables:
                    variables.append(key)

            elif control_type == CONTROL_SLOT:
                # body 或 role.<已知角色>（角色在注册表 SpecialVariableProvider 中定义）
                if key != "body" and self.registry.get(key) is None:
                    errors.append({
                        "code": "VARIABLE_UNKNOWN",
                        "message": f"未知插槽：{key}（{control['part']}）",
                    })

            elif control_type == CONTROL_IMAGE:
                if key not in KNOWN_IMAGE_KEYS:
                    errors.append({
                        "code": "VARIABLE_UNKNOWN",
                        "message": f"未知图片变量：{key}（{control['part']}）",
                    })
                elif key not in variables:
                    variables.append(key)

            elif control_type == CONTROL_MATERIAL:
                if not key:
                    errors.append({
                        "code": "VARIABLE_UNKNOWN",
                        "message": f"材料控件缺少用途标识（{control['part']}）",
                    })
                else:
                    material_key = f"material:{key}"
                    if material_key not in variables:
                        variables.append(material_key)

        for var in scan["raw_variables"]:
            if self.registry.get(var) is not None:
                if var not in variables:
                    variables.append(var)
            elif var.startswith(("materials.", "images.")):
                continue
            else:
                errors.append({
                    "code": "VARIABLE_UNKNOWN",
                    "message": f"未知变量：{var}（模板文本中的裸 Jinja 变量）",
                })

        # 非白名单形式的 Jinja 标签：任意表达式可造成 SSTI/RCE（F-10），
        # 一律拒绝，不再仅依赖渲染期拦截
        for tag in scan["suspicious_tags"]:
            errors.append({
                "code": "EXPRESSION_FORBIDDEN",
                "message": (
                    f"模板包含不允许的表达式：{tag[:80]}；"
                    "仅支持 {{ 变量名 }} 形式的文本变量"
                ),
            })

        # ---- 第三层：正文插槽检查（至少一个正文类插槽，同类不重复）----
        slot_keys = scan["slot_keys"]
        if not slot_keys:
            errors.append({
                "code": "BODY_SLOT_MISSING",
                "message": "模板没有设置正文插槽，请在变量面板插入「标书正文」或分册插槽",
            })
        else:
            seen = set()
            for slot_key in slot_keys:
                if slot_key in seen:
                    errors.append({
                        "code": "BODY_SLOT_DUPLICATED",
                        "message": f"插槽 {slot_key} 重复出现，每个插槽只能有一个",
                    })
                seen.add(slot_key)

        # ---- 第四层：Style 检查（warning，不阻断发布）----
        style_names = {s.name for s in doc.styles}
        for logical, fallback in LOGICAL_STYLE_FALLBACK.items():
            resolved = style_mapping.get(logical) or fallback
            exists = resolved in style_names
            style_report.append({
                "logical": logical,
                "resolved": resolved,
                "mapped": logical in style_mapping,
                "exists": exists,
            })
            if not exists:
                warnings.append({
                    "code": "STYLE_NOT_FOUND",
                    "message": (
                        f"样式 {resolved}（{logical}）在模板中不存在，"
                        f"渲染时将降级为无样式"
                    ),
                    "style": logical,
                })

        # ---- 第五层：测试渲染（变量问题全部修复后才执行）----
        if not errors:
            render_error = self._test_render(content, style_mapping, scan)
            if render_error:
                errors.append(render_error)

        return self._result(not errors, errors, warnings, variables, style_report)

    def _test_render(self, content: bytes, style_mapping: dict, scan: dict) -> Optional[dict]:
        """用注册表示例值真实渲染一次（第五层）。"""
        try:
            from docx.shared import Mm
            from docxtpl import DocxTemplate, InlineImage

            from apps.outline.services.document.word_body_renderer import (
                WordBodyRenderer,
            )

            compiled = compile_template(content)
            tpl = DocxTemplate(BytesIO(compiled))

            context = self._demo_context()
            demo_image = lambda: InlineImage(tpl, BytesIO(_DEMO_PNG), width=Mm(100))
            context["materials"] = {
                c["key"]: demo_image()
                for c in scan["controls"]
                if c["type"] == CONTROL_MATERIAL
            }
            context["images"] = {"company_logo": demo_image()}

            # 每个正文类插槽需要独立 subdoc（subdoc 只能插入一次）
            from apps.outline.services.template.template_compiler import (
                _slot_directive,
            )

            for slot_key in dict.fromkeys(scan["slot_keys"]):
                slot_subdoc = tpl.new_subdoc()
                WordBodyRenderer(style_mapping=style_mapping).render(
                    slot_subdoc, DEMO_SECTIONS, None
                )
                context[_slot_directive(slot_key)] = slot_subdoc

            render_docx(tpl, context)
            buffer = BytesIO()
            tpl.save(buffer)
            # 渲染产物必须仍是合法 docx
            from docx import Document

            Document(BytesIO(buffer.getvalue()))
            return None
        except Exception as exc:
            # 不回显底层异常消息：渲染期异常内容（含沙箱拦截信息、
            # 表达式求值结果）会成为盲注/信息外泄 oracle（F-10 附带问题）
            logger.warning("模板测试渲染失败: %s", exc, exc_info=True)
            return {
                "code": "TEST_RENDER_FAILED",
                "message": "测试渲染失败：模板表达式不合法或渲染出错（详情见服务端日志）",
            }

    def _demo_context(self) -> dict:
        """从注册表示例值构造测试渲染上下文。"""
        context: dict = {}
        for definition in self.registry.all():
            if definition.control_type != CONTROL_VAR:
                continue
            parts = definition.key.split(".")
            node = context
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = definition.example or "示例"
        return context

    @staticmethod
    def _result(valid, errors, warnings, variables, styles) -> dict:
        return {
            "valid": valid,
            "errors": errors,
            "warnings": warnings,
            "variables": sorted(variables),
            "styles": styles,
        }
