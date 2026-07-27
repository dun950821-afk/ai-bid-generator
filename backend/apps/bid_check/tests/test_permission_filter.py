"""废标检查越权过滤测试。"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.bid_check.models import BidCheckTask
from apps.outline.models import Outline
from apps.outline.models.bid_document import BidDocument
from apps.projects.models import Lot, Project, ProjectMember, ProjectRole

User = get_user_model()


def _make_user(username):
    return User.objects.create_user(username=username, password="pass")


def _make_project_with_owner(owner, tag="x"):
    project = Project.objects.create(name=f"proj-{tag}", created_by=owner)
    lot = Lot.objects.create(name=f"lot-{tag}", project=project)
    role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["project.view"],
        is_builtin=True,
    )
    ProjectMember.objects.create(project=project, user=owner, project_role=role)
    outline = Outline.objects.create(
        project=project, lot=lot, name=f"outline-{tag}",
        source="preset", created_by=owner,
    )
    return project, lot, outline


def _make_bid_document(outline, owner, tag):
    return BidDocument.objects.create(
        outline=outline, title=f"doc-{tag}.docx",
        file_key=f"k-{tag}", created_by=owner,
    )


@pytest.mark.django_db
class TestBidCheckPermissionFilter:

    def setup_method(self):
        self.alice = _make_user("alice-bc")
        self.bob = _make_user("bob-bc")
        _, _, self.alice_outline = _make_project_with_owner(self.alice, "alice")
        _, _, self.bob_outline = _make_project_with_owner(self.bob, "bob")
        self.alice_doc = _make_bid_document(self.alice_outline, self.alice, "alice")
        self.bob_doc = _make_bid_document(self.bob_outline, self.bob, "bob")
        self.alice_task = BidCheckTask.objects.create(
            outline=self.alice_outline,
            bid_document=self.alice_doc,
            created_by=self.alice,
        )
        self.bob_task = BidCheckTask.objects.create(
            outline=self.bob_outline,
            bid_document=self.bob_doc,
            created_by=self.bob,
        )
        self.client = APIClient()

    def test_alice_cannot_see_bob_tasks(self):
        self.client.force_authenticate(user=self.alice)
        resp = self.client.get("/api/bid-check/tasks/")
        assert resp.status_code == 200
        ids = [t["id"] for t in resp.json().get("results", resp.json())]
        assert self.alice_task.id in ids
        assert self.bob_task.id not in ids

    def test_bob_cannot_retrieve_alice_task(self):
        self.client.force_authenticate(user=self.bob)
        resp = self.client.get(f"/api/bid-check/tasks/{self.alice_task.id}/")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestSSEPermissionFilter:

    def setup_method(self):
        self.alice = _make_user("alice-sse")
        self.bob = _make_user("bob-sse")
        _, _, self.alice_outline = _make_project_with_owner(self.alice, "sse-a")
        _, _, self.bob_outline = _make_project_with_owner(self.bob, "sse-b")
        from apps.outline.models import GenerationTask
        self.alice_task = GenerationTask.objects.create(
            outline=self.alice_outline,
            task_type="section_batch_generation",
            created_by=self.alice,
        )
        self.client = APIClient()

    def test_bob_cannot_subscribe_alice_sse(self):
        """Bob 不应能订阅 Alice 任务的 SSE 流。"""
        # SSE 走 authenticate_request，必须显式带 Authorization header
        from rest_framework_simplejwt.tokens import AccessToken
        token = str(AccessToken.for_user(self.bob))
        resp = self.client.get(
            f"/api/sse/generation-tasks/{self.alice_task.id}/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        # SSE 视图返回 403 而非 404（任务存在但无权访问）
        assert resp.status_code == 403

    def test_bob_cannot_subscribe_alice_outline_sse(self):
        """Bob 不应能订阅 Alice 大纲的 SSE 流。"""
        from rest_framework_simplejwt.tokens import AccessToken
        token = str(AccessToken.for_user(self.bob))
        resp = self.client.get(
            f"/api/sse/outlines/{self.alice_outline.id}/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        assert resp.status_code == 403

