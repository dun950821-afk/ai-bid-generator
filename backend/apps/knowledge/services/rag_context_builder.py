# backend/apps/knowledge/services/rag_context_builder.py
"""RAG 上下文组装服务。"""


class RagContextBuilder:
    """RAG 上下文组装服务。"""

    def build(
        self,
        retrieval_results: list[dict],
        max_tokens: int = 4000,
        format_type: str = "markdown",
    ) -> dict:
        """组装 RAG 上下文。

        Args:
            retrieval_results: 检索结果列表
            max_tokens: 最大 token 数
            format_type: 格式类型（markdown / text）

        Returns:
            {
                "text": str,
                "sources": list[dict],
                "token_count": int,
                "chunk_count": int,
            }
        """
        context_parts = []
        sources = []
        current_tokens = 0

        for result in retrieval_results:
            # 格式化单个来源（使用完整 content）
            if format_type == "markdown":
                part = self._format_markdown_source(result)
            else:
                part = self._format_text_source(result)

            part_tokens = len(part) // 4

            # 超长首个 chunk 截断保底
            if part_tokens > max_tokens and not context_parts:
                part = part[: max_tokens * 4]
                part_tokens = max_tokens

            # 检查 token 限制
            if current_tokens + part_tokens > max_tokens:
                break

            context_parts.append(part)
            sources.append({
                "chunk_id": result["chunk_id"],
                "document_title": result["document_title"],
                "knowledge_base_name": result["knowledge_base_name"],
                "section_path": result["section_path"],
                "page_start": result["page_start"],
                "page_end": result["page_end"],
            })
            current_tokens += part_tokens

        return {
            "text": "\n\n".join(context_parts),
            "sources": sources,
            "token_count": current_tokens,
            "chunk_count": len(sources),
        }

    def _format_markdown_source(self, result: dict) -> str:
        """Markdown 格式化来源。"""
        lines = [f"### 来源：{result['document_title']}"]

        if result.get("section_path"):
            lines.append(f"**章节**：{result['section_path']}")

        if result.get("page_start"):
            page_info = f"第 {result['page_start']}"
            if result.get("page_end") and result["page_end"] != result["page_start"]:
                page_info += f"-{result['page_end']}"
            page_info += " 页"
            lines.append(f"**页码**：{page_info}")

        lines.append("")
        # 使用完整 content，不用截断版本
        lines.append(result["content"])

        return "\n".join(lines)

    def _format_text_source(self, result: dict) -> str:
        """纯文本格式化来源。"""
        header = f"【来源：{result['document_title']}】"
        if result.get("section_path"):
            header += f" {result['section_path']}"

        return f"{header}\n{result['content']}"