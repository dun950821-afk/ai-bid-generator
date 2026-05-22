import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"

    def ready(self):
        """启动期保证 MinIO bucket 存在；MinIO 临时不可达不应让进程起不来。

        M4：原 presigned_put_object 每次调用都 ensure_bucket，等价于把启动
        操作挂在每次请求上。移到 ready，启动失败不阻塞进程，只记录 warning，
        让运维有机会修复后第一次请求自然成功（bucket 不存在则后续 put 会
        显式失败）。
        """
        from apps.common.services.storage import StorageService

        try:
            StorageService().ensure_bucket()
        except Exception as exc:
            logger.warning(
                "MinIO bucket bootstrap failed (will retry lazily): %s", exc
            )
