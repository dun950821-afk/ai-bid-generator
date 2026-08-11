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
        """把指定前缀加入公开读策略（合并式，不覆盖既有前缀）。

        历史上本方法是整桶覆盖式写入：每上传一张编辑器图片就会把
        converted/ 等其他公开前缀从策略里抹掉，导致 ONLYOFFICE 转换
        下载临时文件 403（表现为"文件下载失败"）。改为读-改-写合并。

        Args:
            prefix: 要公开的路径前缀
        """
        resource = f"arn:aws:s3:::{self.bucket}/{prefix}*"
        try:
            policy = json.loads(self._ops.get_bucket_policy(self.bucket))
        except S3Error as exc:
            if "NoSuchBucketPolicy" in str(exc):
                policy = {"Version": "2012-10-17", "Statement": []}
            else:
                raise StorageError(str(exc)) from exc

        statements = policy.setdefault("Statement", [])
        for stmt in statements:
            resources = stmt.get("Resource", [])
            if isinstance(resources, str):
                resources = [resources]
            if resource in resources:
                return  # 已在策略中，幂等返回

        statements.append(
            {
                "Effect": "Allow",
                "Principal": {"AWS": "*"},
                "Action": "s3:GetObject",
                "Resource": resource,
            }
        )
        try:
            self._ops.set_bucket_policy(self.bucket, json.dumps(policy))
        except S3Error as exc:
            raise StorageError(str(exc)) from exc

    def presigned_put_object(self, object_key: str, expires_seconds: int | None = None) -> str:
        # bucket 创建是启动期一次性事情，移到 CommonConfig.ready；不要再
        # 挂到每次请求路径上。
        expires = timedelta(seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS)
        # SigV4 签名覆盖 host 与整个 query，生成的 URL 不可改写：
        # 历史上这里曾在 MINIO_PROXY_ENABLED 时把 URL 改写成 /minio/ 相对路径，
        # 该写法会把签名 query 整体丢掉，产出的是未签名 URL（PUT 必 403），
        # 已移除。调用方需要浏览器可达地址时请配置 MINIO_PUBLIC_ENDPOINT。
        return self._presign.presigned_put_object(self.bucket, object_key, expires=expires)

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

    def copy_to_editor_images(self, source_key: str, content_type: str = "") -> str:
        """把桶内对象复制到 editor/images/ 公开前缀，返回可持久引用的 URL。

        供编辑器"从库插图"使用：材料库 / 知识库的图片复制一份到公开
        前缀后，URL 可长期写入文档内容（原图多为私有或预签名短链）。
        """
        import uuid

        data = self.get_object(source_key)
        ext = Path(source_key).suffix.lower() or ".png"
        today = datetime.now()
        object_key = (
            f"editor/images/{today.year}/{today.month:02d}/{today.day:02d}/"
            f"{uuid.uuid4().hex}{ext}"
        )
        self.put_object(object_key, data, content_type=content_type or "application/octet-stream")
        self.set_public_policy("editor/images/")

        if settings.MINIO_PROXY_ENABLED:
            return f"/minio/{self.bucket}/{object_key}"
        scheme = "https" if settings.MINIO_SECURE else "http"
        return f"{scheme}://{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket}/{object_key}"

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
