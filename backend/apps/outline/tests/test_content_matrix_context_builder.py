# backend/apps/outline/tests/test_content_matrix_context_builder.py
"""content_matrix_context_builder 测试。"""

from apps.outline.services.content_matrix_context_builder import build_company_context_block


class TestBuildCompanyContextBlock:
    """build_company_context_block 测试。"""

    def test_empty_snapshot_returns_empty(self):
        assert build_company_context_block({}) == ""

    def test_no_kb_bindings_returns_empty(self):
        result = build_company_context_block({
            "has_kb_bindings": False, "has_material_package": False
        })
        assert result == ""

    def test_renders_company_info(self):
        snapshot = {
            "has_kb_bindings": True,
            "has_material_package": True,
            "company_snapshot": {
                "name": "XX科技有限公司",
                "unified_social_credit_code": "91XXX",
                "legal_representative": "张三",
            },
            "available_knowledge_bases": [
                {"kb_name": "公司介绍库", "rag_channel": "company_info", "document_count": 12},
            ],
            "available_document_titles": [
                {"file_name": "公司简介2025.pdf"},
            ],
            "missing_materials": [],
        }
        result = build_company_context_block(snapshot)
        assert "XX科技有限公司" in result
        assert "公司介绍库" in result
        assert "公司简介2025.pdf" in result
        assert "【公司能力边界】" in result
