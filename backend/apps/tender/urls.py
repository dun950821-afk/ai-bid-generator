"""招标文件相关 URL。"""

from django.urls import path

from apps.tender.views import (
    InitUploadView,
    CompleteUploadView,
    DirectUploadView,
    TenderFileListView,
    TenderFileDetailView,
    TenderFileLinkLotView,
    ParsedDocumentDetailView,
    ParsedDocumentByFileView,
    TenderChunkListView,
    TenderChunkDetailView,
    ChunkStatsView,
    PipelineJobListView,
    ParseDebugView,
    ChunkDebugView,
    TenderFileRetryParseView,
    TenderFileReparseView,
    TenderFileParseVersionsView,
    TenderFileActivateVersionView,
)

urlpatterns = [
    # 文件上传
    path("tender/files/upload", DirectUploadView.as_view(), name="tender-direct-upload"),
    path("tender/files/init-upload", InitUploadView.as_view(), name="tender-init-upload"),
    path("tender/files/<int:file_id>/complete-upload", CompleteUploadView.as_view(), name="tender-complete-upload"),

    # 文件管理
    path("tender/files", TenderFileListView.as_view(), name="tender-file-list"),
    path("tender/files/<int:pk>", TenderFileDetailView.as_view(), name="tender-file-detail"),
    path("tender/files/<int:file_id>/link-lot", TenderFileLinkLotView.as_view(), name="tender-link-lot"),
    path("tender/files/<int:file_id>/reparse", TenderFileReparseView.as_view(), name="tender-reparse"),
    path("tender/files/<int:file_id>/retry-parse", TenderFileRetryParseView.as_view(), name="tender-retry-parse"),

    # 解析版本
    path("tender/files/<int:file_id>/parse-versions", TenderFileParseVersionsView.as_view(), name="tender-parse-versions"),
    path("tender/files/<int:file_id>/parse-versions/<int:version_id>/activate", TenderFileActivateVersionView.as_view(), name="tender-activate-version"),

    # 解析文档
    path("tender/parsed-documents/<int:pk>", ParsedDocumentDetailView.as_view(), name="parsed-document-detail"),
    path("tender/files/<int:file_id>/parsed-document", ParsedDocumentByFileView.as_view(), name="parsed-document-by-file"),

    # 分块
    path("tender/parsed-documents/<int:parsed_document_id>/chunks", TenderChunkListView.as_view(), name="chunk-list"),
    path("tender/chunks/<int:pk>", TenderChunkDetailView.as_view(), name="chunk-detail"),
    path("tender/parsed-documents/<int:parsed_document_id>/chunks/stats", ChunkStatsView.as_view(), name="chunk-stats"),

    # 流水线任务
    path("tender/files/<int:file_id>/pipeline-jobs", PipelineJobListView.as_view(), name="pipeline-job-list"),

    # 调试输出
    path("tender/parsed-documents/<int:parsed_document_id>/debug/parse", ParseDebugView.as_view(), name="parse-debug"),
    path("tender/parsed-documents/<int:parsed_document_id>/debug/chunk", ChunkDebugView.as_view(), name="chunk-debug"),
]