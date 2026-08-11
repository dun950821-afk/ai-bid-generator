# backend/apps/outline/services/template/template_variable_registry.py
"""模板变量注册中心（方案 §9/§10/§11）。

模板内部使用 Content Control Tag 作为机器标识，统一格式：
    bid.<type>:<key>

- bid.var:project.name       → 普通变量，编译为 {{ project.name }}
- bid.slot:body              → 正文插槽，编译为段落级 {{p body }}
- bid.material:<usage_key>   → 企业材料（图片/附件）
- bid.image:company.logo     → 图片变量

新增变量只需在对应 Provider 的 VARIABLES 里追加定义，
Renderer / Validator / 前端变量面板都从这里取数，不散落各处。
"""

from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional

TAG_PREFIX = "bid."

# 控件类型
CONTROL_VAR = "var"
CONTROL_SLOT = "slot"
CONTROL_IMAGE = "image"
CONTROL_MATERIAL = "material"


@dataclass(frozen=True)
class TemplateVariableDefinition:
    """模板变量定义（方案 §9 结构）。"""

    key: str  # company.name / body
    name: str  # 企业名称（面板显示名）
    category: str  # project/company/tender/system/document/special
    category_name: str  # 面板分组显示名
    data_type: str = "string"  # string/date/image/slot
    source: str = ""  # 数据来源说明，如 CompanyProfile.name
    required: bool = False
    example: str = ""  # 示例值（测试渲染用）
    description: str = ""
    control_type: str = CONTROL_VAR  # var/slot/image/material

    @property
    def control_tag(self) -> str:
        """写入 Word Content Control 的 Tag。"""
        if self.control_type == CONTROL_SLOT:
            return f"bid.slot:{self.key}"
        if self.control_type == CONTROL_IMAGE:
            return f"bid.image:{self.key}"
        if self.control_type == CONTROL_MATERIAL:
            return f"bid.material:{self.key}"
        return f"bid.var:{self.key}"

    def to_dict(self) -> dict:
        data = asdict(self)
        data["control_tag"] = self.control_tag
        return data


# ---------------------------------------------------------------------------
# 变量 Provider（方案 §9）：按数据来源分组
# ---------------------------------------------------------------------------


class ProjectVariableProvider:
    """项目信息（projects.Project / Lot）。"""

    category = "project"
    category_name = "项目信息"

    VARIABLES = [
        ("project.name", "项目名称", "Project.name", True, "某某银行核心系统建设项目"),
        ("project.code", "项目编号", "Project.code", False, "ZB-2026-001"),
        ("project.package_name", "标段名称", "Lot.name", False, "标段一"),
        ("project.package_no", "标段编号", "Lot.code", False, "01"),
        ("project.tenderer", "招标人", "Lot.tenderer", False, "某某银行股份有限公司"),
        ("project.agent", "招标代理机构", "Lot.agent", False, "某某招标代理有限公司"),
        ("project.bid_deadline", "投标截止时间", "Lot.bid_deadline", False, "2026-09-01 09:30"),
        ("project.contact_name", "联系人", "Lot.contact_name", False, "张三"),
        ("project.contact_phone", "联系电话", "Lot.contact_phone", False, "0571-88888888"),
    ]

    @classmethod
    def get_variables(cls) -> List[TemplateVariableDefinition]:
        return [
            TemplateVariableDefinition(
                key=key,
                name=name,
                category=cls.category,
                category_name=cls.category_name,
                source=source,
                required=required,
                example=example,
            )
            for key, name, source, required, example in cls.VARIABLES
        ]


