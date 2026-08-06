"""BidDocument download 视图测试。"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.common.services.storage import ObjectNotFound, StorageError
from apps.outline.models import BidDocument, Outline
from apps.projects.models import Lot, Project, ProjectMember, ProjectRole

User = get_user_model()


def _make_project_with_owner(owner):
    project = Project.objects.create(name=f"proj-{owner.username}", created_by=owner)
    lot = Lot.objects.create(name=f"lot-{owner.username}", project=project)
    role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["project.view", "outline.view"],
        is_builtin=True,
    )
    ProjectMember.objects.create(project=project, user=owner, project_role=role)
    return project, lot


@pytest.mark.django_db
class TestBidDocumentDownload:
    def setup_method(self):
        self.user = User.objects.create_user(username="alice", password="pass")
        project, lot = _make_project_with_owner(self.user)
        self.outline = Outline.objects.create(
            project=project,
            lot=lot,
            name="outline",
            source="preset",
            created_by=self.user,
        )
        self.doc = BidDocument.objects.create(
            outline=self.outline,
            title="测试文档.docx",
            object_key="bid_documents/test.docx",
            file_key="test-file-key",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _patch_storage(self, monkeypatch, get_result=b"PK-binary", exc=None):
        # 只替换 get_object 方法，不替换 StorageService 类本身：
        # upload_service 的 PEP 604 注解（StorageService | None）在模块首次
        # import 时求值，若把类换成 lambda 会在请求触发 urlconf 加载时炸。
        from apps.common.services.storage import StorageService

        def fake_get_object(self, key):
            if exc is not None:
                raise exc
            return get_result

        monkeypatch.setattr(StorageService, "get_object", fake_get_object)

    def test_download_ok(self, monkeypatch):
        self._patch_storage(monkeypatch)
        resp = self.client.get(f"/api/bid-documents/{self.doc.id}/download/")
        assert resp.status_code == 200
        assert resp.content == b"PK-binary"
        # 中文文件名被 Django RFC 2047 编码（标准行为，浏览器兼容）
        from email.header import decode_header

        header = resp["Content-Disposition"]
        decoded = "".join(
            text.decode(charset or "utf-8") if isinstance(text, bytes) else text
            for text, charset in decode_header(header)
        )
        assert "attachment" in decoded
        assert "测试文档.docx" in decoded

    def test_object_not_found_returns_404(self, monkeypatch):
        self._patch_storage(monkeypatch, exc=ObjectNotFound("missing"))
        resp = self.client.get(f"/api/bid-documents/{self.doc.id}/download/")
        assert resp.status_code == 404
        assert resp.json() == {"error": "文件不存在"}

    def test_minio_connection_error_returns_json_500(self, monkeypatch):
        """连接层异常（非 S3Error，如 urllib3 超时）应返回 JSON 而非裸 500 页。"""
        self._patch_storage(monkeypatch, exc=ConnectionError("minio unreachable"))
        resp = self.client.get(f"/api/bid-documents/{self.doc.id}/download/")
        assert resp.status_code == 500
        assert resp.json() == {"error": "文件下载失败"}

    def test_storage_error_returns_json_500(self, monkeypatch):
        self._patch_storage(monkeypatch, exc=StorageError("bucket gone"))
        resp = self.client.get(f"/api/bid-documents/{self.doc.id}/download/")
        assert resp.status_code == 500
        assert resp.json() == {"error": "文件下载失败"}
