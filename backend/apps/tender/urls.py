from django.urls import path

from apps.tender.views import CompleteUploadView, InitUploadView, TenderFileListView

urlpatterns = [
    path("tender/files/init-upload", InitUploadView.as_view(), name="tender-init-upload"),
    path("tender/files/<int:file_id>/complete-upload", CompleteUploadView.as_view(), name="tender-complete-upload"),
    path("tender/files", TenderFileListView.as_view(), name="tender-file-list"),
]