class CompanyVariableProvider:
    """企业信息（enterprise.CompanyProfile 直接映射）。"""

    category = "company"
    category_name = "企业信息"

    VARIABLES = [
        ("company.name", "企业名称", "CompanyProfile.name", True, "某某科技有限公司"),
        ("company.credit_code", "统一社会信用代码", "CompanyProfile.unified_social_credit_code", False, "91330100MA0000000X"),
        ("company.legal_representative", "法定代表人", "CompanyProfile.legal_representative", False, "李四"),
        ("company.registered_capital", "注册资本", "CompanyProfile.registered_capital", False, "5000万元"),
        ("company.established_date", "成立日期", "CompanyProfile.established_date", False, "2010-01-01"),
        ("company.address", "注册地址", "CompanyProfile.registered_address", False, "杭州市西湖区……"),
        ("company.phone", "联系电话", "CompanyProfile.official_phone", False, "0571-66666666"),
        ("company.email", "邮箱", "CompanyProfile.official_email", False, "bid@example.com"),
        ("company.bank_name", "开户银行", "CompanyProfile.bank_name", False, "中国银行某某支行"),
        ("company.bank_account", "银行账号", "CompanyProfile.bank_account", False, "377600000000000"),
    ]

    @classmethod
    def get_variables(cls) -> List[TemplateVariableDefinition]:
        return [
            TemplateVariableDefinition(
                key=key,
                name=name,
                category=cls.category,
                category_name=cls.category_name,
                source=source,
                required=required,
                example=example,
            )
            for key, name, source, required, example in cls.VARIABLES
        ]


class SystemVariableProvider:
    """系统变量（导出时由系统生成）。"""

    category = "system"
    category_name = "系统变量"

    VARIABLES = [
        ("system.export_date", "生成日期", "导出时的日期", False, "2026-08-11"),
        ("system.export_datetime", "生成时间", "导出时的日期时间", False, "2026-08-11 14:30:00"),
        ("system.year", "当前年份", "", False, "2026"),
        ("system.month", "当前月份", "", False, "08"),
        ("system.day", "当前日", "", False, "11"),
        ("system.user_name", "操作人", "导出操作人", False, "王五"),
    ]

    @classmethod
    def get_variables(cls) -> List[TemplateVariableDefinition]:
        return [
            TemplateVariableDefinition(
                key=key,
                name=name,
                category=cls.category,
                category_name=cls.category_name,
                source=source,
                required=required,
                example=example,
            )
            for key, name, source, required, example in cls.VARIABLES
        ]


class DocumentVariableProvider:
    """文档信息（生成出的 BidDocument 元数据）。"""

    category = "document"
    category_name = "文档信息"

    VARIABLES = [
        ("document.title", "文档标题", "BidDocument.title", False, "投标文件"),
        ("document.version", "文档版本", "BidDocument.version", False, "3"),
        ("document.generated_at", "生成时间", "BidDocument.created_at", False, "2026-08-11 14:30"),
    ]

    @classmethod
    def get_variables(cls) -> List[TemplateVariableDefinition]:
        return [
            TemplateVariableDefinition(
                key=key,
                name=name,
                category=cls.category,
                category_name=cls.category_name,
                source=source,
                required=required,
                example=example,
            )
            for key, name, source, required, example in cls.VARIABLES
        ]


