# -*- coding: utf-8 -*-
"""响应模板 URL。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.response_template.views import (
    ResponseTemplateBlockViewSet,
    ResponseTemplateViewSet,
)

router = DefaultRouter()
router.register(r"response-templates", ResponseTemplateViewSet, basename="response-template")
router.register(r"response-template-blocks", ResponseTemplateBlockViewSet, basename="response-template-block")

urlpatterns = router.urls
