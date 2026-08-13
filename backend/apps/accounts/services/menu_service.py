"""菜单树服务（spec §5.2 登录响应 menu_tree）。

菜单按全局权限过滤：
- permission 为 None：始终可见
- permission 为字符串：要求用户全局权限包含该权限码
- permissions 为列表：用户拥有其中任意一个即可见

支持分组结构：
- 业务管理：项目、流程、企业资料中心、知识库
- 系统管理：用户、角色、提示词、审计、设置
"""

MENU_DEFINITION = [
    # ---- 工作台（始终可见）----
    {"key": "dashboard", "title": "工作台", "icon": "Odometer",
     "route": "/dashboard", "permission": None, "group": None},

    # ---- 业务管理 ----
    {"key": "projects", "title": "项目管理", "icon": "Folder",
     "route": "/projects", "permission": None, "group": "业务管理"},
    {"key": "bid-templates", "title": "标书模板", "icon": "Collection",
     "route": "/bid-templates", "permission": "bid_template.view", "group": "业务管理"},
    {"key": "response-templates", "title": "响应模板", "icon": "DocumentCopy",
     "route": "/response-templates", "permission": "response_template.manage", "group": "业务管理"},
    {"key": "templates", "title": "流程模板", "icon": "Operation",
     "route": "/workflows/templates", "permission": None, "group": "业务管理"},
    {"key": "enterprise", "title": "企业资料中心", "icon": "OfficeBuilding",
     "route": "/enterprise",
     "permissions": ["enterprise.manage_company", "enterprise.manage_material",
                     "enterprise.manage_material_package", "enterprise.download_sensitive_material"],
     "group": "业务管理"},
    {"key": "knowledge", "title": "知识库管理", "icon": "Notebook",
     "route": "/knowledge", "permission": "knowledge.manage", "group": "业务管理"},

    # ---- 系统管理 ----
    {"key": "users", "title": "用户管理", "icon": "User",
     "route": "/admin/users", "permission": "user.manage", "group": "系统管理"},
    {"key": "roles", "title": "角色权限", "icon": "Lock",
     "route": "/admin/roles", "permission": "role.manage", "group": "系统管理"},
    {"key": "prompts", "title": "提示词管理", "icon": "EditPen",
     "route": "/admin/prompts", "permission": "prompt_template.manage", "group": "系统管理"},
    {"key": "audit", "title": "操作审计", "icon": "Document",
     "route": "/admin/audit", "permission": "audit.view", "group": "系统管理"},
    {"key": "settings", "title": "系统设置", "icon": "Setting",
     "route": "/admin/settings", "permission": "system_settings.manage", "group": "系统管理"},
    {"key": "queue", "title": "队列管理", "icon": "Timer",
     "route": "/admin/queue", "permission": "queue.manage", "group": "系统管理"},
]

MENU_GROUPS = [
    {"key": None, "title": ""},  # 工作台不显示分组标题
    {"key": "业务管理", "title": "业务管理"},
    {"key": "系统管理", "title": "系统管理"},
]


def _item_visible(item, perms):
    """判断菜单项是否对当前用户可见。"""
    # permissions 列表：任一满足即可见
    required_list = item.get("permissions")
    if required_list:
        return any(p in perms for p in required_list)
    # 单个 permission
    required = item.get("permission")
    if required is None:
        return True
    return required in perms


def build_menu_tree(global_permissions, definition=MENU_DEFINITION):
    """根据全局权限集合构造前端菜单列表（分组结构）。"""
    perms = set(global_permissions)
    groups = {}

    for item in definition:
        if not _item_visible(item, perms):
            continue

        group_key = item.get("group")
        if group_key not in groups:
            groups[group_key] = []

        groups[group_key].append({
            "key": item["key"],
            "title": item["title"],
            "icon": item["icon"],
            "route": item["route"],
        })

    # 按预定义顺序输出分组
    tree = []
    for group_info in MENU_GROUPS:
        group_key = group_info["key"]
        if group_key in groups and groups[group_key]:
            tree.append({
                "group": group_key,
                "groupTitle": group_info["title"],
                "items": groups[group_key],
            })

    return tree
