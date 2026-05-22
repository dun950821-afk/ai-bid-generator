"""验证 bucket 准备移到 AppConfig.ready（M4 修复）。"""
import pytest

from apps.common.services.storage import StorageService


def test_presigned_put_object_does_not_call_ensure_bucket(monkeypatch):
    """presigned_put_object 不应每次都调用 ensure_bucket。

    bucket 创建是启动期一次性事情，挂在每次请求路径上既浪费一次网络
    调用，又让请求耦合 bucket 元操作的失败。
    """
    storage = StorageService()
    calls = {"ensure": 0}

    def fake_ensure(self):
        calls["ensure"] += 1

    monkeypatch.setattr(StorageService, "ensure_bucket", fake_ensure)
    monkeypatch.setattr(
        storage._presign,
        "presigned_put_object",
        lambda bucket, key, expires=None: "http://stub",
    )

    storage.presigned_put_object("k1")
    storage.presigned_put_object("k2")

    assert calls["ensure"] == 0


def test_ready_swallows_minio_errors(monkeypatch, caplog):
    """MinIO 暂时不可达不应让整个 Django 启动失败；只记录 warning。"""
    from apps.common.apps import CommonConfig

    def boom(self):
        raise ConnectionError("MinIO down")

    monkeypatch.setattr(StorageService, "ensure_bucket", boom)
    config = CommonConfig.create("apps.common")
    # ready 已被 Django 启动时调用过；这里再手动调一次验证幂等且不抛
    config.ready()
    assert "MinIO" in caplog.text or "bucket" in caplog.text.lower()
