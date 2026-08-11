# backend/apps/outline/services/template/template_render_service.py
"""模板渲染服务（方案 §28/§48）：标书导出的统一入口。

流程：
    读取发布版本文件 → 编译（按 file_hash 缓存）→ 正文 subdoc
    → ContextBuilder 装配变量 → 材料/图片 InlineImage
    → docxtpl.render(autoescape=True) → 输出校验 → MinIO → BidDocument（快照）

Renderer 不直接查业务库：文本变量来自 TemplateContextBuilder，
材料经材料包 get_material_by_usage_key 解析（方案 §26/§27）。

签名只接收纯对象/ID，job-compatible，后续可直接挪到 Celery
export_queue（方案 §56）。
"""

import logging
import time
from io import BytesIO
from typing import List, Optional, Tuple

from django.core.cache import cache
from django.utils import timezone

from apps.common.services.storage import StorageService
from apps.outline.models import (
    BidDocument,
    BidWordTemplate,
    BidWordTemplateVersion,
    Outline,
    Section,
)
from apps.outline.services.document.word_body_renderer import WordBodyRenderer
from apps.outline.services.template.template_compiler import (
    compile_template,
    scan_template,
)
from apps.outline.services.template.template_context_builder import (
    TemplateContextBuilder,
)

logger = logging.getLogger(__name__)

COMPILE_CACHE_PREFIX = "tpl-compiled:"
COMPILE_CACHE_TTL = 24 * 3600


class TemplateRenderError(Exception):
    """渲染失败，携带稳定错误码（方案 §57）。"""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _get_compiled(content: bytes, file_hash: str) -> bytes:
    """编译模板，按 file_hash 缓存编译产物（方案 §55）。"""
    cache_key = f"{COMPILE_CACHE_PREFIX}{file_hash}"
    compiled = cache.get(cache_key)
    if compiled is not None:
        return compiled
    try:
        compiled = compile_template(content)
    except Exception as exc:
        raise TemplateRenderError(
            "TEMPLATE_COMPILE_FAILED", f"模板编译失败：{exc}"
        ) from exc
    cache.set(cache_key, compiled, timeout=COMPILE_CACHE_TTL)
    return compiled


def _build_warnings(sections: List[Section]) -> List[dict]:
    sections_with_content = [s for s in sections if s.content and s.content.strip()]
    if not sections_with_content:
        return [{
            "type": "no_content",
            "message": "没有任何章节包含内容，生成的文档将为空",
        }]
    empty_sections = [s for s in sections if not s.content or not s.content.strip()]
    if empty_sections:
        titles = [s.title[:30] for s in empty_sections[:5]]
        return [{
            "type": "partial_content",
            "message": f"部分章节内容为空：{', '.join(titles)}{'等' if len(empty_sections) > 5 else ''}",
        }]
    return []


def _resolve_material_images(tpl, material_package, usage_keys) -> dict:
    """把模板里的 bid.material:<key> 解析为 docxtpl InlineImage。

    材料缺失或文件不可读时降级为提示文字，不中断生成。
    """
    from docxtpl import InlineImage
    from docx.shared import Mm

    materials = {}
    storage = StorageService()
    for usage_key in usage_keys:
        value = f"【缺少材料：{usage_key}】"
        if material_package is not None:
            material = material_package.get_material_by_usage_key(usage_key)
            if material is not None and material.object_key:
                try:
                    data = storage.get_object(material.object_key)
                    value = InlineImage(tpl, BytesIO(data), width=Mm(150))
                except Exception as exc:
                    logger.warning(
                        f"Material image resolve failed: {usage_key}, {exc}"
                    )
                    value = f"【材料图片插入失败：{usage_key}】"
        materials[usage_key] = value
    return materials


def _resolve_logo_bytes(material_package) -> Optional[bytes]:
    """企业 Logo 原始字节：取材料包中 usage_key=company_logo 的材料。"""
    if material_package is None:
        return None
    material = material_package.get_material_by_usage_key("company_logo")
    if material is None or not material.object_key:
        return None
    try:
        return StorageService().get_object(material.object_key)
    except Exception as exc:
        logger.warning(f"Company logo resolve failed: {exc}")
        return None


def _resolve_images(tpl, material_package) -> dict:
    """图片变量（company.logo）：正文用 InlineImage，页眉走后处理替换。"""
    from docxtpl import InlineImage
    from docx.shared import Mm

    logo_bytes = _resolve_logo_bytes(material_package)
    logo = InlineImage(tpl, BytesIO(logo_bytes), width=Mm(40)) if logo_bytes else ""
    return {"company_logo": logo}


def _filter_sections_by_role(sections: List[Section], role: str) -> List[Section]:
    """筛选指定 section_role 的顶级章节及其全部子孙（多册拆分）。

    角色取自顶级章节的 content_matrix.section_role，子章节随父 subtree
    整体归入该册。
    """
    by_parent: dict = {}
    for s in sections:
        by_parent.setdefault(s.parent_id, []).append(s)

    included: set = set()

    def collect(section):
        included.add(section.id)
        for child in by_parent.get(section.id, []):
            collect(child)

    for top in by_parent.get(None, []):
        if (top.content_matrix or {}).get("section_role", "") == role:
            collect(top)

    return [s for s in sections if s.id in included]


