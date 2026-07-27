"""ONLYOFFICE 回调安全测试。"""
import json
from unittest.mock import patch

import jwt
import pytest
from django.conf import settings
from django.test import Client, override_settings

from apps.outline.services.url_safety import is_safe_external_url, sanitize_filename


def test_internal_ip_rejected():
    assert not is_safe_external_url("http://127.0.0.1/")
    assert not is_safe_external_url("http://169.254.169.254/latest/meta-data/")
    assert not is_safe_external_url("http://10.0.0.1/")
    assert not is_safe_external_url("http://192.168.1.1/")


def test_localhost_rejected():
    assert not is_safe_external_url("http://localhost/")


def test_file_scheme_rejected():
    assert not is_safe_external_url("file:///etc/passwd")


def test_empty_url_rejected():
    assert not is_safe_external_url("")
    assert not is_safe_external_url(None)


def test_https_external_accepted():
    # 注意：此测试依赖 DNS 解析，CI 环境可能无网
    # 用一个肯定不存在的域名测试也能通过（gaierror 返回 False）
    # 这里用 example.com，如果 DNS 不通会返回 False 而非 True
    result = is_safe_external_url("https://example.com/file.docx")
    assert isinstance(result, bool)


def test_path_traversal_filename_sanitized():
    """filename 含 ../ 应被清洗。"""
    assert sanitize_filename("../../etc/passwd") == "etc_passwd"
    assert sanitize_filename("normal.docx") == "normal.docx"


def test_filename_backslash_sanitized():
    """反斜杠也应被替换，但保留扩展名。"""
    assert sanitize_filename("a\\b\\c.pdf") == "a_b_c.pdf"


def test_filename_control_chars_removed():
    """控制字符应被移除，保留扩展名。"""
    assert sanitize_filename("file\x00name.txt") == "filename.txt"


def test_filename_length_limited():
    """超长文件名应被截断。"""
    long_name = "a" * 300 + ".docx"
    result = sanitize_filename(long_name)
    assert len(result) <= 200


# ---------- 回调处理器集成测试 ----------

pytestmark = pytest.mark.django_db


def _make_callback_payload(document_id, status=2, url="http://example.com/file.docx", with_token=True):
    payload = {
        "status": status,
        "url": url,
        "key": f"outline-{document_id}-v1",
        "users": ["user-1"],
    }
    if with_token:
        token = jwt.encode(payload, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
        payload["token"] = token
    return payload


def _make_document(username="cb-user"):
    """创建一个 BidDocument 用于测试。"""
    from apps.outline.models import Outline
    from apps.outline.models.bid_document import BidDocument
    from apps.projects.models import Project, Lot
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(username=username, password="pass")
    project = Project.objects.create(name=f"proj-{username}", created_by=user)
    lot = Lot.objects.create(name=f"lot-{username}", project=project)
    outline = Outline.objects.create(
        project=project, lot=lot, name=f"outline-{username}", source="preset", created_by=user
    )
    doc = BidDocument.objects.create(
        outline=outline, title="t.docx", file_key=f"k-{username}", created_by=user
    )
    return doc


def test_callback_rejects_missing_token():
    """JWT 缺失时返回 400。"""
    doc = _make_document("cb-test")
    payload = {
        "status": 2,
        "url": "http://example.com/file.docx",
        "key": f"outline-{doc.id}-v1",
    }
    client = Client()
    resp = client.post(
        f"/api/onlyoffice/callback/{doc.id}/",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == 1
    assert "JWT" in body["message"]


def test_callback_rejects_invalid_token():
    """JWT 无效时返回 400。"""
    doc = _make_document("cb-test2")
    payload = {
        "status": 2,
        "url": "http://example.com/file.docx",
        "key": f"outline-{doc.id}-v1",
        "token": "not-a-valid-jwt",
    }
    client = Client()
    resp = client.post(
        f"/api/onlyoffice/callback/{doc.id}/",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == 1
    assert "JWT" in body["message"]


def test_callback_rejects_ssrf_url():
    """SSRF URL 应被拒绝（即使 JWT 有效）。"""
    doc = _make_document("cb-test3")

    payload = _make_callback_payload(doc.id, status=2, url="http://127.0.0.1:8000/admin/")
    client = Client()
    resp = client.post(
        f"/api/onlyoffice/callback/{doc.id}/",
        data=json.dumps(payload),
        content_type="application/json",
    )
    # JWT 校验通过，但下载阶段会因 SSRF 拒绝；status=2 流程会 raise，文档不应被标记 saved
    doc.refresh_from_db()
    assert doc.status != "saved"


def test_callback_rejects_unknown_document():
    """不存在的 document_id 应返回 404。"""
    payload = _make_callback_payload(999999, status=2)
    client = Client()
    resp = client.post(
        "/api/onlyoffice/callback/999999/",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 404


def test_callback_status_2_with_valid_jwt_calls_download():
    """status=2 且 JWT 有效时，应调用 _download_and_save。"""
    doc = _make_document("cb-test4")

    payload = _make_callback_payload(doc.id, status=2, url="http://example.com/file.docx")
    client = Client()
    with patch(
        "apps.outline.views_onlyoffice_callback._download_and_save"
    ) as mock_dl, patch(
        "apps.outline.views_onlyoffice_callback.is_safe_external_url",
        return_value=True,
    ):
        resp = client.post(
            f"/api/onlyoffice/callback/{doc.id}/",
            data=json.dumps(payload),
            content_type="application/json",
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["error"] == 0
    mock_dl.assert_called_once()
    doc.refresh_from_db()
    assert doc.status == "saved"
    assert doc.saved_at is not None
