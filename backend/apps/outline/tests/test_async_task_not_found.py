# backend/apps/outline/tests/test_async_task_not_found.py
"""AsyncTask 不存在时任务容错测试。"""

import pytest


@pytest.mark.django_db
def test_async_task_not_found_does_not_raise():
    """AsyncTask 记录不存在时任务应静默退出，不抛异常。"""
    from apps.outline.tasks import refine_outline_task

    # 调用一个不存在的 async_task_id
    result = refine_outline_task.apply(
        kwargs={
            "async_task_id": 999999,
            "user_id": 1,
            "outline_id": 1,
        }
    )
    # 不应抛 DoesNotExist
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_table_cleanup_task():
    """table_cleanup_task 也应容错。"""
    from apps.outline.tasks import table_cleanup_task

    result = table_cleanup_task.apply(
        kwargs={
            "section_id": 1,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_generate_outline_task():
    """generate_outline_task 也应容错。"""
    from apps.outline.tasks import generate_outline_task

    result = generate_outline_task.apply(
        kwargs={
            "tender_file_id": 1,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_consistency_audit_task():
    """consistency_audit_task 也应容错。"""
    from apps.outline.tasks import consistency_audit_task

    result = consistency_audit_task.apply(
        kwargs={
            "outline_id": 1,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_consistency_repair_task():
    """consistency_repair_task 也应容错。"""
    from apps.outline.tasks import consistency_repair_task

    result = consistency_repair_task.apply(
        kwargs={
            "outline_id": 1,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_table_cleanup_outline_task():
    """table_cleanup_outline_task 也应容错。"""
    from apps.outline.tasks import table_cleanup_outline_task

    result = table_cleanup_outline_task.apply(
        kwargs={
            "outline_id": 1,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_outline_expand_task():
    """outline_expand_task 也应容错。"""
    from apps.outline.tasks import outline_expand_task

    result = outline_expand_task.apply(
        kwargs={
            "outline_id": 1,
            "target_total_words": 1000,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_mermaid_illustration_task():
    """mermaid_illustration_task 也应容错。"""
    from apps.outline.tasks import mermaid_illustration_task

    result = mermaid_illustration_task.apply(
        kwargs={
            "outline_id": 1,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_image_generation_task():
    """image_generation_task 也应容错。"""
    from apps.outline.tasks import image_generation_task

    result = image_generation_task.apply(
        kwargs={
            "outline_id": 1,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_expand_sections_task():
    """expand_sections_task 也应容错。"""
    from apps.outline.tasks import expand_sections_task

    result = expand_sections_task.apply(
        kwargs={
            "outline_id": 1,
            "minimum_words": 1000,
            "async_task_id": 999999,
            "user_id": 1,
        }
    )
    assert not result.failed()
