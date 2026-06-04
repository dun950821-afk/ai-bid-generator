# backend/apps/tender/services/parsers/mock_parser.py
"""Mock 解析器（仅用于测试）。"""

from apps.tender.services.parsers.base import BaseParser, ParseResult


class MockParser(BaseParser):
    """Mock 解析器。

    仅在 settings.PARSER_ENGINE="mock" 或测试环境启用。
    生成固定的测试 Markdown 内容。
    """

    SUPPORTED_EXTENSIONS = ["docx", "pdf", "txt", "md"]

    MOCK_MARKDOWN = """# 第一章 投标人须知

## 1.1 总则

本招标文件适用于 XXX 项目的招标活动。

## 1.2 资格要求

投标人必须具备以下资格条件：

1. 具有独立法人资格
2. 具有建筑工程施工总承包壹级资质
3. 近三年承担过类似项目业绩不少于 3 个

★ 不满足上述资格条件的投标人将被拒绝。

## 1.3 投标截止时间

投标截止时间为 2024年12月31日 17:00。

逾期递交的投标文件将被拒绝。

# 第二章 评分标准

## 2.1 技术评分（40分）

| 评分项目 | 分值 | 评分标准 |
|---------|------|---------|
| 施工方案 | 15分 | 方案合理、可行得 10-15 分 |
| 质量保证措施 | 10分 | 措施完善得 7-10 分 |
| 安全文明施工 | 15分 | 措施到位得 10-15 分 |

## 2.2 商务评分（30分）

报价得分计算公式：得分 = 30 × (最低报价 / 投标报价)

## 2.3 业绩评分（30分）

每提供一个类似项目业绩得 10 分，最高 30 分。

# 第三章 技术要求

## 3.1 工程概况

项目位于 XXX，总建筑面积约 50000 平方米。

## 3.2 技术参数

1. 结构形式：框架结构
2. 建筑层数：地上 18 层，地下 2 层
3. 抗震设防烈度：7 度

## 3.3 质量要求

工程质量必须达到国家现行验收规范合格标准。

违约金：每延迟一天，按合同价款的 0.5‰ 支付违约金。

# 第四章 合同条款

## 4.1 付款方式

合同签订后支付 10% 预付款，工程进度款按月支付 80%，竣工验收后支付 95%，余款作为质保金。

## 4.2 质保期

质保期为竣工验收合格后 24 个月。

## 4.3 争议解决

双方发生争议时，应协商解决；协商不成的，提交仲裁委员会仲裁。
"""

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """返回 Mock Markdown 内容。"""
        return ParseResult(
            markdown=self.MOCK_MARKDOWN,
            page_count=4,
            page_map=[
                {"page": 1, "offset": 0, "length": 500},
                {"page": 2, "offset": 500, "length": 400},
                {"page": 3, "offset": 900, "length": 350},
                {"page": 4, "offset": 1250, "length": 300},
            ],
            parse_engine="mock",
            parse_quality="high",
            quality_metrics={
                "mock": True,
                "char_count": len(self.MOCK_MARKDOWN),
            },
            error_message=None,
        )