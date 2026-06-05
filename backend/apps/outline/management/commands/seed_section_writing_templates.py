# backend/apps/outline/management/commands/seed_section_writing_templates.py
"""章节撰写模板初始化命令。"""

from django.core.management.base import BaseCommand
from apps.outline.models import SectionWritingTemplate


class Command(BaseCommand):
    help = "初始化章节撰写模板"

    DEFAULT_TEMPLATES = [
        {
            "name": "通用正文",
            "template_key": "default_body_text",
            "description": "适用于大多数章节的通用正文模板",
            "applicable_section_roles": [],
            "applicable_keywords": [],
            "expression_form": "body_text",
            "writing_depth": "moderate",
            "template_content": """## 一、概述
{{ overview }}

## 二、主要内容
{{ main_content }}

## 三、补充说明
{{ supplementary }}""",
            "required_slots": [
                {"name": "overview", "description": "章节概述"},
                {"name": "main_content", "description": "主要内容"},
            ],
            "optional_slots": [
                {"name": "supplementary", "description": "补充说明"},
            ],
            "table_schemas": [],
            "priority": 10,
        },
        {
            "name": "通用表格",
            "template_key": "default_table",
            "description": "适用于表格类章节的通用模板",
            "applicable_section_roles": [],
            "applicable_keywords": ["表格", "清单", "列表"],
            "expression_form": "table",
            "writing_depth": "moderate",
            "template_content": """| 序号 | 项目 | 内容 |
|---|---|---|
{{ table_rows }}""",
            "required_slots": [
                {"name": "table_rows", "description": "表格行内容"},
            ],
            "optional_slots": [],
            "table_schemas": [
                {"name": "default_table", "columns": ["序号", "项目", "内容"]}
            ],
            "priority": 10,
        },
        {
            "name": "技术方案",
            "template_key": "technical_solution",
            "description": "适用于技术方案类章节",
            "applicable_section_roles": ["technical_solution"],
            "applicable_keywords": ["技术方案", "技术路线", "技术架构", "解决方案"],
            "expression_form": "body_text",
            "writing_depth": "detailed",
            "template_content": """## 一、需求分析
{{ requirement_analysis }}

## 二、总体设计
{{ overall_design }}

## 三、详细方案
{{ detailed_solution }}

## 四、技术保障
{{ technical_support }}

## 五、创新与优势
{{ innovation }}""",
            "required_slots": [
                {"name": "requirement_analysis", "description": "需求分析", "allowed_rag_channels": ["company_info", "historical_bid"]},
                {"name": "overall_design", "description": "总体设计方案"},
                {"name": "detailed_solution", "description": "详细技术方案"},
            ],
            "optional_slots": [
                {"name": "technical_support", "description": "技术保障措施"},
                {"name": "innovation", "description": "创新与优势"},
            ],
            "table_schemas": [],
            "priority": 80,
        },
        {
            "name": "项目管理方案",
            "template_key": "project_management",
            "description": "适用于项目管理类章节",
            "applicable_section_roles": ["service_plan", "technical_solution"],
            "applicable_keywords": ["项目管理", "实施管理", "进度管理", "质量管理", "风险管理"],
            "expression_form": "body_text",
            "writing_depth": "detailed",
            "template_content": """## 一、项目组织管理
{{ project_organization }}

## 二、进度计划管理
{{ schedule_management }}

## 三、质量控制措施
{{ quality_control }}

## 四、风险与变更管理
{{ risk_management }}

## 五、沟通与汇报机制
{{ communication }}""",
            "required_slots": [
                {"name": "project_organization", "description": "项目组织架构", "allowed_rag_channels": ["personnel", "company_info"]},
                {"name": "schedule_management", "description": "进度计划"},
                {"name": "quality_control", "description": "质量控制措施"},
            ],
            "optional_slots": [
                {"name": "risk_management", "description": "风险与变更管理"},
                {"name": "communication", "description": "沟通与汇报机制"},
            ],
            "table_schemas": [],
            "priority": 80,
        },
        {
            "name": "运维/服务保障方案",
            "template_key": "service_support",
            "description": "适用于运维、售后、服务保障类章节",
            "applicable_section_roles": ["service_plan"],
            "applicable_keywords": ["运维", "售后", "服务保障", "服务承诺", "维保"],
            "expression_form": "body_text",
            "writing_depth": "detailed",
            "template_content": """## 一、服务范围与内容
{{ service_scope }}

## 二、服务团队
{{ service_team }}

## 三、服务响应机制
{{ response_mechanism }}

## 四、服务保障措施
{{ service_guarantee }}

## 五、服务案例
{{ service_cases }}""",
            "required_slots": [
                {"name": "service_scope", "description": "服务范围与内容"},
                {"name": "service_team", "description": "服务团队", "allowed_rag_channels": ["personnel"]},
                {"name": "response_mechanism", "description": "服务响应机制"},
            ],
            "optional_slots": [
                {"name": "service_guarantee", "description": "服务保障措施"},
                {"name": "service_cases", "description": "服务案例", "allowed_rag_channels": ["project_case"]},
            ],
            "table_schemas": [],
            "priority": 75,
        },
        {
            "name": "培训方案",
            "template_key": "training_plan",
            "description": "适用于培训、知识转移类章节",
            "applicable_section_roles": ["service_plan"],
            "applicable_keywords": ["培训", "知识转移", "培训计划", "培训方案"],
            "expression_form": "body_text",
            "writing_depth": "detailed",
            "template_content": """## 一、培训目标
{{ training_objective }}

## 二、培训内容
{{ training_content }}

## 三、培训方式
{{ training_method }}

## 四、培训计划安排
{{ training_schedule }}

## 五、培训保障
{{ training_guarantee }}""",
            "required_slots": [
                {"name": "training_objective", "description": "培训目标"},
                {"name": "training_content", "description": "培训内容"},
                {"name": "training_method", "description": "培训方式"},
            ],
            "optional_slots": [
                {"name": "training_schedule", "description": "培训计划安排"},
                {"name": "training_guarantee", "description": "培训保障"},
            ],
            "table_schemas": [],
            "priority": 70,
        },
        {
            "name": "团队介绍",
            "template_key": "team_intro",
            "description": "适用于团队介绍类章节",
            "applicable_section_roles": ["team_intro"],
            "applicable_keywords": ["团队", "人员", "项目组", "人员配置", "团队介绍"],
            "expression_form": "body_text",
            "writing_depth": "detailed",
            "template_content": """## 一、项目团队架构
{{ team_structure }}

## 二、核心成员介绍
{{ key_members }}

## 三、人员资质与经验
{{ qualifications }}

## 四、团队优势
{{ team_advantage }}""",
            "required_slots": [
                {"name": "team_structure", "description": "项目团队架构", "allowed_rag_channels": ["company_info"]},
                {"name": "key_members", "description": "核心成员介绍", "allowed_rag_channels": ["personnel"]},
            ],
            "optional_slots": [
                {"name": "qualifications", "description": "人员资质与经验", "allowed_rag_channels": ["personnel", "certificate"]},
                {"name": "team_advantage", "description": "团队优势"},
            ],
            "table_schemas": [],
            "priority": 85,
        },
        {
            "name": "资格/资质证明",
            "template_key": "qualification",
            "description": "适用于资格证明、资质证书类章节",
            "applicable_section_roles": ["qualification"],
            "applicable_keywords": ["资格", "资质", "证书", "认证", "证明"],
            "expression_form": "body_text",
            "writing_depth": "moderate",
            "template_content": """## 一、企业资质
{{ company_qualifications }}

## 二、人员资质
{{ personnel_qualifications }}

## 三、相关证明材料
{{ supporting_documents }}""",
            "required_slots": [
                {"name": "company_qualifications", "description": "企业资质", "allowed_rag_channels": ["certificate", "company_info"]},
                {"name": "personnel_qualifications", "description": "人员资质", "allowed_rag_channels": ["certificate", "personnel"]},
            ],
            "optional_slots": [
                {"name": "supporting_documents", "description": "相关证明材料"},
            ],
            "table_schemas": [],
            "priority": 85,
        },
        {
            "name": "业绩案例",
            "template_key": "project_case",
            "description": "适用于业绩案例类章节",
            "applicable_section_roles": ["qualification"],
            "applicable_keywords": ["业绩", "案例", "项目经验", "同类项目"],
            "expression_form": "body_text",
            "writing_depth": "detailed",
            "template_content": """## 一、业绩概述
{{ case_overview }}

## 二、典型案例
{{ typical_cases }}

## 三、经验总结
{{ experience_summary }}""",
            "required_slots": [
                {"name": "case_overview", "description": "业绩概述"},
                {"name": "typical_cases", "description": "典型案例", "allowed_rag_channels": ["project_case"]},
            ],
            "optional_slots": [
                {"name": "experience_summary", "description": "经验总结"},
            ],
            "table_schemas": [],
            "priority": 85,
        },
        {
            "name": "评标索引表",
            "template_key": "evaluation_index",
            "description": "适用于评标索引表类章节",
            "applicable_section_roles": [],
            "applicable_keywords": ["评标索引", "评分索引", "响应索引", "评审索引"],
            "expression_form": "table",
            "writing_depth": "moderate",
            "template_content": """| 序号 | 评审项 | 招标要求 | 响应章节 | 页码 | 响应说明 |
|---|---|---|---|---|---|
{{ index_rows }}""",
            "required_slots": [
                {"name": "index_rows", "description": "索引表行内容"},
            ],
            "optional_slots": [],
            "table_schemas": [
                {
                    "name": "evaluation_index",
                    "columns": ["序号", "评审项", "招标要求", "响应章节", "页码", "响应说明"],
                }
            ],
            "priority": 90,
        },
        {
            "name": "承诺函",
            "template_key": "commitment_letter",
            "description": "适用于承诺函类章节",
            "applicable_section_roles": [],
            "applicable_keywords": ["承诺函", "承诺书", "承诺"],
            "expression_form": "commitment_letter",
            "writing_depth": "moderate",
            "template_content": """{{ company_name }}：

{{ commitment_content }}

{{ company_signature }}""",
            "required_slots": [
                {"name": "commitment_content", "description": "承诺内容"},
            ],
            "optional_slots": [
                {"name": "company_name", "description": "致函对象", "allowed_rag_channels": ["company_info"]},
                {"name": "company_signature", "description": "公司签章"},
            ],
            "table_schemas": [],
            "priority": 90,
        },
        {
            "name": "偏离表",
            "template_key": "deviation_table",
            "description": "适用于偏离表类章节",
            "applicable_section_roles": [],
            "applicable_keywords": ["偏离表", "偏离说明", "响应偏离"],
            "expression_form": "table",
            "writing_depth": "moderate",
            "template_content": """| 序号 | 招标要求 | 响应情况 | 偏离说明 |
|---|---|---|---|
{{ deviation_rows }}""",
            "required_slots": [
                {"name": "deviation_rows", "description": "偏离表行内容"},
            ],
            "optional_slots": [],
            "table_schemas": [
                {
                    "name": "deviation_table",
                    "columns": ["序号", "招标要求", "响应情况", "偏离说明"],
                }
            ],
            "priority": 90,
        },
        {
            "name": "简历表",
            "template_key": "resume_table",
            "description": "适用于人员简历表类章节",
            "applicable_section_roles": ["team_intro"],
            "applicable_keywords": ["简历", "人员简历", "简历表"],
            "expression_form": "resume_table",
            "writing_depth": "detailed",
            "template_content": """{{ resume_content }}""",
            "required_slots": [
                {"name": "resume_content", "description": "简历内容", "allowed_rag_channels": ["personnel"]},
            ],
            "optional_slots": [],
            "table_schemas": [
                {
                    "name": "resume_table",
                    "columns": ["姓名", "职务", "学历", "职称", "专业年限", "主要业绩"],
                }
            ],
            "priority": 85,
        },
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="强制覆盖已存在的模板",
        )

    def handle(self, *args, **options):
        force = options["force"]
        created_count = 0
        updated_count = 0

        for template_data in self.DEFAULT_TEMPLATES:
            template_key = template_data["template_key"]

            try:
                existing = SectionWritingTemplate.objects.get(template_key=template_key)

                if force:
                    # 更新现有模板
                    for key, value in template_data.items():
                        setattr(existing, key, value)
                    existing.save()
                    updated_count += 1
                    self.stdout.write(
                        self.style.WARNING(f"Updated template: {template_key}")
                    )
                else:
                    self.stdout.write(f"Skipped existing template: {template_key}")

            except SectionWritingTemplate.DoesNotExist:
                # 创建新模板
                SectionWritingTemplate.objects.create(**template_data)
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Created template: {template_key}")
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone! Created: {created_count}, Updated: {updated_count}"
            )
        )
