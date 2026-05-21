import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_create_user_has_custom_fields():
    user = User.objects.create_user(
        username="alice",
        password="Str0ng-Pass-1",
        real_name="爱丽丝",
        phone="13800000000",
        department="投标部",
    )
    assert user.real_name == "爱丽丝"
    assert user.phone == "13800000000"
    assert user.department == "投标部"
    assert user.must_change_password is False
    assert user.is_active is True
    assert user.created_at is not None
    assert user.updated_at is not None


@pytest.mark.django_db
def test_must_change_password_can_be_set():
    user = User.objects.create_user(username="bob", password="Str0ng-Pass-1")
    user.must_change_password = True
    user.save(update_fields=["must_change_password"])
    user.refresh_from_db()
    assert user.must_change_password is True
