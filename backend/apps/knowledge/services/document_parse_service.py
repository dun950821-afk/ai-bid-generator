# backend/apps/knowledge/services/document_parse_service.py
"""知识文档解析服务。"""

from apps.common.services.storage import StorageService
from apps.knowledge.constants import ParseStatus, ChunkStatus
from apps.knowledge.models import KnowledgeDocument


class DocumentParseService:
    """知识文档解析服务（复用 tender 解析能力）。"""

    def parse(self, document: KnowledgeDocument) -> None:
        """解析知识文档。

        Args:
            document: 文档实例

        Raises:
            ValueError: 文档尚未准备好解析
        """
        if document.parse_status != ParseStatus.PENDING:
            return

        document.parse_status = ParseStatus.PARSING
        document.save()

        try:
            storage = StorageService()

            # 读取文件内容
            file_content = storage.get_object(document.file_uri)

            # 根据文件类型调用解析
            if document.mime_type == "application/pdf":
                result = self._parse_pdf(file_content, document.file_name)
            elif document.mime_type in [
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ]:
                result = self._parse_word(file_content, document.file_name)
            else:
                # 纯文本/Markdown
                result = self._parse_text(file_content)

            # 保存解析结果
            parsed_uri = f"knowledge/{document.knowledge_base.id}/{document.id}/parsed.md"
            storage.put_object(parsed_uri, result["markdown"].encode("utf-8"))

            document.parsed_uri = parsed_uri
            document.parser_version = result.get("parser_version", "v1")
            document.metadata["page_count"] = result.get("page_count", 0)
            document.metadata["parse_engine"] = result.get("parse_engine", "builtin")

            document.parse_status = ParseStatus.PARSED
            document.chunk_status = ChunkStatus.PENDING
            document.save()

        except Exception as e:
            document.parse_status = ParseStatus.FAILED
            document.error_message = str(e)[:2000]
            document.save()
            raise

    def _parse_pdf(self, content: bytes, file_name: str) -> dict:
        """解析 PDF（复用 tender ParseService）。"""
        # P0 简化实现：返回占位文本
        # P1 可接入真实 PDF 解析
        return {
            "markdown": f"# {file_name}\n\nPDF 内容待解析...",
            "page_count": 1,
            "parse_engine": "placeholder",
            "parser_version": "v1",
        }

    def _parse_word(self, content: bytes, file_name: str) -> dict:
        """解析 Word（复用 tender ParseService）。"""
        # P0 简化实现
        return {
            "markdown": f"# {file_name}\n\nWord 内容待解析...",
            "page_count": 1,
            "parse_engine": "placeholder",
            "parser_version": "v1",
        }

    def _parse_text(self, content: bytes) -> dict:
        """解析纯文本/Markdown 文件。"""
        # 处理编码异常
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("gbk", errors="ignore")

        return {
            "markdown": text,
            "page_count": 1,
            "parse_engine": "text",
            "parser_version": "v1",
        }