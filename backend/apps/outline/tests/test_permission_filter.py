"""Outline/Section/GenerationTask 越权过滤测试。"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.outline.models import Outline, Section
from apps.outline.models.generation_task import GenerationTask
from apps.projects.models import Lot, Project, ProjectMember, ProjectRole

User = get_user_model()


def _make_user(username):
    return User.objects.create_user(username=username, password="pass")


def _make_project_with_owner(owner):
    project = Project.objects.create(name=f"proj-{owner.username}", created_by=owner)
    lot = Lot.objects.create(name=f"lot-{owner.username}", project=project)
    # 创建项目角色 + 成员关系
    role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["project.view"],
        is_builtin=True,
    )
    ProjectMember.objects.create(project=project, user=owner, project_role=role)
    return project, lot


@pytest.mark.django_db
class TestOutlinePermissionFilter:
    """OutlineViewSet 只返回用户参与项目下的大纲。"""

    def setup_method(self):
        self.alice = _make_user("alice")
        self.bob = _make_user("bob")
        # Alice 的项目
        self.alice_project, self.alice_lot = _make_project_with_owner(self.alice)
        self.alice_outline = Outline.objects.create(
            project=self.alice_project,
            lot=self.alice_lot,
            name="alice-outline",
            source="preset",
            created_by=self.alice,
        )
        # Bob 的项目
        self.bob_project, self.bob_lot = _make_project_with_owner(self.bob)
        self.bob_outline = Outline.objects.create(
            project=self.bob_project,
            lot=self.bob_lot,
            name="bob-outline",
            source="preset",
            created_by=self.bob,
        )
        self.client = APIClient()

    def test_alice_cannot_see_bob_outlines(self):
        """Alice 列表不应包含 Bob 的大纲。"""
        self.client.force_authenticate(user=self.alice)
        resp = self.client.get("/api/outlines/")
        assert resp.status_code == 200
        ids = [o["id"] for o in resp.json().get("results", resp.json())]
        assert self.alice_outline.id in ids
        assert self.bob_outline.id not in ids

    def test_bob_cannot_retrieve_alice_outline(self):
        """Bob 直接访问 Alice 的大纲应 404。"""
        self.client.force_authenticate(user=self.bob)
        resp = self.client.get(f"/api/outlines/{self.alice_outline.id}/")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestSectionPermissionFilter:
    """SectionViewSet 只返回用户参与项目下的章节。"""

    def setup_method(self):
        self.alice = _make_user("alice-sec")
        self.bob = _make_user("bob-sec")
        self.alice_project, self.alice_lot = _make_project_with_owner(self.alice)
        self.alice_outline = Outline.objects.create(
            project=self.alice_project,
            lot=self.alice_lot,
            name="alice-outline",
            source="preset",
            created_by=self.alice,
        )
        self.alice_section = Section.objects.create(
            outline=self.alice_outline, title="alice-section", level=1, sort_order=0
        )
        self.bob_project, self.bob_lot = _make_project_with_owner(self.bob)
        self.bob_outline = Outline.objects.create(
            project=self.bob_project,
            lot=self.bob_lot,
            name="bob-outline",
            source="preset",
            created_by=self.bob,
        )
        self.bob_section = Section.objects.create(
            outline=self.bob_outline, title="bob-section", level=1, sort_order=0
        )
        self.client = APIClient()

    def test_alice_cannot_see_bob_sections(self):
        self.client.force_authenticate(user=self.alice)
        resp = self.client.get("/api/sections/")
        assert resp.status_code == 200
        ids = [s["id"] for s in resp.json().get("results", resp.json())]
        assert self.alice_section.id in ids
        assert self.bob_section.id not in ids

    def test_bob_cannot_retrieve_alice_section(self):
        self.client.force_authenticate(user=self.bob)
        resp = self.client.get(f"/api/sections/{self.alice_section.id}/")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestGenerationTaskPermissionFilter:
    """GenerationTaskViewSet 只返回用户参与项目下的任务。"""

    def setup_method(self):
        self.alice = _make_user("alice-task")
        self.bob = _make_user("bob-task")
        self.alice_project, self.alice_lot = _make_project_with_owner(self.alice)
        self.alice_outline = Outline.objects.create(
            project=self.alice_project,
            lot=self.alice_lot,
            name="alice-outline",
            source="preset",
            created_by=self.alice,
        )
        self.alice_task = GenerationTask.objects.create(
            outline=self.alice_outline,
            task_type="section_batch_generation",
            created_by=self.alice,
        )
        self.bob_project, self.bob_lot = _make_project_with_owner(self.bob)
        self.bob_outline = Outline.objects.create(
            project=self.bob_project,
            lot=self.bob_lot,
            name="bob-outline",
            source="preset",
            created_by=self.bob,
        )
        self.bob_task = GenerationTask.objects.create(
            outline=self.bob_outline,
            task_type="section_batch_generation",
            created_by=self.bob,
        )
        self.client = APIClient()

    def test_alice_cannot_see_bob_tasks(self):
        self.client.force_authenticate(user=self.alice)
        resp = self.client.get("/api/generation-tasks/")
        assert resp.status_code == 200
        ids = [t["id"] for t in resp.json().get("results", resp.json())]
        assert self.alice_task.id in ids
        assert self.bob_task.id not in ids

    def test_bob_cannot_retrieve_alice_task(self):
        self.client.force_authenticate(user=self.bob)
        resp = self.client.get(f"/api/generation-tasks/{self.alice_task.id}/")
        assert resp.status_code == 404
