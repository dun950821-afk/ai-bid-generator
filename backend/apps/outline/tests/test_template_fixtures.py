"""模板 fixtures 校验测试（方案 §66/§67）。

fixtures 由 scripts/generate_template_fixtures.py 生成，
结构变化时重新生成即可。本测试确保 fixtures 与校验器预期一致。
"""
from pathlib import Path

from apps.outline.services.template.template_validator import TemplateValidator

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "templates"


def _load(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


class TestTemplateFixtures:
    def setup_method(self):
        self.validator = TemplateValidator()

    def test_simple_valid(self):
        result = self.validator.validate(_load("simple.docx"))
        assert result["valid"] is True, result["errors"]
        assert "project.name" in result["variables"]
        assert "company.name" in result["variables"]

    def test_cover_header_footer_valid(self):
        result = self.validator.validate(_load("cover_header_footer.docx"))
        assert result["valid"] is True, result["errors"]

    def test_multi_slot_valid(self):
        result = self.validator.validate(_load("multi_slot.docx"))
        assert result["valid"] is True, result["errors"]

    def test_material_valid(self):
        result = self.validator.validate(_load("material.docx"))
        assert result["valid"] is True, result["errors"]
        assert "material:business_license" in result["variables"]

    def test_invalid_no_body(self):
        result = self.validator.validate(_load("invalid_no_body.docx"))
        assert result["valid"] is False
        assert any(e["code"] == "BODY_SLOT_MISSING" for e in result["errors"])

    def test_invalid_variable(self):
        result = self.validator.validate(_load("invalid_variable.docx"))
        assert result["valid"] is False
        assert any(e["code"] == "VARIABLE_UNKNOWN" for e in result["errors"])
