# backend/apps/outline/services/generation_quality_service.py
"""正文生成质量校验服务。"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


# ==============================================================================
# 严格模式禁止词定义
# ==============================================================================

STRICT_MODE_FORBIDDEN_TERMS = {
    "strict_qualification": [
        "技术参数",
        "系统兼容性",
        "数据处理能力",
        "吞吐量",
        "TPS",
        "响应时间",
        "安全性要求",
        "国密算法",
        "等保",
        "扩展性",
        "接口标准",
        "部署方式",
        "可用性",
        "服务响应",
        "企业相关案例",
        "案例一",
        "案例二",
        "案例三",
        "业主单位",
        "合同金额",
        "项目时间",
        "项目概述",
        "项目成果",
        "客户满意度",
        "实施方案",
        "运维服务",
        "智慧政务",
        "智能交通",
    ],
    "strict_table": [
        "案例一",
        "案例二",
        "案例三",
        "技术参数",
        "系统架构",
        "实施方案",
        "项目业绩",
    ],
    "strict_commitment": [
        "案例一",
        "案例二",
        "技术参数",
        "项目业绩",
        "合同金额",
    ],
}


class GenerationQualityService:
    """正文生成质量校验服务。

    执行三类校验：
    1. 得分点覆盖校验
    2. RAG 事实风险校验
    3. 矩阵边界校验
    """

    # 事实性关键词（需要 RAG 支撑）
    FACT_KEYWORDS = [
        "证书",
        "编号",
        "项目经理",
        "业绩",
        "金额",
        "客户",
        "合同",
        "有效期",
        "资质",
        "认证",
        "人员",
        "学历",
        "职称",
        "年限",
        "公司",
    ]

    def run_all_checks(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """运行所有质量校验。

        Args:
            context: 生成上下文
            result: 生成结果

        Returns:
            质量报告
        """
        # 1. 得分点覆盖校验
        coverage_report = self.check_analysis_point_coverage(context, result)

        # 2. RAG 事实风险校验
        rag_fact_report = self.check_rag_fact_risk(context, result)

        # 3. 矩阵边界校验
        boundary_report = self.check_matrix_boundary(context, result)

        # 4. 严格模式边界校验
        generation_mode = context.get("generation_mode", "normal")
        strict_mode_report = self.check_strict_mode_boundary(
            result.get("content", ""),
            generation_mode,
        )

        # 5. 计算最终状态
        reports = [
            coverage_report,
            rag_fact_report,
            boundary_report,
            strict_mode_report,
        ]
        final_status = self._get_final_status(reports)

        return {
            "analysis_point_coverage": coverage_report,
            "rag_fact_check": rag_fact_report,
            "matrix_boundary_check": boundary_report,
            "strict_mode_check": strict_mode_report,
            "final_status": final_status,
            "checked_at": self._get_timestamp(),
        }

    def check_analysis_point_coverage(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """得分点覆盖校验。

        检查生成内容是否覆盖了必须响应的分析点。
        """
        analysis_points = context.get("analysis_points", {})
        must_respond = analysis_points.get("must_respond", [])

        # 获取必须响应的 ID
        must_ids = [p.get("id") for p in must_respond if p.get("id")]

        # 获取模型自报的已使用 ID
        used_ids = result.get("used_analysis_point_ids", [])

        # 找出未覆盖的 ID
        missing_ids = [pid for pid in must_ids if pid not in used_ids]

        # 简单关键词检查（补充覆盖检查）
        content = result.get("content", "")
        keyword_coverage = self._check_keyword_coverage(content, must_respond)

        status = "pass"
        if missing_ids:
            status = "warning"
        if len(missing_ids) > len(must_ids) * 0.5:
            status = "fail"

        return {
            "status": status,
            "total_must_respond": len(must_ids),
            "covered_count": len(used_ids),
            "missing_analysis_point_ids": missing_ids,
            "covered_analysis_point_ids": used_ids,
            "keyword_coverage": keyword_coverage,
        }

    def _check_keyword_coverage(
        self,
        content: str,
        must_respond: list[dict],
    ) -> dict[str, Any]:
        """基于关键词的覆盖检查。"""
        covered = []
        not_covered = []

        for point in must_respond:
            title = point.get("title", "")
            content_preview = point.get("content", "")[:100]

            # 检查标题关键词是否在正文出现
            keywords = self._extract_keywords(title)
            found = sum(1 for kw in keywords if kw in content)

            if found >= len(keywords) * 0.5:
                covered.append({
                    "id": point.get("id"),
                    "title": title,
                    "keywords_found": found,
                })
            else:
                not_covered.append({
                    "id": point.get("id"),
                    "title": title,
                    "keywords_found": found,
                    "keywords_total": len(keywords),
                })

        return {
            "covered": covered,
            "not_covered": not_covered,
        }

    def _extract_keywords(self, text: str) -> list[str]:
        """从文本中提取关键词。"""
        # 移除标点符号
        clean_text = re.sub(r"[^\w\s]", " ", text)
        # 分词（简单按空格分割，中文需要改进）
        words = clean_text.split()
        # 过滤短词
        return [w for w in words if len(w) >= 2]

    def check_rag_fact_risk(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """RAG 事实风险校验。

        检查正文中的事实性内容是否有 RAG 素材支撑。
        """
        content = result.get("content", "")
        rag_materials = context.get("rag_materials", {})

        # 统计 RAG 素材数量
        rag_count = sum(len(items) for items in rag_materials.values())

        risk_flags = []

        # 如果正文包含事实性关键词，但 RAG 素材为空
        if rag_count == 0:
            found_keywords = [
                kw for kw in self.FACT_KEYWORDS if kw in content
            ]
            if found_keywords:
                risk_flags.append({
                    "type": "unsupported_fact_risk",
                    "message": (
                        f"正文包含人员、证书、业绩等事实性内容（{', '.join(found_keywords)}），"
                        f"但未检索到 RAG 素材支撑。"
                    ),
                    "keywords": found_keywords,
                })

        # 检查模型自报的 risk_flags
        model_risks = result.get("risk_flags", [])
        for risk in model_risks:
            if risk.get("type") not in ["json_parse_failed"]:
                risk_flags.append(risk)

        # 检查 missing_info
        missing_info = result.get("missing_info", [])
        for info in missing_info:
            if info.get("type") in ["missing_personnel", "missing_certificate", "missing_case"]:
                risk_flags.append({
                    "type": info["type"],
                    "message": info.get("message", ""),
                })

        status = "pass"
        if risk_flags:
            status = "warning"
        if any(r.get("type") == "unsupported_fact_risk" for r in risk_flags):
            status = "warning"

        return {
            "status": status,
            "rag_material_count": rag_count,
            "rag_channels": {
                channel: len(items)
                for channel, items in rag_materials.items()
            },
            "issues": risk_flags,
        }

    def check_matrix_boundary(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """矩阵边界校验。

        检查正文是否超出矩阵规定的边界。
        """
        matrix = context.get("content_matrix", {})
        content = result.get("content", "")

        issues = []

        # 检查 exclude_scope
        exclude_scope = matrix.get("exclude_scope", "")
        if exclude_scope:
            violations = self._check_exclude_scope_violation(content, exclude_scope)
            issues.extend(violations)

        # 检查 no_duplicate_sections
        context_sections = context.get("context_sections", {})
        no_dup_sections = context_sections.get("no_duplicate_sections", [])
        if no_dup_sections:
            duplicates = self._check_duplicate_sections(content, no_dup_sections)
            issues.extend(duplicates)

        status = "pass"
        if issues:
            status = "warning"
        if any(i.get("type") == "exclude_scope_violation" for i in issues):
            status = "warning"

        return {
            "status": status,
            "write_scope": matrix.get("write_scope", ""),
            "exclude_scope": exclude_scope,
            "no_duplicate_section_count": len(no_dup_sections),
            "issues": issues,
        }

    def _check_exclude_scope_violation(
        self,
        content: str,
        exclude_scope: str,
    ) -> list[dict]:
        """检查是否违反排除范围。"""
        issues = []

        # 从排除范围中提取关键词
        keywords = self._split_scope_keywords(exclude_scope)

        for keyword in keywords:
            if keyword and len(keyword) >= 2 and keyword in content:
                issues.append({
                    "type": "exclude_scope_violation",
                    "keyword": keyword,
                    "message": f"正文可能包含本章不应展开的内容：{keyword}",
                })

        return issues

    def _check_duplicate_sections(
        self,
        content: str,
        no_dup_sections: list[dict],
    ) -> list[dict]:
        """检查是否重复了禁止重复章节的内容。"""
        issues = []

        for section in no_dup_sections:
            summary = section.get("summary", "")
            title = section.get("title", "")

            # 从摘要中提取关键词
            keywords = self._extract_keywords(summary)

            # 如果多个关键词都在正文中出现，可能重复
            found_count = sum(1 for kw in keywords if kw in content)
            if found_count >= len(keywords) * 0.6 and len(keywords) >= 3:
                issues.append({
                    "type": "potential_duplicate",
                    "section": f"{section.get('section_number')} {title}",
                    "message": f"正文可能重复了「{title}」章节的核心内容",
                    "keywords_found": found_count,
                })

        return issues

    def _split_scope_keywords(self, scope: str) -> list[str]:
        """从范围描述中分割关键词。"""
        # 按逗号、分号、换行分割
        parts = re.split(r"[,;\n]", scope)
        return [p.strip() for p in parts if p.strip()]

    def check_strict_mode_boundary(
        self,
        content: str,
        generation_mode: str,
    ) -> dict[str, Any]:
        """严格模式边界校验。

        检查正文是否包含严格模式禁止的内容。

        Args:
            content: 生成的正文内容
            generation_mode: 生成模式

        Returns:
            校验报告
        """
        # 普通模式不进行严格校验
        if generation_mode == "normal" or not generation_mode.startswith("strict_"):
            return {
                "status": "pass",
                "generation_mode": generation_mode,
                "issues": [],
            }

        # 获取该模式的禁止词
        forbidden_terms = STRICT_MODE_FORBIDDEN_TERMS.get(generation_mode, [])

        if not forbidden_terms:
            return {
                "status": "pass",
                "generation_mode": generation_mode,
                "issues": [],
            }

        # 检查禁止词
        hits = []
        for term in forbidden_terms:
            if term in content:
                hits.append(term)

        if hits:
            return {
                "status": "fail",
                "generation_mode": generation_mode,
                "issues": [
                    {
                        "type": "strict_mode_violation",
                        "severity": "high",
                        "message": f"严格模式章节出现禁止内容：{', '.join(hits)}",
                        "forbidden_terms_found": hits,
                        "suggestion": "请重新生成，仅保留本章允许的内容。",
                    }
                ],
            }

        return {
            "status": "pass",
            "generation_mode": generation_mode,
            "issues": [],
        }

    def _get_final_status(self, reports: list[dict]) -> str:
        """计算最终状态。"""
        if any(r.get("status") == "fail" for r in reports):
            return "fail"
        if any(r.get("status") == "warning" for r in reports):
            return "warning"
        return "pass"

    def _get_timestamp(self) -> str:
        """获取当前时间戳。"""
        from datetime import datetime

        return datetime.now().isoformat()