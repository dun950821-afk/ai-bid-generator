"""enqueue_after_commit 测试。"""
from unittest.mock import MagicMock, patch

import pytest
from django.db import transaction
from django.test import TransactionTestCase

from apps.common.tasks_utils import enqueue_after_commit


class TestEnqueueAfterCommit(TransactionTestCase):
    """TransactionTestCase 让事务真正提交, on_commit 才会触发。"""

    def test_runs_inside_atomic(self):
        """事务提交后才投递。"""
        mock_task = MagicMock()
        mock_task.name = "fake.task"

        with transaction.atomic():
            enqueue_after_commit(mock_task, "a", kw="b")
            mock_task.delay.assert_not_called()
        # atomic 退出后应触发
        mock_task.delay.assert_called_once_with("a", kw="b")

    def test_runs_immediately_outside_atomic(self):
        """无事务时立即执行。"""
        mock_task = MagicMock()
        mock_task.name = "fake.task"
        enqueue_after_commit(mock_task, 1, 2, x=3)
        mock_task.delay.assert_called_once_with(1, 2, x=3)

    def test_swallows_enqueue_error(self):
        """delay 抛异常时不应向上抛出（避免影响提交）。"""
        mock_task = MagicMock()
        mock_task.name = "fake.task"
        mock_task.delay.side_effect = RuntimeError("redis down")

        with transaction.atomic():
            enqueue_after_commit(mock_task, "x")
        # 不抛异常即可
        mock_task.delay.assert_called_once_with("x")

    def test_handles_rollback(self):
        """事务回滚后不投递。"""
        mock_task = MagicMock()
        mock_task.name = "fake.task"

        try:
            with transaction.atomic():
                enqueue_after_commit(mock_task, "x")
                raise RuntimeError("simulated failure")
        except RuntimeError:
            pass

        mock_task.delay.assert_not_called()


