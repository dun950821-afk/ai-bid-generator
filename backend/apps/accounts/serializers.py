# backend/apps/accounts/serializers.py
"""accounts 应用的 DRF 序列化器。"""
from rest_framework import serializers

from apps.accounts.models import User, Role, Permission


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


class MeUpdateSerializer(serializers.ModelSerializer):
    """本人资料更新（PATCH /api/auth/me）；字段全部可选，不涉及账号/角色。"""

    class Meta:
        model = User
        fields = ["real_name", "email", "phone", "department"]
        extra_kwargs = {
            "real_name": {"required": False, "allow_blank": True},
            "email": {"required": False, "allow_blank": True},
            "phone": {"required": False, "allow_blank": True},
            "department": {"required": False, "allow_blank": True},
        }


class UserListSerializer(serializers.ModelSerializer):
    """用户列表序列化器。"""

    roles = serializers.SerializerMethodField()

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
            "roles",
            "last_login",
            "created_at",
        ]

    def get_roles(self, obj):
        return [{"id": r.id, "code": r.code, "name": r.name} for r in obj.roles.all()]


class UserCreateSerializer(serializers.ModelSerializer):
    """用户创建序列化器。"""

    password = serializers.CharField(write_only=True, required=False, min_length=8)
    role_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False, default=list)

    class Meta:
        model = User
        fields = [
            "username",
            "real_name",
            "email",
            "phone",
            "department",
            "password",
            "role_ids",
        ]

    def create(self, validated_data):
        role_ids = validated_data.pop("role_ids", [])
        password = validated_data.pop("password", None)

        user = User.objects.create_user(**validated_data)
        if password:
            user.set_password(password)
        else:
            # 无密码时设置随机临时密码，强制首次改密
            import secrets
            user.set_password(secrets.token_urlsafe(9))
            user.must_change_password = True
        user.save()

        if role_ids:
            user.roles.set(role_ids)

        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """用户更新序列化器。"""

    role_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            "real_name",
            "email",
            "phone",
            "department",
            "is_active",
            "role_ids",
        ]

    def update(self, instance, validated_data):
        role_ids = validated_data.pop("role_ids", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if role_ids is not None:
            instance.roles.set(role_ids)

        return instance


class RoleSerializer(serializers.ModelSerializer):
    """角色序列化器。"""

    permissions = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id",
            "code",
            "name",
            "description",
            "is_system",
            "permissions",
            "user_count",
            "created_at",
        ]

    def get_permissions(self, obj):
        return [p.code for p in obj.permissions.all()]

    def get_user_count(self, obj):
        return obj.users.count()


class RoleCreateSerializer(serializers.ModelSerializer):
    """角色创建序列化器。"""

    permission_codes = serializers.ListField(child=serializers.CharField(), write_only=True, required=False, default=list)

    class Meta:
        model = Role
        fields = [
            "code",
            "name",
            "description",
            "permission_codes",
        ]

    def create(self, validated_data):
        permission_codes = validated_data.pop("permission_codes", [])
        role = Role.objects.create(**validated_data)

        if permission_codes:
            perms = Permission.objects.filter(code__in=permission_codes, is_active=True)
            role.permissions.set(perms)

        return role


class RoleUpdateSerializer(serializers.ModelSerializer):
    """角色更新序列化器。"""

    permission_codes = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)

    class Meta:
        model = Role
        fields = [
            "name",
            "description",
            "permission_codes",
        ]

    def update(self, instance, validated_data):
        permission_codes = validated_data.pop("permission_codes", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if permission_codes is not None:
            perms = Permission.objects.filter(code__in=permission_codes, is_active=True)
            instance.permissions.set(perms)

        return instance


class PermissionSerializer(serializers.ModelSerializer):
    """权限序列化器。"""

    class Meta:
        model = Permission
        fields = [
            "id",
            "code",
            "name",
            "module",
            "scope",
            "description",
            "is_active",
        ]


class PermissionTreeSerializer(serializers.Serializer):
    """权限树序列化器（按模块分组）。"""

    module = serializers.CharField()
    name = serializers.CharField()
    permissions = PermissionSerializer(many=True)


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