"""ONLYOFFICE 模板回调安全测试。"""
import json
from unittest.mock import patch

import jwt
import pytest
from django.conf import settings
from django.test import Client

from apps.outline.models import BidWordTemplate

pytestmark = pytest.mark.django_db


def _make_template(username="tpl-cb"):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(username=username, password="pass")
    return BidWordTemplate.objects.create(
        name="回调模板",
        code=f"cb-tpl-{username}",
        scope_type="system",
        draft_object_key=f"bid-templates/system/1/draft/current-{username}.docx",
        draft_revision=1,
        draft_file_key=f"tpl-1-r1-{username}",
        created_by=user,
    )


def _make_payload(template_id, status=2, url="http://example.com/tpl.docx", with_token=True):
    payload = {
        "status": status,
        "url": url,
        "key": f"tpl-{template_id}-r1",
        "users": ["user-1"],
    }
    if with_token:
        # DS 约定：回调 token 的 claims 为 {"payload": <body 除 token 外字段>}（F-12）
        payload["token"] = jwt.encode(
            {"payload": payload}, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256"
        )
    return payload


def _callback_url(template_id):
    return f"/api/onlyoffice/callback/template/{template_id}/"


def test_callback_rejects_missing_token():
    template = _make_template("cb-no-token")
    payload = _make_payload(template.id, with_token=False)
    resp = Client().post(
        _callback_url(template.id),
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "JWT" in resp.json()["message"]


def test_callback_rejects_invalid_token():
    template = _make_template("cb-bad-token")
    payload = _make_payload(template.id)
    payload["token"] = "not-a-valid-jwt"
    resp = Client().post(
        _callback_url(template.id),
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 400


def test_callback_rejects_unknown_template():
    payload = _make_payload(999999)
    resp = Client().post(
        _callback_url(999999),
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 404


def test_callback_status2_saves_draft_and_bumps_revision():
    """status=2：draft 内容更新，修订号 +1，file_key 更换，不产生业务版本。"""
    template = _make_template("cb-status2")
    old_key = template.draft_file_key
    old_revision = template.draft_revision

    payload = _make_payload(template.id, status=2)
    with patch(
        "apps.outline.views_onlyoffice_callback._download_template_file",
        return_value=b"PK-docx-content",
    ), patch(
        "apps.outline.services.template.template_service.StorageService"
    ) as mock_storage_cls:
        resp = Client().post(
            _callback_url(template.id),
            data=json.dumps(payload),
            content_type="application/json",
        )

    assert resp.status_code == 200
    assert resp.json()["error"] == 0
    mock_storage_cls.return_value.put_object.assert_called_once()

    template.refresh_from_db()
    assert template.draft_revision == old_revision + 1
    assert template.draft_file_key != old_key
    assert template.versions.count() == 0


def test_callback_status6_saves_without_revision_bump():
    """status=6（forcesave）：只覆盖内容，不换 key、不升修订号。"""
    template = _make_template("cb-status6")
    old_key = template.draft_file_key
    old_revision = template.draft_revision

    payload = _make_payload(template.id, status=6)
    with patch(
        "apps.outline.views_onlyoffice_callback._download_template_file",
        return_value=b"PK-docx-content",
    ), patch(
        "apps.outline.services.template.template_service.StorageService"
    ):
        resp = Client().post(
            _callback_url(template.id),
            data=json.dumps(payload),
            content_type="application/json",
        )

    assert resp.status_code == 200
    template.refresh_from_db()
    assert template.draft_revision == old_revision
    assert template.draft_file_key == old_key


def test_callback_rejects_ssrf_url():
    """SSRF URL 应被拒绝（即使 JWT 有效），draft 不被更新。"""
    template = _make_template("cb-ssrf")
    payload = _make_payload(template.id, status=2, url="http://127.0.0.1:8000/admin/")
    resp = Client().post(
        _callback_url(template.id),
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.json()["error"] == 1
    template.refresh_from_db()
    assert template.draft_revision == 1
