import pytest
from django.contrib.auth import get_user_model

from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
def test_create_project():
    creator = User.objects.create_user(username="pm", password="Str0ng-Pass-1")
    project = Project.objects.create(name="某高速公路标书", created_by=creator)
    assert project.name == "某高速公路标书"
    assert project.status == "active"
    assert project.created_by == creator
    assert project.created_at is not None


@pytest.mark.django_db
def test_create_lot_belongs_to_project():
    creator = User.objects.create_user(username="pm2", password="Str0ng-Pass-1")
    project = Project.objects.create(name="某机房采购", created_by=creator)
    lot = Lot.objects.create(project=project, name="一标段", code="LOT-1")
    assert lot.project == project
    assert lot.code == "LOT-1"
    assert lot.status == "active"
    assert list(project.lots.all()) == [lot]
