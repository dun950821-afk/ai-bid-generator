"""轻量 magic bytes 校验。

v1 支持 docx/txt/md/xlsx/xls/zip 的粗粒度识别。
PDF 在 T5 接入后支持。
"""
from pathlib import Path

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {"docx", "txt", "md", "xlsx", "xls", "zip", "pdf"}

# 不支持的文件类型及提示
UNSUPPORTED_TYPES = {
    "doc": "暂不支持旧版 DOC 格式，请转换为 DOCX 后上传",
}


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def detect_kind(head: bytes) -> str:
    if head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08"):
        return "zip"
    if head.startswith(b"%PDF"):
        return "pdf"
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
