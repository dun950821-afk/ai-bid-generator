"""MinIO 存储封装（spec §3.5、§3.7）。

业务层不直接依赖 minio.Client，统一经 StorageService。
v1 只实现单对象 PUT 预签名；分片上传预留，不实现。

预签名 URL 的 SigV4 签名包含 host，生成后不可改写 host，所以这里持有两个
client：_ops 走内网地址做常规操作，_presign 走浏览器可达地址只用于签名。
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from minio import Minio
from minio.datatypes import PostPolicy
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

    def set_public_policy(self, prefix: str = "editor/images/") -> None:
        """设置指定前缀为公开读。

        Args:
            prefix: 要公开的路径前缀
        """
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": "*"},
                    "Action": "s3:GetObject",
                    "Resource": f"arn:aws:s3:::{self.bucket}/{prefix}*",
                }
            ],
        }
        try:
            self._ops.set_bucket_policy(self.bucket, json.dumps(policy))
        except S3Error as exc:
            raise StorageError(str(exc)) from exc

    def presigned_put_object(self, object_key: str, expires_seconds: int | None = None) -> str:
        # bucket 创建是启动期一次性事情，移到 CommonConfig.ready；不要再
        # 挂到每次请求路径上。
        expires = timedelta(seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS)
        # 直接用 _presign client 生成；host 已是浏览器可达地址，不再改写。
        url = self._presign.presigned_put_object(self.bucket, object_key, expires=expires)
        # 如果启用了 nginx 代理，将完整 URL 转换为相对路径
        if settings.MINIO_PROXY_ENABLED:
            # 解析 URL path，转换为 /minio/ 代理路径
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return f"/minio{parsed.path}"
        return url

    def presigned_post_upload(
        self,
        object_key: str,
        *,
        max_size: int,
        content_type: str | None = None,
        expires_seconds: int | None = None,
    ) -> dict:
        """生成带 content-length-range 的 POST policy 表单。

        PUT 预签名只能签 URL 与 method，没有任何字段能在服务端硬限制 body
        长度；攻击者拿到 URL 后可以 PUT 任意大小。POST policy 把
        content-length-range 写进 base64 policy 并被 MinIO SigV4 签名校验，
        body 一旦超过 max_size，MinIO 会在接收阶段直接拒绝。

        返回 {url, fields}：url 是浏览器 POST 的目标（bucket 维度），
        fields 是必须随 multipart 一起提交的隐藏字段（含 policy / signature /
        key / Content-Type 等）。
        """
        expires_at = datetime.now(tz=dt_timezone.utc) + timedelta(
            seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS
        )
        policy = PostPolicy(self.bucket, expires_at)
        policy.add_equals_condition("key", object_key)
        if content_type:
            policy.add_equals_condition("Content-Type", content_type)
        # 下限 1 防 0 字节占位；上限即业务硬限。SigV4 校验该条件，不可改。
        policy.add_content_length_range_condition(1, max_size)
        fields = self._presign.presigned_post_policy(policy)

        # presigned_post_policy 返回的 fields 不包含 key，需要手动添加
        fields["key"] = object_key
        # 如果有 content_type，也需要添加到 fields 中供前端使用
        if content_type:
            fields["Content-Type"] = content_type

        # 如果启用了 nginx 代理，使用相对路径 /minio/ 避免跨域
        if settings.MINIO_PROXY_ENABLED:
            url = f"/minio/{self.bucket}"
        else:
            scheme = "https" if settings.MINIO_SECURE else "http"
            url = f"{scheme}://{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket}"
        return {"url": url, "fields": fields}

    def stat_object(self, object_key: str):
        try:
            return self._ops.stat_object(self.bucket, object_key)
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NotFound"}:
                raise ObjectNotFound(object_key) from exc
            raise StorageError(str(exc)) from exc

    def object_exists(self, object_key: str) -> bool:
        """检查对象是否存在。"""
        try:
            self._ops.stat_object(self.bucket, object_key)
            return True
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NotFound"}:
                return False
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

    def get_object(self, object_key: str) -> bytes:
        """读取对象内容。"""
        try:
            response = self._ops.get_object(self.bucket, object_key)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NotFound"}:
                raise ObjectNotFound(object_key) from exc
            raise StorageError(str(exc)) from exc

    def put_object(
        self,
        object_key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        """上传对象内容。"""
        try:
            from io import BytesIO
            self._ops.put_object(
                self.bucket,
                object_key,
                BytesIO(data),
                length=len(data),
                content_type=content_type,
            )
        except S3Error as exc:
            raise StorageError(str(exc)) from exc

    def upload_fileobj(
        self,
        file_obj,
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> None:
        """上传文件对象（支持 Django UploadedFile 或类似对象）。

        Args:
            file_obj: 文件对象，需要有 read() 方法和 size 属性
            object_key: 对象键
            content_type: MIME 类型
        """
        try:
            self._ops.put_object(
                self.bucket,
                object_key,
                file_obj,
                length=file_obj.size,
                content_type=content_type,
            )
        except S3Error as exc:
            raise StorageError(str(exc)) from exc

    def presigned_get_object(
        self,
        object_key: str,
        expires_seconds: int | None = None,
        absolute_url: bool = False,
    ) -> str:
        """生成预签名 GET URL。

        Args:
            object_key: 对象键
            expires_seconds: 过期时间（秒），默认使用配置值
            absolute_url: 兼容参数，保留签名 URL 的绝对形式

        Returns:
            预签名绝对 URL（含 SigV4 签名参数）

        SigV4 签名包含 host，URL 不能改 host 也不能拆成 /minio/ 代理路径
        （拆路径会丢签名参数，MinIO 校验失败返回 403）。MINIO_PUBLIC_ENDPOINT
        必须是浏览器/外部服务可达地址，直接返回绝对 URL。
        """
        expires = timedelta(seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS)
        return self._presign.presigned_get_object(self.bucket, object_key, expires=expires)
