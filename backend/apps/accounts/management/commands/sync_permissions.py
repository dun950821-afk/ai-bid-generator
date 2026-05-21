"""把权限码注册表同步到 Permission 表（幂等）。"""
from django.core.management.base import BaseCommand

from apps.accounts.models import Permission
from apps.accounts.permissions_registry import apply_registry


class Command(BaseCommand):
    help = "把 PERMISSION_REGISTRY 同步到 Permission 表"

    def handle(self, *args, **options):
        apply_registry(Permission)
        count = Permission.objects.filter(is_active=True).count()
        self.stdout.write(self.style.SUCCESS(f"权限同步完成，当前启用 {count} 项"))
