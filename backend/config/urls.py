"""根 URLConf。"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.projects.urls")),
    path("api/", include("apps.common.urls")),
    path("api/", include("apps.tender.urls")),
    path("api/", include("apps.workflows.urls")),
]
