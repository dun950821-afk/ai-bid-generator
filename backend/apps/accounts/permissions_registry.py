"""权限码注册表（spec §4.2.2）。

权限点以「代码内注册表 + 数据迁移」方式种子化，保证代码与数据库一致、可演进。
后续业务模块接入时在 PERMISSION_REGISTRY 追加自身权限点，再跑 sync_permissions。
本模块不导入任何 Django 模型，可安全被数据迁移导入。
"""

GLOBAL = "global"
PROJECT = "project"

# (code, name, module, scope)
PERMISSION_REGISTRY = [
    # ---- 全局权限 ----
    ("project.create", "创建项目", "projects", GLOBAL),
    ("user.manage", "用户管理", "accounts", GLOBAL),
    ("role.manage", "角色管理", "accounts", GLOBAL),
    ("audit.view", "查看审计日志", "audit", GLOBAL),
    ("workflow_template.view", "查看流程模板", "workflows", GLOBAL),
    ("workflow_template.manage", "管理流程模板", "workflows", GLOBAL),
    ("prompt_template.manage", "管理提示词模板", "generation", GLOBAL),
    ("system_settings.manage", "管理系统设置", "system_config", GLOBAL),
    # ---- 知识库权限 ----
    ("knowledge.manage", "管理知识库", "knowledge", GLOBAL),
    # ---- 招标文件权限 ----
    ("tender.manage", "管理招标文件", "tender", GLOBAL),
    # ---- 项目权限 ----
    ("project.view", "查看项目", "projects", PROJECT),
    ("project.update", "编辑项目", "projects", PROJECT),
    ("project.delete", "删除项目", "projects", PROJECT),
    ("project.member.manage", "管理项目成员", "projects", PROJECT),
    ("project.role.manage", "管理项目角色", "projects", PROJECT),
    ("lot.create", "创建标段", "projects", PROJECT),
    ("lot.view", "查看标段", "projects", PROJECT),
    ("lot.update", "编辑标段", "projects", PROJECT),
    ("lot.workflow.operate", "操作工作流", "projects", PROJECT),
    ("tender.view", "查看招标文件", "tender", PROJECT),
    ("tender.upload", "上传招标文件", "tender", PROJECT),
    ("tender.parse", "解析招标文件", "tender", PROJECT),
    ("tender.delete", "删除招标文件", "tender", PROJECT),
    ("outline.view", "查看大纲", "outline", PROJECT),
    ("outline.edit", "编辑大纲", "outline", PROJECT),
    ("section.view", "查看章节", "outline", PROJECT),
    ("section.generate", "生成章节", "outline", PROJECT),
    ("section.edit", "编辑章节", "outline", PROJECT),
    ("section.review", "评审章节", "outline", PROJECT),
    ("export.view", "查看导出", "exporting", PROJECT),
    ("export.create", "创建导出", "exporting", PROJECT),
]


def apply_registry(permission_model):
    """把 PERMISSION_REGISTRY 同步到 Permission 表（幂等）。

    - 注册表中存在的码：创建或更新 name/module/scope，并置 is_active=True。
    - 注册表中不存在、但库中 is_active=True 的码：置 is_active=False（停用，不删除，
      以免破坏历史审计与既有 Role 绑定）。

    permission_model 由调用方传入：数据迁移传 apps.get_model(...) 的历史模型，
    管理命令传真实 Permission 模型。
    """
    registry_codes = set()
    for code, name, module, scope in PERMISSION_REGISTRY:
        registry_codes.add(code)
        permission_model.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "module": module,
                "scope": scope,
                "is_active": True,
            },
        )
    permission_model.objects.exclude(code__in=registry_codes).filter(
        is_active=True
    ).update(is_active=False)
