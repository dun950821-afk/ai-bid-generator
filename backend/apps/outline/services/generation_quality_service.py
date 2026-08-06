# backend/apps/outline/services/generation_quality_service.py
"""正文生成质量校验服务。

基于 generation_mode 和 content_matrix 进行校验，
不针对具体章节标题写死规则。
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def get_expected_word_range(generation_mode, writing_depth=None, content_structure_policy=None) -> dict:
    """按正文结构策略 / 生成模式 + 写作深度取预期字数区间。

    Returns:
        {"min": int, "max": int}；取不到时返回 {}。
    """
    # 根据正文结构策略确定预期长度
    policy_ranges = {
        "category_summary": {"min": 200, "max": 500},
        "internal_headings": {"min": 300, "max": 3000},
        "plain_paragraphs": {"min": 100, "max": 1500},
        "table_only": {"min": 50, "max": 2000},
        "material_placeholder": {"min": 80, "max": 500},
    }

    if content_structure_policy and content_structure_policy in policy_ranges:
        return policy_ranges[content_structure_policy]

    # 根据模式和深度确定预期长度
    expected_ranges = {
        "parent_overview": {"min": 100, "max": 800},
        "leaf_content": {
            "overview": {"min": 200, "max": 1000},
            "moderate": {"min": 300, "max": 3000},
            "detailed": {"min": 500, "max": 5000},
        },
        "table_response": {"min": 50, "max": 2000},
        "fixed_material": {"min": 50, "max": 1000},
        "commitment": {"min": 100, "max": 1000},
        "resume_or_personnel": {"min": 100, "max": 2000},
        "case_or_evidence": {"min": 200, "max": 3000},
        "summary_or_index": {"min": 50, "max": 500},
    }

    if generation_mode == "leaf_content":
        return expected_ranges.get(generation_mode, {}).get(writing_depth, {})
    return expected_ranges.get(generation_mode, {})


class GenerationQualityService:
    """正文生成质量校验服务。

    执行基于模式的校验：
    - heading_pollution: 正文开头是否出现章节标题、Markdown 标题、编号标题
    - internal_id_pollution: 是否出现内部 ID 引用
    - child_outline_dump: 父章节是否出现子章节编号清单
    - generated_subsection_number: 叶子章节是否出现私自生成的子编号
    - fixed_material_numbered_subheading: 固定材料章节是否出现小标题
    - table_blank_line_error: Markdown 表格是否存在空行
    - boundary_check: 是否违反 write_scope / exclude_scope
    - mode_check: 内容形态是否符合 generation_mode
    - fact_check: 是否存在缺少来源支撑的事实型内容
    - length_check: 是否符合 writing_depth 和 generation_mode 对长度的要求
    - duplication_check: 是否和 no_duplicate_sections 指定章节重复
    - missing_info_check: 是否遗漏 must_respond 的要求
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

    # 不同模式的内容类型关键词
    MODE_CONTENT_KEYWORDS = {
        "parent_overview": {
            "expected": ["总述", "概述", "包括", "由", "分为"],
            "forbidden": ["技术参数", "系统架构", "实施方案", "案例详情", "合同金额"],
        },
        "leaf_content": {
            "expected": [],
            "forbidden": [],
        },
        "table_response": {
            "expected": ["|", "表格", "清单"],
            "forbidden": ["以下是", "根据要求"],
        },
        "fixed_material": {
            "expected": ["营业执照", "证书", "资质", "附件", "材料"],
            "forbidden": ["技术方案", "系统架构", "实施方案", "案例", "项目业绩"],
        },
        "commitment": {
            "expected": ["承诺", "保证", "声明", "确保"],
            "forbidden": ["案例", "技术参数", "合同金额", "项目业绩"],
        },
        "resume_or_personnel": {
            "expected": ["姓名", "学历", "职称", "简历", "人员"],
            "forbidden": ["技术方案", "系统架构", "实施方案"],
        },
        "case_or_evidence": {
            "expected": ["项目", "案例", "业绩", "合同", "业主"],
            "forbidden": [],
        },
        "summary_or_index": {
            "expected": ["目录", "索引", "章节", "页码"],
            "forbidden": [],
        },
    }

    # 子章节编号清单模式
    CHILD_OUTLINE_DUMP_PATTERNS = [
        r"\d+\.\d+(?:\s*[、,，]\s*\d+\.\d+){2,}",  # 6.1、6.2、6.3
        r"\d+\.\d+\s*[-~至]\s*\d+\.\d+",  # 12.1-12.3
        r"（\d+\.\d+\s*[-~至]\s*\d+\.\d+）",  # （12.1-12.3）
    ]

    # 私自生成的子编号模式
    GENERATED_SUBSECTION_PATTERNS = [
        r"\d+\.\d+\.\d+[、.．\s]",  # 12.9.1
        r"\d+\.\d+\.\d+\.\d+[、.．\s]",  # 1.1.1.1
    ]

    # 固定材料章节小标题模式
    FIXED_MATERIAL_SUBHEADING_PATTERNS = [
        r"^[一二三四五六七八九十]+、",  # 一、主要内容
        r"^（[一二三四五六七八九十]+）",  # （一）补充说明
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
        generation_mode = context.get("generation_mode", "leaf_content")
        content_structure_policy = context.get("content_structure_policy", None)
        content = result.get("content", "")

        # 1. 章节标题污染检查
        heading_check = self.check_heading_pollution(content)

        # 2. 内部 ID 污染检查
        internal_id_check = self.check_internal_id_pollution(content)

        # 3. 正文结构策略检查
        structure_check = self.check_content_structure(content, content_structure_policy)

        # 4. 模式内容检查
        mode_check = self.check_mode_content(content, generation_mode)

        # 5. 边界检查
        boundary_check = self.check_boundary(context, result)

        # 6. 得分点覆盖检查
        coverage_check = self.check_analysis_point_coverage(context, result)

        # 7. RAG 事实风险检查
        rag_fact_check = self.check_rag_fact_risk(context, result)

        # 8. 表格检查
        table_check = self.check_table_format(content)

        # 9. 长度检查
        length_check = self.check_length(content, context)

        # 10. 重复检查
        duplication_check = self.check_duplication(context, result)

        # 11. 缺失信息检查
        missing_info_check = self.check_missing_info(context, result)

        # 计算最终状态
        reports = [
            heading_check,
            internal_id_check,
            structure_check,
            mode_check,
            boundary_check,
            coverage_check,
            rag_fact_check,
            table_check,
            length_check,
            duplication_check,
            missing_info_check,
        ]
        final_status = self._get_final_status(reports)

        return {
            "heading_pollution": heading_check,
            "internal_id_pollution": internal_id_check,
            "content_structure": structure_check,
            "mode_check": mode_check,
            "boundary_check": boundary_check,
            "analysis_point_coverage": coverage_check,
            "rag_fact_check": rag_fact_check,
            "table_check": table_check,
            "length_check": length_check,
            "duplication_check": duplication_check,
            "missing_info_check": missing_info_check,
            "final_status": final_status,
            "checked_at": self._get_timestamp(),
        }

    def check_heading_pollution(self, content: str) -> dict[str, Any]:
        """检查正文开头是否出现章节标题、Markdown 标题、编号标题。

        Returns:
            校验报告
        """
        issues = []
        lines = content.split("\n") if content else []

        if not lines:
            return {"status": "pass", "issues": []}

        # 检查前 5 行
        for i, line in enumerate(lines[:5]):
            line_stripped = line.strip()

            # 中文编号标题
            if re.match(r"^[一二三四五六七八九十]+、", line_stripped):
                issues.append({
                    "type": "heading_pollution",
                    "severity": "high",
                    "message": f"正文第{i+1}行包含中文编号标题",
                    "line": line_stripped[:50],
                })

            # 数字编号标题
            if re.match(r"^\d+(\.\d+)*[、.．]", line_stripped):
                issues.append({
                    "type": "heading_pollution",
                    "severity": "high",
                    "message": f"正文第{i+1}行包含数字编号标题",
                    "line": line_stripped[:50],
                })

            # Markdown 标题
            if re.match(r"^#{1,6}\s+", line_stripped):
                issues.append({
                    "type": "markdown_heading",
                    "severity": "high",
                    "message": f"正文第{i+1}行包含 Markdown 标题",
                    "line": line_stripped[:50],
                })

        status = "fail" if any(i["severity"] == "high" for i in issues) else "pass"

        return {"status": status, "issues": issues}

    def check_internal_id_pollution(self, content: str) -> dict[str, Any]:
        """检查是否出现内部 ID 引用。

        Returns:
            校验报告
        """
        issues = []

        # 内部 ID 模式
        id_patterns = [
            (r"章节\s*\d+[\s.]*\d*", "章节ID引用"),
            (r"ID[:：]\s*\d+", "数据库ID"),
            (r"\bsection_id[:：]\s*\d+", "内部ID"),
            (r"\bsort_order[:：]\s*\d+", "排序编号"),
        ]

        for pattern, name in id_patterns:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "internal_id_pollution",
                    "severity": "high",
                    "message": f"正文包含{name}",
                    "matches": matches[:3],
                })

        status = "fail" if issues else "pass"

        return {"status": status, "issues": issues}

    def check_content_structure(
        self,
        content: str,
        content_structure_policy: str | None,
    ) -> dict[str, Any]:
        """检查内容结构是否符合 content_structure_policy。

        Returns:
            校验报告
        """
        issues = []

        if not content_structure_policy:
            return {"status": "pass", "issues": [], "policy": None}

        # 父章节模式：检查子章节编号清单
        if content_structure_policy == "category_summary":
            for pattern in self.CHILD_OUTLINE_DUMP_PATTERNS:
                matches = re.findall(pattern, content)
                if matches:
                    issues.append({
                        "type": "child_outline_dump",
                        "severity": "high",
                        "message": "父章节包含子章节编号清单",
                        "matches": matches[:3],
                    })

        # 技术叶子章节：检查私自生成的子编号
        elif content_structure_policy == "internal_headings":
            for pattern in self.GENERATED_SUBSECTION_PATTERNS:
                matches = re.findall(pattern, content)
                if matches:
                    issues.append({
                        "type": "generated_subsection_number",
                        "severity": "high",
                        "message": "叶子章节包含私自生成的子编号",
                        "matches": matches[:3],
                    })

        # 固定材料章节：检查小标题
        elif content_structure_policy == "material_placeholder":
            lines = content.split("\n") if content else []
            for line in lines[:10]:
                for pattern in self.FIXED_MATERIAL_SUBHEADING_PATTERNS:
                    if re.match(pattern, line.strip()):
                        issues.append({
                            "type": "fixed_material_numbered_subheading",
                            "severity": "high",
                            "message": "固定材料章节包含编号小标题",
                            "line": line.strip()[:50],
                        })

        status = "fail" if any(i["severity"] == "high" for i in issues) else "pass"

        return {"status": status, "issues": issues, "policy": content_structure_policy}

    def check_mode_content(
        self,
        content: str,
        generation_mode: str,
    ) -> dict[str, Any]:
        """检查内容形态是否符合 generation_mode。

        不针对具体章节标题，而是基于模式特征检查。
        """
        mode_keywords = self.MODE_CONTENT_KEYWORDS.get(generation_mode, {})
        expected = mode_keywords.get("expected", [])
        forbidden = mode_keywords.get("forbidden", [])

        issues = []

        # 检查预期关键词
        expected_found = []
        for kw in expected:
            if kw in content:
                expected_found.append(kw)

        # 检查禁止关键词
        forbidden_found = []
        for kw in forbidden:
            if kw in content:
                forbidden_found.append(kw)

        # 判断状态
        status = "pass"
        if forbidden_found:
            status = "warning"
            issues.append({
                "type": "forbidden_content",
                "severity": "medium",
                "message": f"内容包含 {generation_mode} 模式不应出现的词汇：{', '.join(forbidden_found[:5])}",
                "forbidden_found": forbidden_found,
            })

        # 对于某些模式，预期关键词是必须的
        if expected and not expected_found:
            if generation_mode in ["table_response", "commitment", "summary_or_index"]:
                status = "warning"
                issues.append({
                    "type": "missing_expected",
                    "severity": "low",
                    "message": f"内容缺少 {generation_mode} 模式预期的关键词",
                    "expected": expected,
                })

        return {
            "status": status,
            "generation_mode": generation_mode,
            "expected_found": expected_found,
            "forbidden_found": forbidden_found,
            "issues": issues,
        }

    def check_number_pollution(self, content: str) -> dict[str, Any]:
        """检查是否出现章节编号、标题、内部 ID 污染。"""
        issues = []

        # 检查章节编号污染
        section_patterns = [
            (r"^[一二三四五六七八九十]+、", "中文编号标题"),
            (r"^第[一二三四五六七八九十\d]+[章节]", "第X章/节"),
            (r"^\d+(\.\d+)*[、.．]", "数字编号标题"),
        ]

        lines = content.split("\n")
        for line in lines[:10]:  # 只检查前10行
            for pattern, name in section_patterns:
                if re.match(pattern, line.strip()):
                    issues.append({
                        "type": "section_number_pollution",
                        "severity": "high",
                        "message": f"正文开头包含{name}",
                        "line": line.strip()[:50],
                    })

        # 检查 Markdown 标题
        if lines and lines[0].strip().startswith("#"):
            issues.append({
                "type": "markdown_heading",
                "severity": "high",
                "message": "正文开头包含 Markdown 标题",
                "line": lines[0].strip()[:50],
            })

        # 检查内部 ID
        id_patterns = [
            (r"章节\s*\d+", "章节ID引用"),
            (r"ID[:：]\s*\d+", "数据库ID"),
            (r"section_id[:：]\s*\d+", "内部ID"),
        ]

        for pattern, name in id_patterns:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "internal_id_reference",
                    "severity": "medium",
                    "message": f"正文包含{name}",
                    "matches": matches[:3],
                })

        status = "pass" if not issues else "warning"
        if any(i["severity"] == "high" for i in issues):
            status = "fail"

        return {
            "status": status,
            "issues": issues,
        }

    def check_boundary(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """边界检查：是否违反 write_scope / exclude_scope。"""
        matrix = context.get("content_matrix", {})
        content = result.get("content", "")

        issues = []

        # 检查 exclude_scope
        exclude_scope = matrix.get("exclude_scope", "")
        if exclude_scope:
            violations = self._check_exclude_scope_violation(content, exclude_scope)
            issues.extend(violations)

        # 检查 no_duplicate_sections
        ctx_sections = context.get("context_sections", {})
        no_dup_sections = ctx_sections.get("no_duplicate_sections", [])
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

            keywords = self._extract_keywords(summary)
            found_count = sum(1 for kw in keywords if kw in content)

            if found_count >= len(keywords) * 0.6 and len(keywords) >= 3:
                issues.append({
                    "type": "potential_duplicate",
                    "section": f"{section.get('section_number')} {title}",
                    "message": f"正文可能重复了「{title}」章节的核心内容",
                    "keywords_found": found_count,
                })

        return issues

    def check_analysis_point_coverage(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """得分点覆盖检查。"""
        analysis_points = context.get("analysis_points", {})
        must_respond = analysis_points.get("must_respond", [])

        must_ids = [p.get("id") for p in must_respond if p.get("id")]
        used_ids = result.get("used_analysis_point_ids", [])

        missing_ids = [pid for pid in must_ids if pid not in used_ids]

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

    def check_rag_fact_risk(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """RAG 事实风险检查。"""
        content = result.get("content", "")
        rag_materials = context.get("rag_materials", {})

        rag_count = sum(len(items) for items in rag_materials.values())

        risk_flags = []

        if rag_count == 0:
            found_keywords = [kw for kw in self.FACT_KEYWORDS if kw in content]
            if found_keywords:
                risk_flags.append({
                    "type": "unsupported_fact_risk",
                    "message": (
                        f"正文包含人员、证书、业绩等事实性内容（{', '.join(found_keywords)}），"
                        f"但未检索到 RAG 素材支撑。"
                    ),
                    "keywords": found_keywords,
                })

        model_risks = result.get("risk_flags", [])
        for risk in model_risks:
            if risk.get("type") not in ["json_parse_failed"]:
                risk_flags.append(risk)

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

        return {
            "status": status,
            "rag_material_count": rag_count,
            "rag_channels": {
                channel: len(items)
                for channel, items in rag_materials.items()
            },
            "issues": risk_flags,
        }

    def check_table_format(self, content: str) -> dict[str, Any]:
        """检查 Markdown 表格格式。"""
        issues = []

        # 查找表格
        table_pattern = r"\|[^\n]+\|"
        tables = re.findall(table_pattern, content)

        if not tables:
            return {
                "status": "pass",
                "has_table": False,
                "issues": [],
            }

        # 检查表格格式
        table_issues = []

        # 检查是否有分隔行
        separator_pattern = r"\|[-:]+\|"
        has_separator = bool(re.search(separator_pattern, content))

        if tables and not has_separator:
            table_issues.append({
                "type": "missing_separator",
                "message": "表格缺少分隔行",
            })

        # 检查表格内是否有空行
        lines = content.split("\n")
        in_table = False
        for i, line in enumerate(lines):
            if "|" in line:
                in_table = True
            elif in_table and line.strip() and "|" not in line:
                # 表格内的非表格行
                table_issues.append({
                    "type": "table_internal_blank",
                    "message": f"表格内可能存在空行或非表格内容（第{i+1}行）",
                })

        status = "pass"
        if table_issues:
            status = "warning"

        return {
            "status": status,
            "has_table": True,
            "table_count": len(tables),
            "issues": table_issues,
        }

    def check_length(
        self,
        content: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """检查长度是否符合要求。"""
        word_count = len(content)
        generation_mode = context.get("generation_mode", "leaf_content")
        content_structure_policy = context.get("content_structure_policy", None)
        matrix = context.get("content_matrix", {})
        writing_depth = matrix.get("writing_depth", "moderate")

        issues = []

        range_config = get_expected_word_range(
            generation_mode,
            writing_depth=writing_depth,
            content_structure_policy=content_structure_policy,
        )

        min_words = range_config.get("min", 50)
        max_words = range_config.get("max", 5000)

        if word_count < min_words:
            issues.append({
                "type": "too_short",
                "message": f"正文字数({word_count})可能过少，预期至少{min_words}字",
            })
        elif word_count > max_words:
            issues.append({
                "type": "too_long",
                "message": f"正文字数({word_count})可能过多，预期最多{max_words}字",
            })

        status = "pass" if not issues else "warning"

        return {
            "status": status,
            "word_count": word_count,
            "expected_range": {"min": min_words, "max": max_words},
            "issues": issues,
        }

    def check_duplication(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """检查是否和 no_duplicate_sections 指定章节重复。"""
        # 已在 boundary_check 中实现
        ctx_sections = context.get("context_sections", {})
        no_dup_sections = ctx_sections.get("no_duplicate_sections", [])
        content = result.get("content", "")

        issues = self._check_duplicate_sections(content, no_dup_sections)

        status = "pass" if not issues else "warning"

        return {
            "status": status,
            "no_duplicate_section_count": len(no_dup_sections),
            "issues": issues,
        }

    def check_missing_info(
        self,
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """检查是否遗漏 must_respond 的要求。"""
        analysis_points = context.get("analysis_points", {})
        must_respond = analysis_points.get("must_respond", [])

        content = result.get("content", "")
        missing_info = result.get("missing_info", [])

        issues = []

        # 检查模型自报的缺失信息
        for info in missing_info:
            if info.get("type") in ["missing_personnel", "missing_certificate", "missing_case", "missing_company_info"]:
                issues.append({
                    "type": info["type"],
                    "message": info.get("message", ""),
                })

        # 检查 must_respond 的关键词覆盖
        for point in must_respond[:5]:
            title = point.get("title", "")
            keywords = self._extract_keywords(title)
            found = sum(1 for kw in keywords if kw in content)

            if found < len(keywords) * 0.3 and len(keywords) >= 2:
                issues.append({
                    "type": "potentially_missing_requirement",
                    "message": f"可能遗漏必须响应的要求：{title}",
                    "requirement_id": point.get("id"),
                })

        status = "pass" if not issues else "warning"

        return {
            "status": status,
            "issues": issues,
        }

    def _extract_keywords(self, text: str) -> list[str]:
        """从文本中提取关键词。"""
        clean_text = re.sub(r"[^\w\s]", " ", text)
        words = clean_text.split()
        return [w for w in words if len(w) >= 2]

    def _split_scope_keywords(self, scope: str) -> list[str]:
        """从范围描述中分割关键词。"""
        parts = re.split(r"[,;\n]", scope)
        return [p.strip() for p in parts if p.strip()]

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
