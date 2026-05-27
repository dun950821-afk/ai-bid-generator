# backend/apps/generation/services/schema_validator.py
"""输出 JSON Schema 校验服务。"""

import json
import re

try:
    from jsonschema import validate, ValidationError, Draft7Validator
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False
    ValidationError = Exception


class OutputSchemaValidator:
    """输出 JSON Schema 校验服务。

    校验 LLM 输出是否符合提示词版本定义的 output_schema。
    """

    def validate(self, output_text: str, output_schema: dict | None) -> dict:
        """校验输出文本是否符合 JSON Schema。

        Args:
            output_text: LLM 输出的原始文本
            output_schema: 提示词版本定义的 JSON Schema（可为空）

        Returns:
            {
                "parsed_json": dict | None,
                "schema_valid": bool,
                "schema_errors": list[str],
            }
        """
        result = {
            "parsed_json": None,
            "schema_valid": True,
            "schema_errors": [],
        }

        if not output_schema:
            # 无 schema 定义，无需校验
            result["parsed_json"] = self._extract_json(output_text)
            return result

        # 尝试解析 JSON
        parsed_json = self._extract_json(output_text)
        if parsed_json is None:
            result["schema_valid"] = False
            result["schema_errors"] = ["输出不是有效的 JSON 格式"]
            return result

        result["parsed_json"] = parsed_json

        # 校验 Schema
        if HAS_JSONSCHEMA:
            try:
                validate(parsed_json, output_schema)
            except ValidationError as e:
                result["schema_valid"] = False
                result["schema_errors"] = [e.message]
        else:
            # 无 jsonschema 库，跳过 schema 校验
            result["schema_valid"] = True

        return result

    def _extract_json(self, text: str) -> dict | None:
        """从文本中提取 JSON。

        支持以下格式：
        - 纯 JSON 对象/数组
        - Markdown code block 包裹的 JSON
        - 前后有其他文本的 JSON

        Args:
            text: 输出文本

        Returns:
            解析后的 dict 或 None
        """
        if not text:
            return None

        text = text.strip()

        # 尝试直接解析
        if text.startswith("{") or text.startswith("["):
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass

        # 尝试从 markdown code block 提取
        code_block_pattern = r"```(?:json)?\s*\n?(.*?)\n?```"
        matches = re.findall(code_block_pattern, text, re.DOTALL)
        for match in matches:
            try:
                return json.loads(match.strip())
            except json.JSONDecodeError:
                continue

        # 尝试在文本中查找 JSON 结构
        json_pattern = r"\{[\s\S]*\}"
        matches = re.findall(json_pattern, text)
        for match in matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue

        return None