from apps.common.services.storage import StorageService


def test_build_object_key_is_stable_without_lot():
    key = StorageService.build_tender_object_key(
        project_id=1,
        lot_id=None,
        file_id=10,
        original_name="招标文件.PDF",
    )
    assert key == "projects/1/tender/10/original.pdf"


def test_build_object_key_supports_lot():
    key = StorageService.build_tender_object_key(
        project_id=1,
        lot_id=2,
        file_id=10,
        original_name="招标文件.docx",
    )
    assert key == "projects/1/lots/2/tender/10/original.docx"


def test_safe_extension_defaults_to_bin():
    key = StorageService.build_tender_object_key(
        project_id=1,
        lot_id=None,
        file_id=10,
        original_name="no-extension",
    )
    assert key.endswith("/original.bin")
