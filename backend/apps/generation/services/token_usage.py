# backend/apps/generation/services/token_usage.py
"""Token 使用量计算服务。"""

import re
from typing import Tuple


class TokenUsageService:
    """Token 使用量计算服务。

    提供实时 token 估算，用于预览阶段的 token 统计。
    中文按 1.5 字符/token 估算，英文按 4 字符/token 估算。
    """

    # Token 估算系数
    CHARS_PER_TOKEN_CN = 1.5  # 中文：约 1.5 字符 = 1 token
    CHARS_PER_TOKEN_EN = 4.0  # 英文：约 4 字符 = 1 token

    def estimate_tokens(self, text: str) -> int:
        """估算文本的 token 数量。

        Args:
            text: 要估算的文本

        Returns:
            估算的 token 数量
        """
        if not text:
            return 0

        # 分离中文和非中文字符
        cn_chars = self._count_chinese_chars(text)
        en_chars = len(text) - cn_chars

        # 按不同系数计算
        cn_tokens = cn_chars / self.CHARS_PER_TOKEN_CN
        en_tokens = en_chars / self.CHARS_PER_TOKEN_EN

        return int(cn_tokens + en_tokens + 0.5)

    def estimate_prompt_tokens(
        self,
        system_prompt: str,
        user_prompt: str,
        rag_context: str = "",
    ) -> Tuple[int, int, int]:
        """估算完整提示词的 token 数量。

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            rag_context: RAG 上下文（可选）

        Returns:
            (system_tokens, user_tokens, rag_tokens)
        """
        system_tokens = self.estimate_tokens(system_prompt)
        user_tokens = self.estimate_tokens(user_prompt)
        rag_tokens = self.estimate_tokens(rag_context) if rag_context else 0

        return system_tokens, user_tokens, rag_tokens

    def estimate_total_tokens(
        self,
        system_prompt: str,
        user_prompt: str,
        rag_context: str = "",
    ) -> int:
        """估算完整提示词的总 token 数量。

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            rag_context: RAG 上下文（可选）

        Returns:
            总 token 数量
        """
        system_tokens, user_tokens, rag_tokens = self.estimate_prompt_tokens(
            system_prompt, user_prompt, rag_context
        )
        return system_tokens + user_tokens + rag_tokens

    def _count_chinese_chars(self, text: str) -> int:
        """计算中文字符数量。

        Args:
            text: 输入文本

        Returns:
            中文字符数量
        """
        # CJK Unified Ideographs 范围
        cn_pattern = re.compile(r"[一-鿿]")
        return len(cn_pattern.findall(text))