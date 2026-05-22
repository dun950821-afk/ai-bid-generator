"""轻量 magic bytes 校验。

v1 支持 docx/pdf/txt/xlsx/xls/zip 的粗粒度识别。docx/xlsx 本质为 zip，
更细粒度校验留到后续文档解析阶段；此处只防止明显伪造扩展名。
"""
from pathlib import Path

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt", "xlsx", "xls", "zip"}


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def detect_kind(head: bytes) -> str:
    if head.startswith(b"%PDF"):
        return "pdf"
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
    if ext == "pdf":
        return kind == "pdf"
    if ext in {"docx", "xlsx", "zip"}:
        return kind == "zip"
    if ext == "txt":
        return kind == "txt"
    # 老 doc/xls 是 OLE 复合文档，v1 不做深校验，解析阶段再处理。
    if ext in {"doc", "xls"}:
        return kind in {"unknown", "zip"}
    return False
