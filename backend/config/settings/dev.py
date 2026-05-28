"""开发环境配置。"""
from .base import *  # noqa: F401,F403

DEBUG = True
# 允许通过 DJANGO_ALLOWED_HOSTS 追加 dev 默认之外的访问入口（局域网/外网 IP）。
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"] + env.list(
    "DJANGO_ALLOWED_HOSTS", default=[]
)
