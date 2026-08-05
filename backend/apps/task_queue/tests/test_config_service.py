"""config_service 参数注册表测试：DB 优先级、缓存失效、校验。"""

import pytest
from django.core.cache import cache

from apps.task_queue.models import TaskQueueConfig
from apps.task_queue.services.config_service import (
    get_all_task_configs,
    get_config_definitions,
    save_config_values,
)


@pytest.fixture
def admin_user(django_user_model):
    return django_user_model.objects.create_user(username="config-admin", password="x")


@pytest.mark.django_db
def test_defaults_without_db_rows():
    configs = get_all_task_configs()
    assert configs["stale_task_grace_minutes"] == 60
    assert configs["reconcile_interval_seconds"] == 600
    assert configs["batch_section_max_retries"] == 2
    assert configs["matrix_generation_batch_size"] == 10
    assert configs["matrix_lock_timeout_seconds"] == 1800
    assert configs["celery_task_time_limit_seconds"] == 3000
    assert configs["celery_task_soft_time_limit_seconds"] == 2700


@pytest.mark.django_db
def test_db_row_overrides_default(admin_user):
    TaskQueueConfig.objects.create(key="stale_task_grace_minutes", value=5, updated_by=admin_user)

    assert get_all_task_configs()["stale_task_grace_minutes"] == 5
    # 未配置的 key 仍走默认值
    assert get_all_task_configs()["reconcile_interval_seconds"] == 600


@pytest.mark.django_db
def test_save_config_values_invalidates_cache(admin_user):
    # 先读一次填充缓存
    assert get_all_task_configs()["stale_task_grace_minutes"] == 60

    errors = save_config_values({"stale_task_grace_minutes": 5}, user=admin_user)
    assert errors == {}

    # 缓存已失效，立即读到新值
    assert get_all_task_configs()["stale_task_grace_minutes"] == 5
    row = TaskQueueConfig.objects.get(key="stale_task_grace_minutes")
    assert row.value == 5
    assert row.updated_by_id == admin_user.id


@pytest.mark.django_db
def test_save_config_values_rejects_out_of_range(admin_user):
    errors = save_config_values({"stale_task_grace_minutes": 0}, user=admin_user)
    assert "stale_task_grace_minutes" in errors
    assert not TaskQueueConfig.objects.filter(key="stale_task_grace_minutes").exists()


@pytest.mark.django_db
def test_save_config_values_rejects_unknown_key(admin_user):
    errors = save_config_values({"not_a_real_key": 1}, user=admin_user)
    assert "not_a_real_key" in errors


@pytest.mark.django_db
def test_save_config_values_rejects_non_int(admin_user):
    errors = save_config_values({"stale_task_grace_minutes": "60"}, user=admin_user)
    assert "stale_task_grace_minutes" in errors


@pytest.mark.django_db
def test_get_config_definitions_includes_values():
    definitions = get_config_definitions()
    assert len(definitions) == 7
    by_key = {d["key"]: d for d in definitions}
    assert by_key["celery_task_time_limit_seconds"]["needs_restart"] is True
    assert by_key["matrix_generation_batch_size"]["value"] == 10
    # 缓存已被前序测试清空，这里直接验证当前值
    assert cache.get("task_queue_config_all") is not None
