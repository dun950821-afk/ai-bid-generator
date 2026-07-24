"""健康检查相关视图。"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.system_config.services.health_service import HealthCheckService
from apps.system_config.services.probe_service import ProbeService


class HealthCheckView(APIView):
    """获取系统配置健康状态。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        """返回 5 项配置状态 + 总分 + Mock 告警。"""
        service = HealthCheckService()
        result = service.get_health_status(use_cache=True)
        return Response(result)


class HealthDiagnoseView(APIView):
    """一键诊断：对所有已配置项做真实探针。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request):
        """触发完整探针，不走缓存。"""
        service = HealthCheckService()
        result = service.diagnose()
        return Response(result)


class TestConnectionView(APIView):
    """测试连接：对单个 provider 做真实探针。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request):
        """测试单个 provider + key + model 是否可用。

        Request body:
            provider_type: deepseek/bailian/openai（mock 拒绝）
            base_url: Provider base URL
            api_key: API key
            model_name: 模型名
            test_kind: chat / embedding
        """
        provider_type = request.data.get("provider_type")
        base_url = request.data.get("base_url", "")
        api_key = request.data.get("api_key", "")
        model_name = request.data.get("model_name", "")
        test_kind = request.data.get("test_kind", "chat")

        if not provider_type:
            return Response(
                {"detail": "provider_type 必填"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = ProbeService()
        if test_kind == "chat":
            result = service.probe_chat(provider_type, base_url, api_key, model_name)
        else:
            result = service.probe_embedding(provider_type, base_url, api_key, model_name)

        return Response({
            "ok": result.ok,
            "latency_ms": result.latency_ms,
            "detail": result.detail,
            "error_code": result.error_code,
            "models_sample": result.models_sample,
        })
