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
