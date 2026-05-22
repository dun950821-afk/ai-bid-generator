"""accounts 应用的 DRF 序列化器。"""
from rest_framework import serializers

from apps.accounts.models import User


class UserSerializer(serializers.ModelSerializer):
    """用户信息（登录响应、me 接口）；全部字段只读。"""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "real_name",
            "email",
            "phone",
            "department",
            "is_active",
            "must_change_password",
            "last_login",
        ]
        read_only_fields = fields


class LoginSerializer(serializers.Serializer):
    """登录请求体。

    captcha_token / captcha_answer 仅在 login_throttle L3 软触发后由前端
    带上；正常登录场景两字段缺省即可，不强制要求每次都填。
    """

    username = serializers.CharField()
    password = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )
    captcha_token = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    captcha_answer = serializers.CharField(
        required=False, allow_blank=True, default=""
    )


class ChangePasswordSerializer(serializers.Serializer):
    """修改密码请求体；校验需通过 context 传入当前 user。"""

    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["user"]
        if not user.check_password(value):
            raise serializers.ValidationError("原密码不正确")
        return value

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        validate_password(value, user=self.context.get("user"))
        return value