def render_bid_document(
    *,
    template: BidWordTemplate,
    version: BidWordTemplateVersion,
    outline: Outline,
    user=None,
) -> Tuple[BidDocument, List[dict]]:
    """用指定模板版本渲染标书并落库为 BidDocument。

    Raises:
        TemplateRenderError: 各阶段失败（code 见方案 §57）
    """
    storage = StorageService()

    # 1. 读取模板版本文件
    content = storage.get_object(version.object_key)

    # 2. 编译（缓存）
    compiled = _get_compiled(content, version.file_hash)

    # 3. 构造 docxtpl
    from docxtpl import DocxTemplate

    tpl = DocxTemplate(BytesIO(compiled))

    # 4. 正文插槽渲染（body=全部章节；role.*=按责任矩阵角色过滤的分册）
    sections = list(
        Section.objects.filter(outline=outline).order_by("sort_order", "id")
    )
    warnings = _build_warnings(sections)

    material_package = getattr(outline, "material_package", None)
    scan = scan_template(content)
    slot_keys = list(dict.fromkeys(scan["slot_keys"]))

    from apps.outline.services.template.template_compiler import _slot_directive

    def render_slot_subdoc(slot_key: str):
        subdoc = tpl.new_subdoc()
        slot_sections = (
            sections
            if slot_key == "body"
            else _filter_sections_by_role(sections, slot_key.split(".", 1)[1])
        )
        try:
            WordBodyRenderer(style_mapping=version.style_mapping).render(
                subdoc, slot_sections, material_package
            )
        except Exception as exc:
            raise TemplateRenderError(
                "BODY_RENDER_FAILED", f"正文渲染失败（插槽 {slot_key}）：{exc}"
            ) from exc
        return subdoc

    slot_subdocs = {key: render_slot_subdoc(key) for key in slot_keys}

    # 5. 文本变量上下文（Renderer 不查库，统一从 ContextBuilder 取）
    latest = outline.bid_documents.order_by("-version").first()
    doc_version = (latest.version + 1) if latest else 1
    filename = f"{outline.name}_v{doc_version}.docx"

    context = TemplateContextBuilder().build(
        outline=outline,
        user=user,
        document_title=filename,
        document_version=doc_version,
    )
    for slot_key, subdoc in slot_subdocs.items():
        context[_slot_directive(slot_key)] = subdoc

    # 6. 材料 / 图片变量（按模板实际使用解析）
    material_keys = [c["key"] for c in scan["controls"] if c["type"] == "material"]
    context["materials"] = _resolve_material_images(
        tpl, material_package, set(material_keys)
    )
    context["images"] = _resolve_images(tpl, material_package)

    # 7. 渲染（autoescape 强制开启，方案 §29）
    try:
        tpl.render(context, autoescape=True)
    except Exception as exc:
        raise TemplateRenderError(
            "DOCX_RENDER_FAILED", f"模板渲染失败：{exc}"
        ) from exc

    buffer = BytesIO()
    tpl.save(buffer)
    output = buffer.getvalue()

    # 7.5 页眉/页脚动态图片替换（方案 §32：模板预置带标记的占位图）
    logo_bytes = _resolve_logo_bytes(material_package)
    if logo_bytes:
        from apps.outline.services.document.word_post_processor import (
            replace_tagged_images,
        )

        output = replace_tagged_images(
            output, {"bid.image:company.logo": logo_bytes}
        )

    # 8. 输出校验
    try:
        from docx import Document

        Document(BytesIO(output))
    except Exception as exc:
        raise TemplateRenderError(
            "OUTPUT_DOCX_INVALID", f"渲染产物不是合法 DOCX：{exc}"
        ) from exc

    # 9. 落库 BidDocument（含模板快照，方案 §49）
    document = BidDocument(
        outline=outline,
        title=filename,
        version=doc_version,
        file_key=f"outline-{outline.id}-v{doc_version}-{int(time.time() * 1000)}",
        status="draft",
        created_by=user if user and user.is_authenticated else None,
        template=template,
        template_version=version,
        template_file_hash=version.file_hash,
        render_context_snapshot=TemplateContextBuilder.to_snapshot(context)
        | {"_generated_at": timezone.now().isoformat()},
    )
    document.save_file(output, filename)
    document.save()

    # 10. 模板使用计数
    BidWordTemplate.objects.filter(pk=template.pk).update(
        usage_count=template.usage_count + 1
    )

    logger.info(
        f"Rendered bid document: outline_id={outline.id}, "
        f"template_id={template.id}, version_no={version.version_no}, "
        f"document_id={document.id}"
    )
    return document, warnings
