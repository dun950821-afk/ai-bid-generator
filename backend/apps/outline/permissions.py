# backend/apps/outline/permissions.py
"""大纲模块权限定义。

注意：权限码需要与 accounts/permissions_registry.py 保持一致。
"""

OUTLINE_PERMISSIONS = [
    ("outline.view", "查看大纲"),
    ("outline.edit", "编辑大纲"),
    ("section.view", "查看章节"),
    ("section.edit", "编辑章节"),
    ("section.generate", "生成章节"),
    ("section.review", "评审章节"),
]
