# -*- coding: utf-8 -*-
"""响应模板 URL。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.response_template.views import (
    ResponseDocumentViewSet,
    ResponseTemplateBlockViewSet,
    ResponseTemplateViewSet,
)
from apps.response_template.views_onlyoffice_callback import (
    onlyoffice_response_callback,
)

router = DefaultRouter()
router.register(r"response-templates", ResponseTemplateViewSet, basename="response-template")
router.register(r"response-template-blocks", ResponseTemplateBlockViewSet, basename="response-template-block")
router.register(r"response-documents", ResponseDocumentViewSet, basename="response-document")

urlpatterns = router.urls + [
    path(
        "onlyoffice/callback/response/<int:document_id>/",
        onlyoffice_response_callback,
        name="onlyoffice-response-callback",
    ),
]
