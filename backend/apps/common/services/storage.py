"""MinIO 存储封装（spec §3.5、§3.7）。

业务层不直接依赖 minio.Client，统一经 StorageService。
v1 只实现单对象 PUT 预签名；分片上传预留，不实现。

预签名 URL 的 SigV4 签名包含 host，生成后不可改写 host，所以这里持有两个
client：_ops 走内网地址做常规操作，_presign 走浏览器可达地址只用于签名。
"""
from __future__ import annotations

import re
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from minio import Minio
from minio.error import S3Error

SAFE_EXT_RE = re.compile(r"^[a-zA-Z0-9]{1,12}$")


class StorageError(RuntimeError):
    pass


class ObjectNotFound(StorageError):
    pass


class StorageService:
    def __init__(self):
        self.bucket = settings.MINIO_BUCKET
        # 内网 client：容器内对 MinIO 的常规操作（bucket / stat / 读取 / 删除）。
        self._ops = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        # 预签名 client：用浏览器可达地址签名；URL 生成后不可再改 host。
        self._presign = Minio(
            settings.MINIO_PUBLIC_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )

    @staticmethod
    def _safe_ext(original_name: str) -> str:
        suffix = Path(original_name).suffix.lower().lstrip(".")
        if not suffix or not SAFE_EXT_RE.match(suffix):
            return "bin"
        return suffix

    @classmethod
    def build_tender_object_key(cls, project_id: int, lot_id: int | None, file_id: int, original_name: str) -> str:
        ext = cls._safe_ext(original_name)
        if lot_id:
            return f"projects/{project_id}/lots/{lot_id}/tender/{file_id}/original.{ext}"
        return f"projects/{project_id}/tender/{file_id}/original.{ext}"

    def ensure_bucket(self) -> None:
        if not self._ops.bucket_exists(self.bucket):
            self._ops.make_bucket(self.bucket)

    def presigned_put_object(self, object_key: str, expires_seconds: int | None = None) -> str:
        # bucket 创建是启动期一次性事情，移到 CommonConfig.ready；不要再
        # 挂到每次请求路径上。
        expires = timedelta(seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS)
        # 直接用 _presign client 生成；host 已是浏览器可达地址，不再改写。
        return self._presign.presigned_put_object(self.bucket, object_key, expires=expires)

    def stat_object(self, object_key: str):
        try:
            return self._ops.stat_object(self.bucket, object_key)
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NotFound"}:
                raise ObjectNotFound(object_key) from exc
            raise StorageError(str(exc)) from exc

    def read_head(self, object_key: str, length: int = 4096) -> bytes:
        try:
            response = self._ops.get_object(
                self.bucket,
                object_key,
                offset=0,
                length=length,
            )
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NotFound"}:
                raise ObjectNotFound(object_key) from exc
            raise StorageError(str(exc)) from exc

    def remove_object(self, object_key: str) -> None:
        try:
            self._ops.remove_object(self.bucket, object_key)
        except S3Error as exc:
            raise StorageError(str(exc)) from exc
