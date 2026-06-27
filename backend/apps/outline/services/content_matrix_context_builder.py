# backend/apps/outline/services/content_matrix_context_builder.py
"""矩阵生成公司上下文块构建器。

渲染公司能力边界文本块，注入矩阵生成 prompt。
空数据返回空字符串（不破坏旧模板兼容）。
"""


def build_company_context_block(metadata_snapshot: dict) -> str:
    """渲染公司能力边界文本块。"""
    if not metadata_snapshot:
        return ""
    if not metadata_snapshot.get("has_kb_bindings") and not metadata_snapshot.get("has_material_package"):
        return ""

    parts = ["【公司能力边界】"]

    company = metadata_snapshot.get("company_snapshot", {})
    if company:
        company_lines = []
        if company.get("name"):
            company_lines.append(f"公司名称：{company['name']}")
        if company.get("unified_social_credit_code"):
            company_lines.append(f"统一社会信用代码：{company['unified_social_credit_code']}")
        if company.get("legal_representative"):
            company_lines.append(f"法定代表人：{company['legal_representative']}")
        if company.get("registered_capital"):
            company_lines.append(f"注册资本：{company['registered_capital']}")
        if company_lines:
            parts.append("\n".join(company_lines))

    kbs = metadata_snapshot.get("available_knowledge_bases", [])
    if kbs:
        kb_lines = [
            f"- {kb['kb_name']}（{kb.get('document_count', 0)} 文档，通道：{kb.get('rag_channel', '未知')}）"
            for kb in kbs
        ]
        parts.append("可用知识库：\n" + "\n".join(kb_lines))

    docs = metadata_snapshot.get("available_document_titles", [])
    if docs:
        doc_lines = [f"- {d['file_name']}" for d in docs]
        truncated = metadata_snapshot.get("document_title_truncated", False)
        header = "可参考文档标题"
        if truncated:
            total = metadata_snapshot.get("document_title_total_count", len(docs))
            included = metadata_snapshot.get("document_title_included_count", len(docs))
            header += f"（共 {total} 个，已截取前 {included} 个）"
        parts.append(f"{header}：\n" + "\n".join(doc_lines))

    missing = metadata_snapshot.get("missing_materials", [])
    if missing:
        missing_lines = [
            f"- {m.get('description', m.get('usage_key', ''))}（{'必需' if m.get('required') else '可选'}）"
            for m in missing
        ]
        parts.append("材料包缺失项（风险提示，不得编造）：\n" + "\n".join(missing_lines))

    return "\n\n".join(parts)
