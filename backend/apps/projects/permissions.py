"""项目角色 → 权限集合静态映射（spec §4.4）。

项目角色固定，不做成可配置数据表（YAGNI）。后续业务模块接入时按需扩充，
并在 accounts/permissions_registry.py 注册对应的 project 权限码。
"""

PROJECT_ROLE_PERMISSIONS = {
    "owner": {
        "project.view", "project.update", "project.member.manage",
        "tender.upload", "tender.parse", "outline.edit",
        "section.generate", "section.edit", "section.review",
        "export.create",
    },
    "editor": {
        "project.view", "tender.view", "outline.view",
        "section.generate", "section.edit",
    },
    "reviewer": {
        "project.view", "tender.view", "outline.view",
        "section.view", "section.review",
    },
    "viewer": {
        "project.view", "tender.view", "outline.view",
        "section.view", "export.view",
    },
}
