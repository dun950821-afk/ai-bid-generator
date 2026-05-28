"""系统配置 URL。"""

from django.urls import path

from apps.system_config.views import (
    SystemSettingView,
    StorageConfigListView,
    StorageConfigDetailView,
    StorageConfigSetDefaultView,
    StorageConfigTestView,
    CorsConfigGenerateView,
    SystemConfigOverviewView,
    EmbeddingConfigListView,
    EmbeddingConfigDetailView,
    EmbeddingConfigSetDefaultView,
    EmbeddingConfigTestView,
    RagSettingsView,
)

urlpatterns = [
    path("system-config/overview/", SystemConfigOverviewView.as_view(), name="system-config-overview"),
    path("system-config/settings/", SystemSettingView.as_view(), name="system-config-settings"),

    # Embedding 配置
    path("system-config/embedding-configs/", EmbeddingConfigListView.as_view(), name="embedding-config-list"),
    path("system-config/embedding-configs/<int:pk>/", EmbeddingConfigDetailView.as_view(), name="embedding-config-detail"),
    path("system-config/embedding-configs/<int:pk>/set-default/", EmbeddingConfigSetDefaultView.as_view(), name="embedding-config-set-default"),
    path("system-config/embedding-configs/<int:pk>/test/", EmbeddingConfigTestView.as_view(), name="embedding-config-test"),

    # RAG 设置
    path("system-config/rag-settings/", RagSettingsView.as_view(), name="rag-settings"),

    # 存储配置
    path("system-config/storage-configs/", StorageConfigListView.as_view(), name="storage-config-list"),
    path("system-config/storage-configs/<int:pk>/", StorageConfigDetailView.as_view(), name="storage-config-detail"),
    path("system-config/storage-configs/<int:pk>/set-default/", StorageConfigSetDefaultView.as_view(), name="storage-config-set-default"),
    path("system-config/storage-configs/<int:pk>/test/", StorageConfigTestView.as_view(), name="storage-config-test"),
    path("system-config/storage-configs/<int:pk>/cors/generate/", CorsConfigGenerateView.as_view(), name="cors-config-generate"),
]
