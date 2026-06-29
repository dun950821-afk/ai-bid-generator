"""项目序列化器。"""
from rest_framework import serializers
from apps.projects.models import Project, ProjectRole, ProjectMember


class ProjectSerializer(serializers.ModelSerializer):
    """项目序列化器。"""

    created_by_name = serializers.CharField(source="created_by.real_name", read_only=True)
    member_count = serializers.SerializerMethodField()
    lot_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id", "name", "description", "status",
            "created_by", "created_by_name",
            "member_count", "lot_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_lot_count(self, obj):
        return obj.lots.count()


class ProjectCreateSerializer(serializers.Serializer):
    """创建项目序列化器。"""

    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    workflow_template_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    initial_members = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )


class ProjectListSerializer(serializers.ModelSerializer):
    """项目列表序列化器（含聚合信息）。"""

    created_by_name = serializers.CharField(source="created_by.real_name", read_only=True)
    lot_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Project
        fields = [
            "id", "name", "status",
            "created_by_name", "lot_count",
            "created_at",
        ]


class ProjectRoleSerializer(serializers.ModelSerializer):
    """项目角色序列化器。"""

    member_count = serializers.SerializerMethodField()

    class Meta:
        model = ProjectRole
        fields = [
            "id", "name", "code", "permissions",
            "is_builtin", "member_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_builtin", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return obj.members.count()


class ProjectRoleUpdateSerializer(serializers.ModelSerializer):
    """更新角色权限序列化器。"""

    class Meta:
        model = ProjectRole
        fields = ["permissions"]


class ProjectMemberSerializer(serializers.ModelSerializer):
    """项目成员序列化器。"""

    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    real_name = serializers.CharField(source="user.real_name", read_only=True)
    role_name = serializers.CharField(source="project_role.name", read_only=True)
    role_code = serializers.CharField(source="project_role.code", read_only=True)

    class Meta:
        model = ProjectMember
        fields = [
            "id", "user_id", "username", "real_name",
            "project_role", "role_name", "role_code",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ProjectMemberCreateSerializer(serializers.Serializer):
    """添加成员序列化器。"""

    user_id = serializers.IntegerField()
    role_id = serializers.IntegerField()


class ProjectMemberUpdateSerializer(serializers.Serializer):
    """更新成员角色序列化器。"""

    role_id = serializers.IntegerField()


class LotSerializer(serializers.Serializer):
    """标段序列化器。"""

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(max_length=255)
    code = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    project = serializers.PrimaryKeyRelatedField(read_only=True)
    status = serializers.CharField(read_only=True)
    workflow_status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    # 工作台进度（概览看板用，由视图层注入）
    current_step = serializers.CharField(read_only=True, required=False)
    step_summary = serializers.DictField(read_only=True, required=False)
