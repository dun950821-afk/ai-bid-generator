"""accounts 权限缓存失效信号（spec §4.5）。"""
from django.contrib.auth import get_user_model
from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from apps.accounts.models import Role
from apps.accounts.services import permission_service

User = get_user_model()

_M2M_ACTIONS = ("post_add", "post_remove", "post_clear")


@receiver(m2m_changed, sender=User.roles.through)
def _on_user_roles_changed(sender, instance, action, pk_set, **kwargs):
    """User.roles 变更 → 失效相关用户的全局权限缓存。"""
    if action not in _M2M_ACTIONS:
        return
    if isinstance(instance, User):
        permission_service.invalidate_global(instance.pk)
    else:  # instance 为 Role（role.users.add/remove 这一侧）
        for user_id in pk_set or []:
            permission_service.invalidate_global(user_id)


@receiver(m2m_changed, sender=Role.permissions.through)
def _on_role_permissions_changed(sender, instance, action, **kwargs):
    """Role.permissions 变更 → 失效该角色全部用户的全局权限缓存。"""
    if action not in _M2M_ACTIONS:
        return
    if isinstance(instance, Role):
        user_ids = list(instance.users.values_list("pk", flat=True))
    else:  # instance 为 Permission（permission.roles.add/remove 这一侧）
        user_ids = list(
            User.objects.filter(roles__permissions=instance)
            .values_list("pk", flat=True)
            .distinct()
        )
    for user_id in user_ids:
        permission_service.invalidate_global(user_id)
