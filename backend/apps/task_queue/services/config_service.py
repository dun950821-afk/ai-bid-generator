"""队列参数配置服务。

后端写死的失效/回收机制参数注册表：DB 行优先，注册表默认值兜底。
读取带 Django cache（单 key 全量 + 30s TTL），PATCH 保存后失效缓存。
"""

import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)

CACHE_KEY = "task_queue_config_all"
CACHE_TTL = 30

# 参数定义：default 为代码默认值（与各业务模块原有写死值保持一致），
# needs_restart=True 表示修改需重启 worker 才生效（进程级 celery 配置）。
CONFIG_DEFINITIONS = [
    {
        "key": "stale_task_grace_minutes",
        "label": "僵尸任务回收宽限期",
        "default": 60,
        "min": 1,
        "max": 1440,
        "needs_restart": False,
        "unit": "分钟",
        "description": "超过该时长仍 running 的任务视为僵尸任务，由定时回收标记失败并释放关联状态",
    },
    {
        "key": "reconcile_interval_seconds",
        "label": "僵尸任务回收调度间隔",
        "default": 600,
        "min": 60,
        "max": 86400,
        "needs_restart": False,
        "unit": "秒",
        "description": "定时回收任务的执行间隔（beat 每 60 秒触发一次，任务内部门控按此间隔执行）",
    },
    {
        "key": "batch_section_max_retries",
        "label": "正文生成瞬时错误重试次数",
        "default": 2,
        "min": 0,
        "max": 10,
        "needs_restart": False,
        "unit": "次",
        "description": "批量正文生成子任务遇数据库瞬时错误时的自动重试上限",
    },
    {
        "key": "matrix_generation_batch_size",
        "label": "矩阵生成每批章节数",
        "default": 10,
        "min": 1,
        "max": 100,
        "needs_restart": False,
        "unit": "章/批",
        "description": "矩阵生成每批次章节数量，越大单次 AI 调用越慢",
    },
    {
        "key": "matrix_lock_timeout_seconds",
        "label": "矩阵生成锁超时",
        "default": 1800,
        "min": 60,
        "max": 7200,
        "needs_restart": False,
        "unit": "秒",
        "description": "矩阵生成互斥锁的 Redis TTL，超时自动释放",
    },
    {
        "key": "refine_outline_timeout_seconds",
        "label": "目录完善任务超时",
        "default": 600,
        "min": 300,
        "max": 21600,
        "needs_restart": False,
        "unit": "秒",
        "description": "按建议完善目录（重新生成+审核）的超时上限，超时中止任务并提示用户",
    },
    {
        "key": "celery_task_time_limit_seconds",
        "label": "Celery 任务硬时限",
        "default": 3000,
        "min": 300,
        "max": 21600,
        "needs_restart": True,
        "unit": "秒",
        "description": "Celery 全局任务硬时限（超时 SIGKILL），修改后需重启 worker 生效",
    },
    {
        "key": "celery_task_soft_time_limit_seconds",
        "label": "Celery 任务软时限",
        "default": 2700,
        "min": 300,
        "max": 21600,
        "needs_restart": True,
        "unit": "秒",
        "description": "Celery 全局任务软时限（超时抛 SoftTimeLimitExceeded），修改后需重启 worker 生效",
    },
]

_KEY_MAP = {d["key"]: d for d in CONFIG_DEFINITIONS}


def get_all_task_configs() -> dict:
    """返回 {key: 当前生效值}，DB 行优先，注册表默认值兜底。30s 缓存。"""
    cached = cache.get(CACHE_KEY)
    if cached is not None:
        return cached

    from apps.task_queue.models import TaskQueueConfig

    db_values = dict(
        TaskQueueConfig.objects.exclude(value=None).values_list("key", "value")
    )
    result = {
        key: db_values.get(key, definition["default"])
        for key, definition in _KEY_MAP.items()
    }
    cache.set(CACHE_KEY, result, CACHE_TTL)
    return result


def get_task_config(key: str) -> int:
    """读取单个参数值（未注册的 key 返回 None）。"""
    return get_all_task_configs().get(key)


def invalidate_config_cache() -> None:
    cache.delete(CACHE_KEY)


def get_config_definitions() -> list[dict]:
    """前端配置列表（含当前生效值/是否已配置）。"""
    configs = get_all_task_configs()
    result = []
    for definition in CONFIG_DEFINITIONS:
        key = definition["key"]
        row = dict(definition)
        row["value"] = configs[key]
        result.append(row)
    return result


def save_config_values(values: dict, *, user) -> dict:
    """批量保存参数值，逐项校验类型与范围；返回校验错误 {key: 错误信息}。"""
    from apps.task_queue.models import TaskQueueConfig

    errors = {}
    valid = {}
    for key, value in values.items():
        definition = _KEY_MAP.get(key)
        if definition is None:
            errors[key] = "未知参数"
            continue
        if not isinstance(value, int) or isinstance(value, bool):
            errors[key] = "必须是整数"
            continue
        if value < definition["min"] or value > definition["max"]:
            errors[key] = f"必须在 {definition['min']}~{definition['max']} 之间"
            continue
        valid[key] = value

    for key, value in valid.items():
        TaskQueueConfig.objects.update_or_create(
            key=key,
            defaults={"value": value, "updated_by": user},
        )

    if valid:
        invalidate_config_cache()
    return errors
