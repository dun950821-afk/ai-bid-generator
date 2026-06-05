# backend/apps/outline/tests/test_generation_result_parser.py
"""正文生成结果解析测试。"""

import pytest

from apps.outline.services.generation_result_parser import GenerationResultParser


class TestGenerationResultParser:
    """GenerationResultParser 测试。"""

    def setup_method(self):
        self.parser = GenerationResultParser()

    def test_parse_pure_json(self):
        """纯 JSON 可以解析。"""
        raw_text = '''{"content": "这是正文内容", "word_count": 100, "used_analysis_point_ids": [1, 2], "summary": "摘要"}'''
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert result["content"] == "这是正文内容"
        assert result["word_count"] == 100
        assert result["used_analysis_point_ids"] == [1, 2]
        assert result["summary"] == "摘要"

    def test_parse_json_in_markdown_block(self):
        """```json 包裹可以解析。"""
        raw_text = '''```json
{
  "content": "Markdown 正文",
  "word_count": 200,
  "used_analysis_point_ids": [1],
  "missing_info": []
}
```'''
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert result["content"] == "Markdown 正文"
        assert result["word_count"] == 200

    def test_parse_json_in_generic_block(self):
        """``` 包裹可以解析。"""
        raw_text = '''```
{
  "content": "正文",
  "word_count": 50
}
```'''
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert result["content"] == "正文"

    def test_parse_embedded_json(self):
        """正文里夹杂 JSON 可以解析。"""
        raw_text = '''这是一些文本。

{"content": "实际正文", "word_count": 100, "used_analysis_point_ids": []}

还有一些文本。'''
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert result["content"] == "实际正文"

    def test_parse_invalid_json_fallback(self):
        """非法 JSON fallback 正常。"""
        raw_text = "这不是 JSON 格式的文本"
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is False
        assert result["content"] == raw_text
        assert result["word_count"] == len(raw_text)
        assert len(result["missing_info"]) == 1
        assert result["missing_info"][0]["type"] == "json_parse_failed"
        assert "json_parse_failed" in result["risk_flags"][0]["type"]

    def test_normalize_missing_info(self):
        """missing_info 格式归一化。"""
        raw_text = '''{
            "content": "正文",
            "word_count": 100,
            "missing_info": [
                {"type": "personnel", "message": "缺少项目经理信息"},
                "缺少证书编号"
            ]
        }'''
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert len(result["missing_info"]) == 2
        assert result["missing_info"][0]["type"] == "personnel"
        assert result["missing_info"][1]["type"] == "missing"

    def test_normalize_risk_flags(self):
        """risk_flags 格式归一化。"""
        raw_text = '''{
            "content": "正文",
            "word_count": 100,
            "risk_flags": [
                {"type": "fact_check_warning", "message": "业绩信息需要核实"},
                "格式风险"
            ]
        }'''
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert len(result["risk_flags"]) == 2
        assert result["risk_flags"][0]["type"] == "fact_check_warning"
        assert result["risk_flags"][1]["type"] == "格式风险"

    def test_normalize_id_list(self):
        """ID 列表格式归一化。"""
        raw_text = '''{
            "content": "正文",
            "word_count": 100,
            "used_analysis_point_ids": [1, "2", 3, "abc"]
        }'''
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert result["used_analysis_point_ids"] == [1, 2, 3]

    def test_empty_result(self):
        """空结果处理。"""
        raw_text = '{"content": "", "word_count": 0}'
        result = self.parser.parse(raw_text)

        assert result["parse_success"] is True
        assert result["content"] == ""
        assert result["word_count"] == 0
