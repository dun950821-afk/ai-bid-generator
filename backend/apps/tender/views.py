from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.common.exceptions import NotFound, ValidationError
from apps.projects.models import Project
from apps.tender.models import TenderFile
from apps.tender.serializers import InitUploadSerializer, TenderFileSerializer
from apps.tender.services.upload_service import TenderUploadService


class InitUploadView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def post(self, request):
        serializer = InitUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = TenderUploadService().init_upload(
            project=data["project"],
            lot=data["lot"],
            file_name=data["file_name"],
            file_size=data["file_size"],
            content_type=data.get("content_type", ""),
            file_category=data["file_category"],
            user=request.user,
        )
        return Response(result)


class CompleteUploadView(APIView):
    """完成上传确认；鉴权走 RequirePermission + get_permission_project，不在视图里手写。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = (
            TenderFile.objects.select_related("project")
            .filter(pk=self.kwargs.get("file_id"))
            .first()
        )
        return tender_file.project if tender_file else None

    def post(self, request, file_id):
        try:
            tender_file = TenderFile.objects.select_related("project", "lot", "parse_task").get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        return Response(TenderUploadService().complete_upload(tender_file=tender_file, user=request.user))


class TenderFileListView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        return Project.objects.filter(pk=request.query_params.get("project_id")).first()

    def get(self, request):
        project_id = request.query_params.get("project_id")
        if not project_id:
            raise ValidationError(message="缺少 project_id")
        qs = TenderFile.objects.filter(project_id=project_id).order_by("-created_at")
        return Response(TenderFileSerializer(qs, many=True).data)
