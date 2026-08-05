"""重置卡在解析中状态的招标文件。

服务重启或 worker 中断后，部分文件状态可能停留在 parsing/chunking。
此命令将这些文件标记为解析失败，使其可以重新上传或重试。

Usage:
    python manage.py reset_stuck_parsing_files [--dry-run]
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.tender.models import TenderFile


class Command(BaseCommand):
    help = "重置卡在解析中状态的招标文件"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="仅显示将被重置的文件，不实际修改",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        # 查找所有卡在解析相关状态的文件
        stuck_statuses = [
            TenderFile.STATUS_PARSING,
            TenderFile.STATUS_CHUNKING,
            TenderFile.STATUS_PARSE_PENDING,
        ]
        stuck_files = TenderFile.objects.filter(status__in=stuck_statuses)

        if not stuck_files.exists():
            self.stdout.write(self.style.SUCCESS("没有卡在解析中的文件"))
            return

        self.stdout.write(f"发现 {stuck_files.count()} 个卡在解析中的文件：")

        now = timezone.now()
        reset_count = 0

        for tf in stuck_files:
            # 检查是否有正在运行的关联任务
            has_running_task = AsyncTask.objects.filter(
                related_object_type="TenderFile",
                related_object_id=str(tf.id),
                status__in=[
                    AsyncTask.STATUS_PENDING,
                    AsyncTask.STATUS_RUNNING,
                    AsyncTask.STATUS_RETRYING,
                ],
            ).exists()

            status_display = tf.get_status_display()
            self.stdout.write(
                f"  - [{tf.id}] {tf.original_name} "
                f"(状态: {status_display}, 有运行中任务: {has_running_task})"
            )

            if not dry_run and not has_running_task:
                tf.status = TenderFile.STATUS_PARSE_FAILED
                tf.error_message = "服务中断后由系统重置，请重新上传或重试解析"
                tf.updated_at = now
                tf.save(update_fields=["status", "error_message", "updated_at"])
                reset_count += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY RUN] 将重置 {reset_count} 个文件"))
        else:
            self.stdout.write(
                self.style.SUCCESS(f"已重置 {reset_count} 个文件为解析失败状态")
            )
