# backend/apps/outline/tests/test_section_prompt_variables.py
"""正文生成提示词变量构建器测试。

回归目标：knowledge_contents 不再硬编码为空，公司信息与材料规则
（company_info / material_notes）真正进入模板变量。
"""

import pytest
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.outline.services.section_prompt_variables import (
    RAG_MAX_CHARS_PER_ITEM,
    RAG_MAX_ITEMS,
    build_company_info,
    build_knowledge_contents,
    build_material_notes,
    build_section_variables,
)
from apps.projects.models import Lot, Project

User = get_user_model()


def _rag_materials(count=2, content="某段检索正文"):
    return {
        "company_info": [
            {
                "chunk_id": i + 1,
                "document_id": 10 + i,
                "title": f"文档{i + 1}.pdf",
                "channel": "company_info",
                "score": 0.9 - i * 0.1,
                "rank": i + 1,
                "content": content,
            }
            for i in range(count)
        ]
    }


def _company_context(available=True):
    if not available:
        return {"available": False, "reason": "材料包未创建"}
    return {
        "available": True,
        "company": {
            "name": "北京测试科技有限公司",
            "unified_social_credit_code": "91110000XXXX00000X",
            "legal_representative": "张三",
        },
        "available_materials": [
            {
                "usage_key": "business_license",
                "title": "营业执照",
                "available": True,
                "certificate_no": "ABC123",
                "valid_to": "2040-08-05",
                "insert_mode": "image_attachment",
            }
        ],
        "missing_materials": [
            {"usage_key": "iso_certificate", "description": "体系认证证书"}
        ],
    }


class TestBuildKnowledgeContents:
    def test_formats_channel_and_title(self):
        items = build_knowledge_contents(_rag_materials())
        assert len(items) == 2
        assert items[0].startswith("【公司信息】文档1.pdf")
        assert "某段检索正文" in items[0]

    def test_respects_item_budget(self):
        items = build_knowledge_contents(_rag_materials(count=RAG_MAX_ITEMS + 5))
        assert len(items) == RAG_MAX_ITEMS

    def test_truncates_long_content(self):
        items = build_knowledge_contents(
            _rag_materials(count=1, content="x" * (RAG_MAX_CHARS_PER_ITEM + 500))
        )
        assert len(items) == 1
        assert "x" * (RAG_MAX_CHARS_PER_ITEM + 1) not in items[0]

    def test_empty_input(self):
        assert build_knowledge_contents({}) == []
        assert build_knowledge_contents({"company_info": []}) == []


class TestBuildCompanyInfo:
    def test_includes_company_fields(self):
        text = build_company_info(_company_context())
        assert "公司名称：北京测试科技有限公司" in text
        assert "统一社会信用代码：91110000XXXX00000X" in text
        assert "法定代表人：张三" in text

    def test_empty_without_package(self):
        assert build_company_info(_company_context(available=False)) == ""
        assert build_company_info({}) == ""


class TestBuildMaterialNotes:
    def test_includes_materials_and_placeholder_rule(self):
        text = build_material_notes(_company_context())
        assert "营业执照 [可用]" in text
        assert "证书编号：ABC123" in text
        # 占位符字面量必须原样保留（双花括号）
        assert "{{ material:business_license }}" in text
        assert "体系认证证书（缺失）" in text
        assert "不要编造公司名称" in text

    def test_empty_without_package(self):
        assert build_material_notes(_company_context(available=False)) == ""
        assert build_material_notes({}) == ""


@pytest.mark.django_db
class TestBuildSectionVariables:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="公司能力说明", level=1, sort_order=1
        )

    def _prepared(self, rag_materials=None, company_context=None):
        return {
            "section_info": {"section_number": "1", "title": "公司能力说明", "level": 1},
            "content_matrix": {},
            "analysis_points": {},
            "rag_materials": rag_materials or {},
            "context_sections": {},
            "outline_structure": "",
            "project_info": {"project_name": "P", "lot_name": "L"},
            "company_context": company_context or {},
            "generation_mode": "leaf_content",
            "content_structure_policy": "plain_paragraphs",
            "prompt_context": "",
        }

    def test_variables_include_rag_and_company(self):
        variables = build_section_variables(
            self.section,
            self._prepared(
                rag_materials=_rag_materials(),
                company_context=_company_context(),
            ),
            user_prompt="",
        )
        assert variables["knowledge_contents"], "knowledge_contents 不应为空"
        assert "某段检索正文" in variables["knowledge_contents"][0]
        assert "北京测试科技有限公司" in variables["company_info"]
        assert "{{ material:business_license }}" in variables["material_notes"]

    def test_variables_degrade_gracefully(self):
        variables = build_section_variables(
            self.section, self._prepared(), user_prompt="",
        )
        assert variables["knowledge_contents"] == []
        assert variables["company_info"] == ""
        assert variables["material_notes"] == ""
        # 基础变量齐全
        assert variables["current_section"]["title"] == "公司能力说明"
        assert "table_allowed_instruction" in variables