class SpecialVariableProvider:
    """特殊内容：正文插槽 / 分册插槽 / 图片 / 材料（方案 §11）。

    分册插槽（多册拆分）：bid.slot:role.<section_role>
    只渲染「内容责任矩阵 section_role 等于该角色」的顶级章节子树，
    用于技术册/商务册/资格册分别成册。section_role 词表与
    generation_mode_service.ROLE_MODE_MAP 保持一致。
    """

    category = "special"
    category_name = "特殊内容"

    # 分册插槽角色（key 后缀, 中文名）
    ROLE_SLOTS = [
        ("qualification", "资格册（资格证明材料）"),
        ("technical_solution", "技术册（技术方案）"),
        ("business_response", "商务册（商务响应）"),
        ("service_plan", "服务方案册"),
        ("team_intro", "团队介绍册"),
        ("attachment", "附件册"),
    ]

    @classmethod
    def get_variables(cls) -> List[TemplateVariableDefinition]:
        variables = [
            TemplateVariableDefinition(
                key="body",
                name="标书正文",
                category=cls.category,
                category_name=cls.category_name,
                data_type="slot",
                source="Outline 全部章节内容",
                required=True,
                description="AI 生成的标书正文插入位置；每个模板至少需要一个正文类插槽",
                control_type=CONTROL_SLOT,
            ),
        ]
        for role, label in cls.ROLE_SLOTS:
            variables.append(
                TemplateVariableDefinition(
                    key=f"role.{role}",
                    name=label,
                    category=cls.category,
                    category_name=cls.category_name,
                    data_type="slot",
                    source=f"section_role={role} 的章节",
                    description=f"只渲染责任矩阵角色为 {role} 的章节（含其子章节）",
                    control_type=CONTROL_SLOT,
                )
            )
        variables += [
            TemplateVariableDefinition(
                key="company.logo",
                name="企业 Logo",
                category=cls.category,
                category_name=cls.category_name,
                data_type="image",
                source="CompanyProfile.logo",
                description="企业 Logo 图片；页眉中使用需在占位图上设置替换标记",
                control_type=CONTROL_IMAGE,
            ),
            TemplateVariableDefinition(
                key="material",
                name="企业材料",
                category=cls.category,
                category_name=cls.category_name,
                data_type="image",
                source="CompanyMaterial（按用途标识）",
                description="营业执照、资质证书等材料，插入时需指定材料用途标识",
                control_type=CONTROL_MATERIAL,
            ),
        ]
        return variables


PROVIDERS = [
    ProjectVariableProvider,
    CompanyVariableProvider,
    SystemVariableProvider,
    DocumentVariableProvider,
    SpecialVariableProvider,
]


class TemplateVariableRegistry:
    """变量注册中心：聚合所有 Provider，供校验器/前端面板/上下文构建使用。"""

    def __init__(self):
        self._variables: Dict[str, TemplateVariableDefinition] = {}
        for provider in PROVIDERS:
            for definition in provider.get_variables():
                self._variables[definition.key] = definition

    def get(self, key: str) -> Optional[TemplateVariableDefinition]:
        return self._variables.get(key)

    def all(self) -> List[TemplateVariableDefinition]:
        return list(self._variables.values())

    def all_keys(self) -> set:
        return set(self._variables.keys())

    def grouped(self) -> List[dict]:
        """按 Provider 分组输出（前端变量面板数据源）。"""
        groups = []
        for provider in PROVIDERS:
            variables = provider.get_variables()
            groups.append(
                {
                    "category": provider.category,
                    "category_name": provider.category_name,
                    "variables": [v.to_dict() for v in variables],
                }
            )
        return groups

    # ---------- Tag 识别 ----------

    @staticmethod
    def parse_control_tag(tag: str) -> Optional[dict]:
        """解析 Content Control Tag。

        Returns:
            {"type": "var"|"slot"|"image"|"material", "key": ...} 或 None（非模板控件）
        """
        if not tag or not tag.startswith(TAG_PREFIX):
            return None
        body = tag[len(TAG_PREFIX):]
        if ":" not in body:
            return None
        control_type, key = body.split(":", 1)
        if control_type not in (CONTROL_VAR, CONTROL_SLOT, CONTROL_IMAGE, CONTROL_MATERIAL):
            return None
        return {"type": control_type, "key": key}

    def is_known_tag(self, tag: str) -> bool:
        """Tag 是否合法（白名单校验，方案 §19 第二层）。

        bid.var:* 必须在注册表中；bid.material:* 动态 key 一律放行（渲染时解析）。
        """
        parsed = self.parse_control_tag(tag)
        if parsed is None:
            return False
        if parsed["type"] == CONTROL_MATERIAL:
            return bool(parsed["key"])
        return parsed["key"] in self._variables


# 全局单例
registry = TemplateVariableRegistry()
