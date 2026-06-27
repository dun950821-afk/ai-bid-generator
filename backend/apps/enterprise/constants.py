# backend/apps/enterprise/constants.py
"""企业资料中心常量定义。"""


class CompanyStatus:
    """公司状态。"""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"

    CHOICES = [
        (DRAFT, "草稿"),
        (ACTIVE, "启用"),
        (ARCHIVED, "归档"),
    ]


class MaterialType:
    """材料类型。"""

    BUSINESS_LICENSE = "business_license"
    LEGAL_ID_FRONT = "legal_id_front"
    LEGAL_ID_BACK = "legal_id_back"
    AUTHORIZATION_LETTER = "authorization_letter"
    AGENT_ID_FRONT = "agent_id_front"
    AGENT_ID_BACK = "agent_id_back"
    QUALIFICATION = "qualification"
    CERTIFICATE = "certificate"
    ISO_CERTIFICATE = "iso_certificate"
    CASE_CONTRACT = "case_contract"
    CASE = "case"
    ACCEPTANCE_REPORT = "acceptance_report"
    SOCIAL_SECURITY = "social_security"
    BANK_ACCOUNT = "bank_account"
    OTHER = "other"

    CHOICES = [
        (BUSINESS_LICENSE, "营业执照"),
        (LEGAL_ID_FRONT, "法人身份证正面"),
        (LEGAL_ID_BACK, "法人身份证背面"),
        (AUTHORIZATION_LETTER, "授权委托书"),
        (AGENT_ID_FRONT, "委托代理人身份证正面"),
        (AGENT_ID_BACK, "委托代理人身份证背面"),
        (QUALIFICATION, "资格证明"),
        (CERTIFICATE, "资质证书"),
        (ISO_CERTIFICATE, "体系认证证书"),
        (CASE_CONTRACT, "案例合同"),
        (CASE, "业绩案例"),
        (ACCEPTANCE_REPORT, "验收报告"),
        (SOCIAL_SECURITY, "社保证明"),
        (BANK_ACCOUNT, "开户许可证"),
        (OTHER, "其他"),
    ]

    # 敏感材料类型
    SENSITIVE_TYPES = {
        LEGAL_ID_FRONT,
        LEGAL_ID_BACK,
        AGENT_ID_FRONT,
        AGENT_ID_BACK,
        AUTHORIZATION_LETTER,
    }


class MaterialStatus:
    """材料状态。"""

    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    ARCHIVED = "archived"

    CHOICES = [
        (DRAFT, "草稿"),
        (ACTIVE, "启用"),
        (EXPIRED, "已过期"),
        (ARCHIVED, "归档"),
    ]


class PackageStatus:
    """材料包状态。"""

    DRAFT = "draft"
    CONFIRMED = "confirmed"
    LOCKED = "locked"

    CHOICES = [
        (DRAFT, "草稿"),
        (CONFIRMED, "已确认"),
        (LOCKED, "已锁定"),
    ]


class InsertMode:
    """材料插入方式。"""

    TEXT_ONLY = "text_only"
    TABLE_ROW = "table_row"
    IMAGE_INLINE = "image_inline"
    IMAGE_ATTACHMENT = "image_attachment"
    FILE_REFERENCE = "file_reference"

    CHOICES = [
        (TEXT_ONLY, "仅文字引用"),
        (TABLE_ROW, "表格行插入"),
        (IMAGE_INLINE, "正文内插图"),
        (IMAGE_ATTACHMENT, "附件式插图"),
        (FILE_REFERENCE, "文件名引用"),
    ]
