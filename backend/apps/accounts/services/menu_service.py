"""菜单树服务（spec §5.2 登录响应 menu_tree）。

菜单按全局权限过滤：permission 为 None 的项始终可见，
否则要求登录用户的全局权限集合包含该权限码。
"""

MENU_DEFINITION = [
    {"key": "dashboard", "title": "工作台", "icon": "Odometer",
     "route": "/dashboard", "permission": None},
    {"key": "projects", "title": "项目管理", "icon": "Folder",
     "route": "/projects", "permission": None},
    {"key": "templates", "title": "流程模板", "icon": "Operation",
     "route": "/workflows/templates", "permission": None},
    {"key": "knowledge", "title": "知识库管理", "icon": "FolderOpened",
     "route": "/knowledge", "permission": "knowledge.manage"},
    {"key": "users", "title": "用户管理", "icon": "User",
     "route": "/admin/users", "permission": "user.manage"},
    {"key": "roles", "title": "角色权限", "icon": "Lock",
     "route": "/admin/roles", "permission": "role.manage"},
    {"key": "prompts", "title": "提示词管理", "icon": "EditPen",
     "route": "/admin/prompts", "permission": "prompt_template.manage"},
    {"key": "audit", "title": "操作审计", "icon": "Document",
     "route": "/admin/audit", "permission": "audit.view"},
]


def build_menu_tree(global_permissions, definition=MENU_DEFINITION):
    """根据全局权限集合构造前端菜单列表。"""
    perms = set(global_permissions)
    tree = []
    for item in definition:
        required = item["permission"]
        if required is not None and required not in perms:
            continue
        tree.append({
            "key": item["key"],
            "title": item["title"],
            "icon": item["icon"],
            "route": item["route"],
        })
    return tree
