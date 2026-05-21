"""projects 权限缓存失效信号（spec §4.5）。"""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.accounts.services import permission_service
from apps.projects.models import ProjectMember


@receiver([post_save, post_delete], sender=ProjectMember)
def _on_project_member_changed(sender, instance, **kwargs):
    """ProjectMember 增删改 → 失效该成员在该项目的权限缓存。"""
    permission_service.invalidate_project(instance.user_id, instance.project_id)
