# -*- coding: utf-8 -*-
"""响应模板常量定义。

块类型与 Phase 0 验证(常熟农商银行文件)对齐。
"""


class BlockType:
    """填充位置类型(识别 + 填充引擎共用)。"""

    FIXED = "FIXED"              # 招标方固定内容, 原样保留
    AUTO_FIELD = "AUTO_FIELD"    # 企业/项目数据自动填充
    AI_GENERATE = "AI_GENERATE"  # AI 生成正文/表格内容
    AI_RESPONSE = "AI_RESPONSE"  # 条款逐条应答表
    DATA_TABLE = "DATA_TABLE"    # 企业数据表格(字段映射)
    REPEAT_TABLE = "REPEAT_TABLE"  # 重复行表格(行复制)
    REPEAT_BLOCK = "REPEAT_BLOCK"  # 重复区块(整块复制, 二期)
    MATERIAL_SLOT = "MATERIAL_SLOT"  # 材料粘贴处(图片插入)
    MANUAL = "MANUAL"            # 必须人工填写
    PRICE = "PRICE"              # 报价(人工确认, 可能单独密封)

    CHOICES = [
        (FIXED, "固定内容"),
        (AUTO_FIELD, "企业自动字段"),
        (AI_GENERATE, "AI生成内容"),
        (AI_RESPONSE, "条款应答"),
        (DATA_TABLE, "企业数据表"),
        (REPEAT_TABLE, "重复行表格"),
        (REPEAT_BLOCK, "重复块"),
        (MATERIAL_SLOT, "材料插槽"),
        (MANUAL, "人工填写"),
        (PRICE, "报价"),
    ]

    # 需要人工确认才允许出文件的类型
    MANUAL_CONFIRM_TYPES = {MANUAL, PRICE}

    # v1 填充引擎支持的类型(REPEAT_BLOCK 二期)
    FILLABLE_TYPES = {
        AUTO_FIELD, AI_GENERATE, AI_RESPONSE, DATA_TABLE,
        REPEAT_TABLE, MATERIAL_SLOT, MANUAL, PRICE,
    }

    @classmethod
    def is_fillable(cls, block_type: str) -> bool:
        return block_type in cls.FILLABLE_TYPES


class TemplateStatus:
    """响应模板整体状态。"""

    PENDING = "pending"          # 待识别
    ANALYZING = "analyzing"      # 识别中
    ANALYZED = "analyzed"        # 已识别, 待确认
    CONFIRMED = "confirmed"      # 已确认, 可生成
    GENERATING = "generating"    # 生成中
    GENERATED = "generated"      # 已生成
    FAILED = "failed"            # 失败

    CHOICES = [
        (PENDING, "待识别"),
        (ANALYZING, "识别中"),
        (ANALYZED, "待确认"),
        (CONFIRMED, "已确认"),
        (GENERATING, "生成中"),
        (GENERATED, "已生成"),
        (FAILED, "失败"),
    ]


class BlockFillStatus:
    """单个块填充状态。"""

    EMPTY = "empty"              # 未填充
    FILLED = "filled"            # 已填充
    SKIPPED = "skipped"          # 跳过(FIXED)
    NEEDS_REVIEW = "needs_review"  # 需人工复核(待确认应答/报价)

    CHOICES = [
        (EMPTY, "未填充"),
        (FILLED, "已填充"),
        (SKIPPED, "已跳过"),
        (NEEDS_REVIEW, "待复核"),
    ]


class BlockConfirmStatus:
    """块确认状态。"""

    UNCONFIRMED = "unconfirmed"  # 未确认
    CONFIRMED = "confirmed"      # 已确认
    ADJUSTED = "adjusted"        # 已人工调整

    CHOICES = [
        (UNCONFIRMED, "未确认"),
        (CONFIRMED, "已确认"),
        (ADJUSTED, "已调整"),
    ]


class DocumentKind:
    """生成产物类型。"""

    MAIN = "main"                # 响应文件主体
    SEPARATE = "separate"        # 单独密封附件(如报价表)

    CHOICES = [
        (MAIN, "响应文件"),
        (SEPARATE, "单独密封"),
    ]


# 置信度低于该值的块自动降级为人工确认
CONFIDENCE_FALLBACK = 0.6

# 附件标题正则(DocxParser markdown 产物: ## 附件1:xxx)
ATTACHMENT_HEADING_RE = r"^#{1,4}\s*附件\s*(\d+)[：:]\s*(.*)$"

# 落款规则: 出现在附件尾部的固定落款模式
SIGNATURE_PATTERNS = [
    "响应人（法人公章）",
    "响应人(法人公章)",
    "法定代表人或授权代表",
    "法定代表人（或授权代表）签字",
    "日    期",
    "日期",
]
