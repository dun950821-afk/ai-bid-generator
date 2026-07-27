"""编辑器图片 magic bytes 校验测试。"""
import io

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.common.services.file_magic import detect_image_kind

User = get_user_model()


def test_detect_png_signature():
    head = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
    assert detect_image_kind(head) == "png"


def test_detect_jpeg_signature():
    head = b"\xff\xd8\xff\xe0" + b"\x00" * 12
    assert detect_image_kind(head) == "jpeg"


def test_detect_webp_signature():
    head = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 4
    assert detect_image_kind(head) == "webp"


def test_detect_image_rejects_non_image():
    assert detect_image_kind(b"") is None
    assert detect_image_kind(b"hello world") is None
    assert detect_image_kind(b"%PDF-1.7") is None


def test_detect_image_rejects_truncated_riff():
    """RIFF 但不足 12 字节或不含 WEBP 标记。"""
    assert detect_image_kind(b"RIFF\x00\x00\x00\x00") is None
    assert detect_image_kind(b"RIFF\x00\x00\x00\x00WAVE") is None  # WAV 文件


@pytest.mark.django_db
class TestEditorImageUploadMagicBytes:
    """编辑器图片上传视图 magic bytes 校验测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="img-test", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _make_upload(self, content: bytes, filename: str, content_type: str):
        from django.core.files.uploadedfile import SimpleUploadedFile
        return SimpleUploadedFile(filename, content, content_type=content_type)

    def test_rejects_fake_png_with_png_content_type(self):
        """声称是 PNG 但实际是文本：必须拒绝。"""
        fake = self._make_upload(b"not a real png", "evil.png", "image/png")
        resp = self.client.post("/api/uploads/editor-image/", {"file": fake}, format="multipart")
        assert resp.status_code == 400
        body = resp.json()
        msg = body.get("detail") or body.get("message") or ""
        assert "无效" in msg or "PNG" in msg or "图片" in msg

    def test_rejects_html_disguised_as_jpeg(self):
        """HTML 内容伪装 jpeg：必须拒绝。"""
        html = b"<html><body><script>alert(1)</script></body></html>"
        fake = self._make_upload(html, "evil.jpg", "image/jpeg")
        resp = self.client.post("/api/uploads/editor-image/", {"file": fake}, format="multipart")
        assert resp.status_code == 400

    def test_accepts_real_png(self):
        """真实 PNG 头应通过 magic bytes 校验。"""
        # 8字节 PNG 签名 + IHDR chunk 起始
        png_head = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + b"\x00" * 20
        upload = self._make_upload(png_head, "ok.png", "image/png")
        resp = self.client.post("/api/uploads/editor-image/", {"file": upload}, format="multipart")
        assert resp.status_code == 200

    def test_uses_magic_bytes_kind_over_client_content_type(self):
        """客户端传 jpeg 头但声明 png，应被识别为 jpeg 并以 .jpg 存储。"""
        jpeg_head = b"\xff\xd8\xff\xe0" + b"\x00" * 20
        upload = self._make_upload(jpeg_head, "actually-jpeg.png", "image/png")
        resp = self.client.post("/api/uploads/editor-image/", {"file": upload}, format="multipart")
        assert resp.status_code == 200
        # 返回的 filename 应该是 .jpg 而不是 .png
        assert resp.json()["filename"].endswith(".jpg")
