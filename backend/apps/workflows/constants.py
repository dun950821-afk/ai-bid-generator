# backend/apps/workflows/constants.py
"""工作流常量。"""


# ============================================================================
# 状态迁移表
# ============================================================================

STATE_TRANSITIONS = {
    'pending': ['start', 'skip'],
    'running': ['complete', 'fail'],
    'failed': ['retry'],
    'waiting_approval': ['approve', 'reject'],
    'completed': [],
    'skipped': [],
    'blocked': ['unblock', 'skip'],  # 预留
}


# ============================================================================
# 节点视觉类型
# ============================================================================

class NodeVisualType:
    """节点视觉类型。"""

    DATA = 'data'           # 数据处理
    APPROVAL = 'approval'   # 审批决策
    AI = 'ai'               # AI 编排
    MANUAL = 'manual'       # 手动操作
    SYSTEM = 'system'       # 系统执行

    CHOICES = [
        (DATA, "数据处理"),
        (APPROVAL, "审批决策"),
        (AI, "AI 编排"),
        (MANUAL, "手动操作"),
        (SYSTEM, "系统执行"),
    ]


# ============================================================================
# 节点类型到视觉类型映射
# ============================================================================

NODE_TYPE_TO_VISUAL = {
    'upload': NodeVisualType.MANUAL,
    'parse': NodeVisualType.DATA,
    'chunk': NodeVisualType.DATA,
    'requirement_extract': NodeVisualType.DATA,
    'prompt_run': NodeVisualType.AI,
    'outline_generate': NodeVisualType.AI,
    'section_write': NodeVisualType.AI,
    'approval': NodeVisualType.APPROVAL,
    'export': NodeVisualType.SYSTEM,
}