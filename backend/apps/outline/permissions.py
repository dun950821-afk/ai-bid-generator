# backend/apps/outline/permissions.py
"""大纲模块权限定义。"""

OUTLINE_PERMISSIONS = [
    ("outline.view", "查看大纲"),
    ("outline.manage", "管理大纲（创建/编辑/删除）"),
    ("section.view", "查看章节"),
    ("section.manage", "管理章节（新增/移动/删除）"),
    ("section.generate", "生成章节内容"),
    ("section.review", "审核章节"),
]
