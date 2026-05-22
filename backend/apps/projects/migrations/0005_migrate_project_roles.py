# Generated data migration for ProjectRole

from django.db import migrations


def create_builtin_roles_and_migrate_members(apps, schema_editor):
    """创建内置角色并迁移现有成员的角色关联。"""
    Project = apps.get_model("projects", "Project")
    ProjectRole = apps.get_model("projects", "ProjectRole")
    User = apps.get_model("accounts", "User")

    # 内置角色配置
    BUILTIN_ROLES = [
        {"code": "owner", "name": "负责人", "permissions": ["project.view", "project.update", "project.delete", "project.member.manage", "project.role.manage", "lot.create", "lot.view", "lot.update", "lot.workflow.operate", "tender.view", "tender.upload", "tender.parse", "outline.view", "outline.edit", "section.view", "section.generate", "section.edit", "section.review", "export.create", "export.view"]},
        {"code": "editor", "name": "编辑", "permissions": ["project.view", "lot.view", "lot.workflow.operate", "tender.view", "tender.upload", "outline.view", "outline.edit", "section.view", "section.generate", "section.edit"]},
        {"code": "reviewer", "name": "评审", "permissions": ["project.view", "lot.view", "tender.view", "outline.view", "section.view", "section.review"]},
        {"code": "viewer", "name": "只读", "permissions": ["project.view", "lot.view", "tender.view", "outline.view", "section.view", "export.view"]},
    ]

    # 为每个项目创建内置角色
    for project in Project.objects.all():
        for role_config in BUILTIN_ROLES:
            ProjectRole.objects.create(
                project=project,
                code=role_config["code"],
                name=role_config["name"],
                permissions=role_config["permissions"],
                is_builtin=True,
            )

    # 迁移现有成员的角色
    ProjectMember = apps.get_model("projects", "ProjectMember")

    role_mapping = {
        "owner": "owner",
        "editor": "editor",
        "reviewer": "reviewer",
        "viewer": "viewer",
    }

    for member in ProjectMember.objects.all():
        old_role = member.project_role  # 此时还是字符串
        if old_role in role_mapping:
            role = ProjectRole.objects.get(
                project_id=member.project_id,
                code=role_mapping[old_role]
            )
            member.project_role = role
            member.save()


def reverse_migration(apps, schema_editor):
    """回滚迁移。"""
    ProjectRole = apps.get_model("projects", "ProjectRole")
    ProjectRole.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0004_add_project_role_and_refactor"),
    ]

    operations = [
        migrations.RunPython(create_builtin_roles_and_migrate_members, reverse_migration),
    ]
