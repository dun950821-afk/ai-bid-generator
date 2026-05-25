"""文档解析服务（占位实现）。"""

import logging
from hashlib import sha256

from django.db import transaction

from apps.tender.constants import PARSER_VERSION, ParseQuality
from apps.tender.models import ParsedDocument
from apps.common.services.storage import StorageService

logger = logging.getLogger(__name__)


class ParseService:
    """文档解析服务（占位实现）。

    当前为 Mock 实现，生成测试数据。
    后续对接 MinerU/Marker 时替换实现。
    """

    VERSION = PARSER_VERSION

    def parse(self, tender_file) -> ParsedDocument:
        """解析招标文件，返回 ParsedDocument。

        Args:
            tender_file: TenderFile 实例

        Returns:
            ParsedDocument 实例
        """
        # 计算输入哈希（基于文件内容）
        input_hash = self._compute_input_hash(tender_file)

        # 生成 Mock Markdown
        markdown = self._generate_mock_markdown(tender_file)

        # 计算质量指标
        quality_metrics = self._compute_quality_metrics(markdown)
        page_count = self._count_pages(markdown)

        # 上传到 MinIO
        markdown_uri = self._upload_to_minio(markdown, tender_file)

        # 计算输出哈希（基于 Markdown 内容）
        output_hash = self._compute_output_hash(markdown)

        # 切换活跃版本（事务保护）
        with transaction.atomic():
            ParsedDocument.objects.filter(
                tender_file=tender_file
            ).update(is_active=False)

            parsed_doc = ParsedDocument.objects.create(
                tender_file=tender_file,
                is_active=True,
                markdown_uri=markdown_uri,
                page_count=page_count,
                parse_engine="mock",
                parser_version=self.VERSION,
                parse_quality=ParseQuality.HIGH,
                quality_metrics=quality_metrics,
                input_hash=input_hash,
                output_hash=output_hash,
            )

        logger.info(
            "Parsed tender_file=%s parsed_document=%s",
            tender_file.id,
            parsed_doc.id,
        )

        return parsed_doc

    def _compute_input_hash(self, tender_file) -> str:
        """计算输入哈希（基于文件内容）。"""
        storage = StorageService()
        content = storage.get_object(tender_file.object_key)
        return sha256(content).hexdigest()

    def _compute_output_hash(self, markdown: str) -> str:
        """计算输出哈希（基于 Markdown 内容）。"""
        return sha256(markdown.encode("utf-8")).hexdigest()

    def _generate_mock_markdown(self, tender_file) -> str:
        """生成 Mock Markdown 内容。"""
        return """# 第一章 投标人须知

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

    def _upload_to_minio(self, markdown: str, tender_file) -> str:
        """上传 Markdown 到 MinIO。"""
        storage = StorageService()
        object_key = f"parsed/{tender_file.id}/document.md"
        storage.put_object(object_key, markdown.encode("utf-8"), "text/markdown")
        return object_key

    def _compute_quality_metrics(self, markdown: str) -> dict:
        """计算解析质量指标。"""
        lines = markdown.split("\n")
        return {
            "ocr_ratio": 0.0,
            "table_count": markdown.count("|"),
            "table_parse_success_rate": 1.0,
            "toc_detected": True,
            "page_map_complete": True,
            "avg_chars_per_page": len(markdown) // 10,
            "empty_page_count": 0,
            "garbled_text_ratio": 0.0,
            "image_only_page_count": 0,
            "warning_codes": [],
        }

    def _count_pages(self, markdown: str) -> int:
        """估算页数（Mock 实现）。"""
        # 简单估算：每 1500 字符约 1 页
        return max(1, len(markdown) // 1500)