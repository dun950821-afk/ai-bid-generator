import pytest
from django.contrib.auth import get_user_model

from apps.projects.models import Project

User = get_user_model()


@pytest.mark.django_db
def test_create_project():
    creator = User.objects.create_user(username="pm", password="Str0ng-Pass-1")
    project = Project.objects.create(name="某高速公路标书", created_by=creator)
    assert project.name == "某高速公路标书"
    assert project.status == "active"
    assert project.created_by == creator
    assert project.created_at is not None
