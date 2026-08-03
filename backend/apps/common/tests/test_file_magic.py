from apps.common.services import file_magic
from apps.common.services.file_magic import detect_kind, is_allowed_upload


def test_detect_pdf():
    assert detect_kind(b"%PDF-1.7\n") == "pdf"


def test_detect_docx_zip_signature():
    assert detect_kind(b"PK\x03\x04xxxx") == "zip"


def test_detect_txt_fallback():
    assert detect_kind("招标文件内容".encode()) == "txt"


def test_reject_extension_mismatch():
    assert is_allowed_upload("evil.pdf", b"not really pdf") is False


def test_allow_pdf():
    assert is_allowed_upload("招标文件.pdf", b"%PDF-1.7\n") is True


def test_allow_docx_zip_signature():
    assert is_allowed_upload("招标文件.docx", b"PK\x03\x04xxxx") is True


# ---------- OLE 容器识别与 doc 上传（Task 1 增强） ----------

OLE_HEAD = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 8
ZIP_HEAD = b"PK\x03\x04" + b"\x00" * 12


def test_detect_kind_ole():
    assert file_magic.detect_kind(OLE_HEAD) == "ole"


def test_doc_ole_allowed():
    assert file_magic.is_allowed_upload("招标文件.doc", OLE_HEAD) is True


def test_doc_non_ole_rejected():
    assert file_magic.is_allowed_upload("招标文件.doc", b"hello world") is False


def test_docx_ole_rejected():
    assert file_magic.is_allowed_upload("招标文件.docx", OLE_HEAD) is False


def test_docx_zip_still_allowed():
    assert file_magic.is_allowed_upload("招标文件.docx", ZIP_HEAD) is True


def test_unsupported_message_docx_ole():
    msg = file_magic.get_unsupported_message("招标文件.docx", OLE_HEAD)
    assert "加密" in msg


def test_unsupported_message_doc_non_ole():
    msg = file_magic.get_unsupported_message("招标文件.doc", b"hello world")
    assert msg is not None
