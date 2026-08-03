"""轻量 magic bytes 校验。

v1 支持 docx/txt/md/xlsx/xls/zip 的粗粒度识别。
PDF 在 T5 接入后支持。
"""
from pathlib import Path

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {"docx", "txt", "md", "xlsx", "xls", "zip", "pdf", "doc"}

# OLE 复合文档魔数（旧版 doc/xls/ppt、加密 OOXML 均为此容器）
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

# 不支持的文件类型及提示
UNSUPPORTED_TYPES = {
    "docx_ole": "该文件疑似为加密的 DOCX 或旧版格式，请用 Word/WPS 另存为普通 DOCX 后上传",
    "doc_mismatch": "文件内容与扩展名不符，请检查文件是否损坏",
}


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def detect_kind(head: bytes) -> str:
    if head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08"):
        return "zip"
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(OLE_SIGNATURE):
        return "ole"
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
    if ext == "pdf":
        return kind == "pdf"
    if ext == "doc":
        return kind == "ole"
    if ext in {"txt", "md"}:
        return kind == "txt"
    return False


def get_unsupported_message(filename: str, head: bytes) -> str | None:
    """获取不支持的文件类型提示信息。"""
    ext = extension_of(filename)
    kind = detect_kind(head)
    if ext == "docx" and kind == "ole":
        return UNSUPPORTED_TYPES["docx_ole"]
    if ext == "doc" and kind != "ole":
        return UNSUPPORTED_TYPES["doc_mismatch"]
    return UNSUPPORTED_TYPES.get(ext)


# ---------- 编辑器图片 magic bytes ----------

# 图片类型 → (magic bytes 前缀, content_type) 映射
# 前缀匹配：head[:len(prefix)] == prefix
IMAGE_SIGNATURES = {
    "png": (b"\x89PNG\r\n\x1a\n", "image/png"),
    "jpeg": (b"\xff\xd8\xff", "image/jpeg"),
    "webp": (b"RIFF", "image/webp"),  # RIFF....WEBP，先匹配 RIFF，再在头里查 WEBP
}


def detect_image_kind(head: bytes) -> str | None:
    """识别图片真实类型（基于 magic bytes）。

    Returns:
        'png' / 'jpeg' / 'webp' / None
    """
    if not head:
        return None
    if head.startswith(IMAGE_SIGNATURES["png"][0]):
        return "png"
    if head.startswith(IMAGE_SIGNATURES["jpeg"][0]):
        return "jpeg"
    # WebP: RIFF....WEBP
    if head.startswith(b"RIFF") and len(head) >= 12 and head[8:12] == b"WEBP":
        return "webp"
    return None


def is_allowed_image_upload(head: bytes) -> str | None:
    """校验图片 magic bytes，返回允许的 kind 或 None。

    Returns:
        'png' / 'jpeg' / 'webp' / None（None 表示不允许）
    """
    return detect_image_kind(head)
