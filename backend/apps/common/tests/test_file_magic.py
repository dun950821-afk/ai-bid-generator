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
