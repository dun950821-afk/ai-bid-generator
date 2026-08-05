"""所有环境共享的基础配置。"""
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
_env_file = BASE_DIR / ".env"
if _env_file.exists():
    env.read_env(str(_env_file))

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-insecure-change-me")
# Fernet 强密钥，用于加密 ModelProvider API Key 等。生产环境必须配置。
SECRET_KEY_ENCRYPTION = env("SECRET_KEY_ENCRYPTION", default=None)
DEBUG = False
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
]
LOCAL_APPS = [
    "apps.common",
    "apps.accounts",
    "apps.projects",
    "apps.workflows",
    "apps.tender",
    "apps.requirements",
    "apps.scoring",
    "apps.enterprise",
    "apps.knowledge",
    "apps.outline",
    "apps.generation",
    "apps.quotation",
    "apps.exporting",
    "apps.audit",
    "apps.notifications",
    "apps.system_config",
    "apps.bid_check",
    "apps.task_queue",
    "dashboard",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.request_cache.RequestCacheMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://bid:bid@localhost:5432/bid"),
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/1"),
    },
}

# 密码哈希：Argon2 首选（spec §5.8.1）
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "apps.accounts.permissions.MustChangePasswordPermission",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.common.exceptions.custom_exception_handler",
}

# Celery（broker/queues 细节见 config/celery.py）
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")

# 任务时限兜底：软限（SoftTimeLimitExceeded → 任务 except 分支干净失败）45 分钟，
# 硬限（SIGKILL，覆盖 DNS/TLS 等 C 层阻塞）50 分钟。
# 实证最长合法任务 24 分钟（抽取）；LLM 单次调用上限 15 分钟（服务端思考模式）。
CELERY_TASK_SOFT_TIME_LIMIT = 2700
CELERY_TASK_TIME_LIMIT = 3000

LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

# ---- JWT（spec §5.5）----
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,  # last_login 由 login_service 显式更新
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# 认证 Cookie 是否带 Secure 标记；生产环境在 prod.py 置 True
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=False)

# ---- MinIO 对象存储（spec §3.5、§3.7）----
MINIO_ENDPOINT = env("MINIO_ENDPOINT", default="localhost:9000")
MINIO_PUBLIC_ENDPOINT = env("MINIO_PUBLIC_ENDPOINT", default=MINIO_ENDPOINT)
MINIO_ACCESS_KEY = env("MINIO_ACCESS_KEY", default="minioadmin")
MINIO_SECRET_KEY = env("MINIO_SECRET_KEY", default="minioadmin")
MINIO_BUCKET = env("MINIO_BUCKET", default="bid-files")
MINIO_SECURE = env.bool("MINIO_SECURE", default=False)
MINIO_PRESIGN_EXPIRES_SECONDS = env.int("MINIO_PRESIGN_EXPIRES_SECONDS", default=3600)
# 是否通过 nginx 代理 MinIO；True 时预签名 URL 使用相对路径 /minio/
MINIO_PROXY_ENABLED = env.bool("MINIO_PROXY_ENABLED", default=False)

# 上传 grace（小时）：cleanup_stale_uploads 任务把超过该时长仍处于
# uploading / rejected 的孤儿记录置为 upload_expired。1h 既能覆盖
# 正常浏览器直传，也能尽快回收签名失败 / 客户端放弃的记录。
UPLOAD_GRACE_HOURS = env.int("UPLOAD_GRACE_HOURS", default=1)

# 招标文件单文件大小上限（字节）。该值会写进 MinIO POST policy 的
# content-length-range 条件里，超过时 MinIO 直接拒绝；后端 serializer
# 也会用同一值做前置校验，避免无意义占用一次预签名。默认 200 MB。
MAX_TENDER_FILE_SIZE = env.int("MAX_TENDER_FILE_SIZE", default=200 * 1024 * 1024)

# ---- ONLYOFFICE Document Server 配置 ----
ONLYOFFICE_JWT_SECRET = env("ONLYOFFICE_JWT_SECRET", default="onlyoffice-jwt-secret")
ONLYOFFICE_DOCUMENT_SERVER_URL = env(
    "ONLYOFFICE_DOCUMENT_SERVER_URL",
    default="http://localhost:8082/",
)
ONLYOFFICE_PUBLIC_BASE_URL = env(
    "ONLYOFFICE_PUBLIC_BASE_URL",
    default="http://localhost",
)
ONLYOFFICE_ENABLE_PLUGINS = env.bool("ONLYOFFICE_ENABLE_PLUGINS", default=False)


# ========== RAG 检索编排配置 ==========
RETRIEVAL_DEFAULT_MODE = env("RETRIEVAL_DEFAULT_MODE", default="hybrid")
RETRIEVAL_FALLBACK_TO_GLOBAL = env.bool("RETRIEVAL_FALLBACK_TO_GLOBAL", default=True)
MAX_DOC_TITLES_PER_KB = env.int("MAX_DOC_TITLES_PER_KB", default=10)
MAX_DOC_TITLES_TOTAL = env.int("MAX_DOC_TITLES_TOTAL", default=80)
CONTENT_MATRIX_SCENARIO_V2 = env(
    "CONTENT_MATRIX_SCENARIO_V2", default="content_matrix_generation_v2"
)

# ========== 批量生成并发与扩写配置（P2-2 + P2-3）==========
# 批量生成并发数（参考用，实际由 Celery worker --concurrency 决定）
CONTENT_CONCURRENCY = env.int("CONTENT_CONCURRENCY", default=3)
# 单章最低正文字数，不足时触发扩写
MIN_SECTION_WORDS = env.int("MIN_SECTION_WORDS", default=500)
# 扩写最大轮次，达此轮次仍未达标则停止
MAX_EXPAND_ROUNDS = env.int("MAX_EXPAND_ROUNDS", default=2)

# ========== P3 正文增强配置 ==========
# Mermaid 外部渲染服务（mermaid.ink）：GET {URL}/img/{base64(code)} 返回 PNG
MERMAID_RENDER_URL = env("MERMAID_RENDER_URL", default="https://mermaid.ink")
MERMAID_RENDER_TIMEOUT = env.int("MERMAID_RENDER_TIMEOUT", default=30)
# AI 生图模型名（OpenAI 兼容 images.generate），空则只生成 prompt 不调模型
IMAGE_GEN_MODEL = env("IMAGE_GEN_MODEL", default="")

