"""H4 回归：presigned_post_upload 必须把 max_size 写进 policy 的
content-length-range 条件。该条件被 SigV4 签名校验，MinIO 在收 body
时硬限制大小，是 PUT 预签名做不到的事。"""
import pytest

from apps.common.services.storage import StorageService


@pytest.mark.django_db
def test_presigned_post_upload_includes_size_range(monkeypatch):
    """直接拦截 Minio.presigned_post_policy，断言传入的 policy 对象上
    写好了 max_size 上限与目标 key。"""
    captured = {}

    def fake_form(self, policy):
        captured["lower"] = policy._lower_limit
        captured["upper"] = policy._upper_limit
        captured["eq"] = dict(policy._conditions.get("eq", {}))
        return {"policy": "stub", "x-amz-signature": "stub", "key": "stub"}

    monkeypatch.setattr("minio.Minio.presigned_post_policy", fake_form, raising=True)

    svc = StorageService()
    result = svc.presigned_post_upload(
        "projects/1/tender/1/original.pdf",
        max_size=10 * 1024 * 1024,
        content_type="application/pdf",
    )

    assert "url" in result and "fields" in result
    assert result["url"].endswith(f"/{svc.bucket}")
    assert captured["lower"] == 1
    assert captured["upper"] == 10 * 1024 * 1024
    assert captured["eq"].get("key") == "projects/1/tender/1/original.pdf"
    assert captured["eq"].get("Content-Type") == "application/pdf"


@pytest.mark.django_db
def test_presigned_post_upload_uses_public_endpoint(monkeypatch, settings):
    """POST 表单 URL 必须用浏览器可达的 PUBLIC endpoint，否则前端 POST 不到。"""
    settings.MINIO_PUBLIC_ENDPOINT = "minio.example.com:9000"
    settings.MINIO_SECURE = False

    monkeypatch.setattr(
        "minio.Minio.presigned_post_policy",
        lambda self, policy: {"policy": "p", "key": "k", "x-amz-signature": "s"},
    )

    # 重建 service 让 _presign 取到新 endpoint
    svc = StorageService()
    result = svc.presigned_post_upload("projects/1/tender/9/original.bin", max_size=1024)

    assert result["url"] == f"http://minio.example.com:9000/{svc.bucket}"


@pytest.mark.django_db
def test_presigned_post_upload_omits_content_type_eq_when_none(monkeypatch):
    """未指定 content_type 时不应硬加 eq 条件，否则浏览器在没设置
    Content-Type 的情况下 POST 会被 MinIO 拒。"""
    captured = {}

    def fake_form(self, policy):
        captured["eq"] = dict(policy._conditions.get("eq", {}))
        return {"policy": "stub", "key": "stub", "x-amz-signature": "stub"}

    monkeypatch.setattr("minio.Minio.presigned_post_policy", fake_form, raising=True)

    svc = StorageService()
    svc.presigned_post_upload("projects/1/tender/2/original.bin", max_size=1024)

    assert "Content-Type" not in captured["eq"]
    assert captured["eq"].get("key") == "projects/1/tender/2/original.bin"
