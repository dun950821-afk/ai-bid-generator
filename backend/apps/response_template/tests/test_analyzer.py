"""响应模板识别服务测试(纯逻辑, 不调 LLM/DB)。"""

import re

import pytest

from apps.response_template.constants import BlockType
from apps.response_template.services.analyzer import (
    AUTO_FIELD_BINDING_RULES,
    ResponseTemplateAnalyzer,
)

analyzer = ResponseTemplateAnalyzer()

SAMPLE_MD = """# 第四部分 响应文件格式

## 附件1：响应文件

响应文件

致：XX银行

根据贵方            项目采购文件，响应人                  （响应人名称）提供相关文件并做出以下承诺：

地址：              （地址）

电话：              （电话）

响应人（法人公章）：

法定代表人（或授权代表人）签字或盖章：

日    期：      年     月     日

## 附件2：响应价格一览表【单独密封】

高危漏洞单价：____ 元/个

响应人（法人公章）：
"""


class TestSectionLocate:
    def test_locate_response_section(self):
        md, title = analyzer._locate_section(SAMPLE_MD)
        assert "响应文件格式" in title
        assert "附件1" in md
        # 截断后从章节标题开始, 章节之前的正文不应出现
        assert "第一部分" not in md


class TestAttachmentSplit:
    def test_split_attachments(self):
        blocks = analyzer._split_attachments(SAMPLE_MD)
        assert len(blocks) == 2
        assert blocks[0]["no"] == "1"
        assert "响应文件" in blocks[0]["title"]
        assert blocks[1]["no"] == "2"
        assert "单独密封" in blocks[1]["title"]
        # 附件2 内容不含附件1 的内容
        assert "附件1" not in blocks[1]["content"]


class TestNormalize:
    def test_personal_info_forced_manual(self):
        data = {
            "attachment_no": "2",
            "title": "授权委托书",
            "confidence": 0.9,
            "fields": [
                {"label": "任命：（姓名）", "type": "AUTO_FIELD", "confidence": 0.9},
                {"label": "（身份证号）", "type": "AUTO_FIELD", "confidence": 0.9},
                {"label": "法定代表人姓名", "type": "AUTO_FIELD", "confidence": 0.9},
            ],
        }
        out = analyzer._normalize(data, {"no": "2", "title": "授权委托书", "content": "本授权书申明"})
        types = {f["label"]: f["type"] for f in out["fields"]}
        assert types["任命：（姓名）"] == "MANUAL"
        assert types["（身份证号）"] == "MANUAL"
        # 法定代表人姓名是真实企业数据, 不应被误判
        assert types["法定代表人姓名"] == "AUTO_FIELD"

    def test_low_confidence_fallback(self):
        data = {
            "attachment_no": "3",
            "title": "X",
            "confidence": 0.5,
            "fields": [
                {"label": "经营范围", "type": "AUTO_FIELD", "confidence": 0.3},
            ],
        }
        out = analyzer._normalize(data, {"no": "3", "title": "X", "content": ""})
        assert out["fields"][0]["type"] == "MANUAL"

    def test_attachment_no_normalized(self):
        data = {
            "attachment_no": "附件05号",
            "title": "X",
            "confidence": 0.9,
            "fields": [],
        }
        out = analyzer._normalize(data, {"no": "5", "title": "X", "content": ""})
        assert out["attachment_no"] == "05"


class TestSignatureCompletion:
    def test_signature_added_when_missing(self):
        data = {
            "attachment_no": "1",
            "title": "响应文件",
            "confidence": 0.9,
            "fields": [
                {"label": "响应人名称", "type": "AUTO_FIELD", "confidence": 0.9},
            ],
        }
        content = "响应人（法人公章）：\n日    期：      年     月     日"
        out = analyzer._normalize(data, {"no": "1", "title": "响应文件", "content": content})
        labels = [f["label"] for f in out["fields"]]
        assert "响应人（法人公章）" in labels
        assert "日期" in labels

    def test_signature_flag(self):
        """落款(签字/盖章)块打 is_signature 标记, 供前端折叠。"""
        data = {
            "attachment_no": "1",
            "title": "响应文件",
            "confidence": 0.9,
            "fields": [
                {"label": "响应人（法人公章）", "type": "MANUAL", "confidence": 0.9},
                {"label": "法定代表人签字或盖章", "type": "MANUAL", "confidence": 0.9},
                {"label": "响应人名称", "type": "AUTO_FIELD", "confidence": 0.9},
            ],
        }
        out = analyzer._normalize(data, {"no": "1", "title": "响应文件", "content": ""})
        sig = {f["label"]: f["is_signature"] for f in out["fields"]}
        assert sig["响应人（法人公章）"] is True
        assert sig["法定代表人签字或盖章"] is True
        assert sig["响应人名称"] is False


class TestFieldDedupe:
    def test_duplicate_labels_removed(self):
        """同附件内重复 label 去重(回归: 日期块重复导致 20262026 填充)。"""
        data = {
            "attachment_no": "1",
            "title": "响应文件",
            "confidence": 0.9,
            "fields": [
                {"label": "日    期", "type": "AUTO_FIELD", "confidence": 0.9},
                {"label": "日期", "type": "AUTO_FIELD", "confidence": 0.85},
                {"label": "响应人名称", "type": "AUTO_FIELD", "confidence": 0.9},
                {"label": "响应人名称", "type": "AUTO_FIELD", "confidence": 0.8},
            ],
        }
        out = analyzer._normalize(data, {"no": "1", "title": "响应文件", "content": ""})
        keys = [re.sub(r"\s+", "", f["label"]) for f in out["fields"]]
        assert keys.count("日期") == 1
        assert keys.count("响应人名称") == 1


class TestBindingRules:
    def test_company_fields(self):
        cases = [
            ("响应人名称", "company.name"),
            ("详细地址", "company.registered_address"),
            ("地址", "company.registered_address"),
            ("电话", "company.official_phone"),
            ("邮箱", "company.official_email"),
            ("法定代表人", "company.legal_representative"),
            ("注册资本", "company.registered_capital"),
            ("经营范围", "company.business_scope"),
            ("联系人", "company.contact_person"),
        ]
        for label, expected in cases:
            binding = analyzer._build_binding({"type": "AUTO_FIELD", "label": label})
            assert binding.get("field") == expected, f"{label} → {binding}"

    def test_project_fields(self):
        binding = analyzer._build_binding({"type": "AUTO_FIELD", "label": "日期"})
        assert binding.get("field") == "project.bid_date"
        binding = analyzer._build_binding({"type": "AUTO_FIELD", "label": "年     月     日"})
        assert binding.get("field") == "project.bid_date"

    def test_data_table_uses_binding_rules(self):
        binding = analyzer._build_binding({"type": "DATA_TABLE", "label": "注册资本"})
        assert binding.get("field") == "company.registered_capital"

    def test_material_slots(self):
        binding = analyzer._build_binding({"type": "MATERIAL_SLOT", "label": "营业执照粘贴处"})
        assert binding.get("usage_key") == "business_license"
        binding = analyzer._build_binding({"type": "MATERIAL_SLOT", "label": "资格证书粘贴处"})
        assert binding.get("usage_key") == "qualification_cert"

    def test_unknown_field_no_binding(self):
        binding = analyzer._build_binding({"type": "AUTO_FIELD", "label": "其他说明"})
        assert binding == {}
