"""轻量 magic bytes 校验。

v1 支持 docx/txt/md/xlsx/xls/zip 的粗粒度识别。
暂不支持 PDF 文件。
"""
from pathlib import Path

# 允许的文件扩展名（移除 pdf）
ALLOWED_EXTENSIONS = {"docx", "txt", "md", "xlsx", "xls", "zip"}

# 不支持的文件类型及提示
UNSUPPORTED_TYPES = {
    "pdf": "暂不支持 PDF，请转换为 DOCX 后上传",
    "doc": "暂不支持旧版 DOC 格式，请转换为 DOCX 后上传",
}


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def detect_kind(head: bytes) -> str:
    if head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08"):
        return "zip"
    if _looks_text(head):
        return "txt"
    return "unknown"


def _looks_text(head: bytes) -> bool:
    if not head:
        return True
    try:
        head.decode("utf-8")
        return b"\x00" not in head
    except UnicodeDecodeError:
        return False


def is_allowed_upload(filename: str, head: bytes) -> bool:
    ext = extension_of(filename)
    if ext not in ALLOWED_EXTENSIONS:
        return False

    kind = detect_kind(head)
    if ext in {"docx", "xlsx", "zip"}:
        return kind == "zip"
    if ext in {"txt", "md"}:
        return kind == "txt"
    # 老 doc/xls 是 OLE 复合文档，v1 不做深校验
    if ext in {"doc", "xls"}:
        return kind in {"unknown", "zip"}
    return False


def get_unsupported_message(filename: str) -> str | None:
    """获取不支持的文件类型提示信息。"""
    ext = extension_of(filename)
    return UNSUPPORTED_TYPES.get(ext)
