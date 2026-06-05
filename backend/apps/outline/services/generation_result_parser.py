# backend/apps/outline/services/generation_result_parser.py
"""正文生成结果解析服务。"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


class GenerationResultParser:
    """正文生成结果解析服务。

    解析 LLM 输出的 JSON，处理各种格式问题。
    """

    def parse(self, raw_text: str) -> dict[str, Any]:
        """解析正文生成结果。

        Args:
            raw_text: LLM 原始输出文本

        Returns:
            解析后的结果字典，包含：
            - content: 正文内容
            - word_count: 字数
            - used_analysis_point_ids: 使用的分析点 ID
            - used_rag_material_ids: 使用的 RAG 素材 ID
            - missing_info: 缺失信息
            - risk_flags: 风险标记
            - summary: 章节摘要
            - parse_success: 是否解析成功
        """
        text = raw_text.strip()

        # 尝试提取 JSON
        json_text = self._extract_json(text)

        if not json_text:
            return self._fallback_result(raw_text)

        try:
            data = json.loads(json_text)
            return self._normalize_result(data)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON decode failed: {e}")
            return self._fallback_result(raw_text)

    def _extract_json(self, text: str) -> str | None:
        """从文本中提取 JSON。

        处理以下情况：
        1. 纯 JSON
        2. ```json ... ``` 包裹
        3. ``` ... ``` 包裹
        4. 混合文本中的 JSON 对象
        """
        # 情况 1: 纯 JSON（以 { 开头）
        if text.startswith("{"):
            # 找到匹配的 }
            try:
                # 尝试直接解析
                json.loads(text)
                return text
            except json.JSONDecodeError:
                pass

        # 情况 2: ```json ... ``` 包裹
        json_block_match = re.search(
            r"```json\s*\n([\s\S]*?)\n```", text, re.IGNORECASE
        )
        if json_block_match:
            return json_block_match.group(1).strip()

        # 情况 3: ``` ... ``` 包裹（无 json 标记）
        code_block_match = re.search(r"```\s*\n([\s\S]*?)\n```", text)
        if code_block_match:
            content = code_block_match.group(1).strip()
            if content.startswith("{"):
                return content

        # 情况 4: 查找第一个 { } 对
        brace_start = text.find("{")
        if brace_start != -1:
            # 找到匹配的 }
            depth = 0
            for i, char in enumerate(text[brace_start:], brace_start):
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        return text[brace_start : i + 1]

        return None

    def _normalize_result(self, data: dict) -> dict[str, Any]:
        """标准化结果。"""
        content = data.get("content", "")

        return {
            "content": content,
            "word_count": data.get("word_count") or len(content),
            "used_analysis_point_ids": self._normalize_id_list(
                data.get("used_analysis_point_ids", [])
            ),
            "used_rag_material_ids": self._normalize_id_list(
                data.get("used_rag_material_ids", [])
            ),
            "missing_info": self._normalize_missing_info(data.get("missing_info", [])),
            "risk_flags": self._normalize_risk_flags(data.get("risk_flags", [])),
            "summary": data.get("summary", ""),
            "parse_success": True,
        }

    def _normalize_id_list(self, ids: Any) -> list[int]:
        """标准化 ID 列表。"""
        if not ids:
            return []
        if isinstance(ids, list):
            result = []
            for item in ids:
                if isinstance(item, int):
                    result.append(item)
                elif isinstance(item, str) and item.isdigit():
                    result.append(int(item))
            return result
        return []

    def _normalize_missing_info(self, items: Any) -> list[dict]:
        """标准化缺失信息。"""
        if not items:
            return []
        if isinstance(items, list):
            result = []
            for item in items:
                if isinstance(item, dict):
                    result.append({
                        "type": item.get("type", "unknown"),
                        "message": item.get("message", str(item)),
                    })
                elif isinstance(item, str):
                    result.append({
                        "type": "missing",
                        "message": item,
                    })
            return result
        return []

    def _normalize_risk_flags(self, items: Any) -> list[dict]:
        """标准化风险标记。"""
        if not items:
            return []
        if isinstance(items, list):
            result = []
            for item in items:
                if isinstance(item, dict):
                    result.append({
                        "type": item.get("type", "unknown"),
                        "message": item.get("message", str(item)),
                    })
                elif isinstance(item, str):
                    result.append({
                        "type": item,
                        "message": f"检测到风险：{item}",
                    })
            return result
        return []

    def _fallback_result(self, raw_text: str) -> dict[str, Any]:
        """解析失败时的兜底结果。"""
        return {
            "content": raw_text,
            "word_count": len(raw_text),
            "used_analysis_point_ids": [],
            "used_rag_material_ids": [],
            "missing_info": [
                {
                    "type": "json_parse_failed",
                    "message": "模型未按 JSON 格式输出，已将原文作为正文保存。",
                }
            ],
            "risk_flags": [
                {
                    "type": "json_parse_failed",
                    "message": "输出格式异常，请检查正文质量。",
                }
            ],
            "summary": "",
            "parse_success": False,
        }
