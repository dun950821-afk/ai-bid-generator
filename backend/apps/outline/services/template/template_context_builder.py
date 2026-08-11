# backend/apps/outline/services/template/template_context_builder.py
"""模板渲染上下文装配（方案 §26）。

Renderer 的唯一数据来源：Renderer 禁止自己查库，所有项目/企业/
系统/文档变量都在这里装配成标准 context dict。

变量取值规则：
- 数据源缺失时返回空字符串，保证 docxtpl 渲染不抛未定义错误；
- 同时产出 JSON 安全的 snapshot（存 BidDocument.render_context_snapshot，
  用于半年后追溯渲染时的实际取值，方案 §49）。
"""

from typing import Optional

from django.utils import timezone

from apps.outline.models import Outline


class TemplateContextBuilder:
    """构建 docxtpl 渲染上下文。"""

    def build(
        self,
        *,
        outline: Outline,
        user=None,
        document_title: str = "",
        document_version: int = 1,
    ) -> dict:
        """装配标准 context。

        Args:
            outline: 大纲（经它关联 project / lot / material_package）
            user: 导出操作人
            document_title: 生成文档标题
            document_version: 生成文档版本号

        Returns:
            dict：project/company/system/document 四个命名空间
        """
        project = outline.project
        lot = outline.lot
        company = self._resolve_company(outline)
        now = timezone.now()

        context = {
            "project": {
                "name": project.name or "",
                "code": getattr(project, "code", "") or "",
                "package_name": lot.name or "",
                "package_no": lot.code or "",
                # 招标方信息来自标段字段（Lot 模型），可由招标文件解析自动回填
                "tenderer": getattr(lot, "tenderer", "") or "",
                "agent": getattr(lot, "agent", "") or "",
                "bid_deadline": getattr(lot, "bid_deadline", "") or "",
                "contact_name": getattr(lot, "contact_name", "") or "",
                "contact_phone": getattr(lot, "contact_phone", "") or "",
            },
            "company": self._company_context(company),
            "system": {
                "export_date": now.strftime("%Y-%m-%d"),
                "export_datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
                "year": now.strftime("%Y"),
                "month": now.strftime("%m"),
                "day": now.strftime("%d"),
                "user_name": self._user_name(user),
            },
            "document": {
                "title": document_title,
                "version": str(document_version),
                "generated_at": now.strftime("%Y-%m-%d %H:%M"),
            },
        }
        return context

    @staticmethod
    def _resolve_company(outline: Outline):
        """企业数据源：大纲材料包关联的公司（无材料包则为 None）。"""
        try:
            package = outline.material_package
        except Exception:
            return None
        if package is None:
            return None
        return package.company

    @staticmethod
    def _company_context(company) -> dict:
        if company is None:
            company = type("EmptyCompany", (), {})()  # 全空对象
        return {
            "name": getattr(company, "name", "") or "",
            "credit_code": getattr(company, "unified_social_credit_code", "") or "",
            "legal_representative": getattr(company, "legal_representative", "") or "",
            "registered_capital": getattr(company, "registered_capital", "") or "",
            "established_date": (
                company.established_date.strftime("%Y-%m-%d")
                if getattr(company, "established_date", None)
                else ""
            ),
            "address": getattr(company, "registered_address", "") or "",
            "phone": getattr(company, "official_phone", "") or "",
            "email": getattr(company, "official_email", "") or "",
            "bank_name": getattr(company, "bank_name", "") or "",
            "bank_account": getattr(company, "bank_account", "") or "",
        }

    @staticmethod
    def _user_name(user) -> str:
        if user is None or not getattr(user, "is_authenticated", False):
            return ""
        return user.get_full_name() or user.username

    @staticmethod
    def to_snapshot(context: dict) -> dict:
        """提取 JSON 安全的上下文快照（仅文本变量命名空间）。

        materials/images 等命名空间含 InlineImage 对象，不可 JSON 序列化，
        不纳入快照。
        """
        return {
            namespace: dict(context[namespace])
            for namespace in ("project", "company", "system", "document")
            if isinstance(context.get(namespace), dict)
        }
