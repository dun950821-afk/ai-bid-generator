# backend/apps/bid_check/constants.py
"""废标检查模块常量。"""


class BidCheckTaskStatus:
    """废标检查任务状态。"""

    PENDING = "pending"
    EXTRACTING = "extracting"
    ANALYZING = "analyzing"
    INSPECTING = "inspecting"
    FINALIZING = "finalizing"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL_SUCCESS = "partial_success"

    CHOICES = [
        (PENDING, "等待中"),
        (EXTRACTING, "提取废标项清单"),
        (ANALYZING, "第一轮分析"),
        (INSPECTING, "第二轮检查"),
        (FINALIZING, "第三轮定稿"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
        (PARTIAL_SUCCESS, "部分成功"),
    ]


class BidCheckFindingType:
    """发现项类型。"""

    INVALID_BID = "invalidBid"
    REJECTION_ITEM = "rejectionItem"

    CHOICES = [
        (INVALID_BID, "无效标"),
        (REJECTION_ITEM, "废标项"),
    ]


class BidCheckSeverity:
    """风险严重程度。"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    CHOICES = [
        (HIGH, "高"),
        (MEDIUM, "中"),
        (LOW, "低"),
    ]
