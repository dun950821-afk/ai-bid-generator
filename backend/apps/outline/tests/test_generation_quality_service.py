# backend/apps/outline/tests/test_generation_quality_service.py
"""正文生成质量校验测试。"""

import pytest

from apps.outline.services.generation_quality_service import GenerationQualityService


class TestGenerationQualityService:
    """GenerationQualityService 测试。"""

    def setup_method(self):
        self.service = GenerationQualityService()

    def test_check_analysis_point_coverage_pass(self):
        """必须响应条款全部覆盖时 pass。"""
        context = {
            "analysis_points": {
                "must_respond": [
                    {"id": 1, "title": "条款1"},
                    {"id": 2, "title": "条款2"},
                ],
                "score_points": [],
            }
        }
        result = {
            "used_analysis_point_ids": [1, 2],
            "content": "正文内容",
        }

        report = self.service.check_analysis_point_coverage(context, result)

        assert report["status"] == "pass"
        assert report["total_must_respond"] == 2
        assert report["covered_count"] == 2
        assert len(report["missing_analysis_point_ids"]) == 0

    def test_check_analysis_point_coverage_warning(self):
        """必须响应条款未覆盖时 warning。"""
        context = {
            "analysis_points": {
                "must_respond": [
                    {"id": 1, "title": "条款1"},
                    {"id": 2, "title": "条款2"},
                ],
                "score_points": [],
            }
        }
        result = {
            "used_analysis_point_ids": [1],
            "content": "正文内容",
        }

        report = self.service.check_analysis_point_coverage(context, result)

        assert report["status"] == "warning"
        assert report["missing_analysis_point_ids"] == [2]

    def test_check_rag_fact_risk_pass(self):
        """RAG 有素材时 pass。"""
        context = {
            "rag_materials": {
                "personnel": [{"chunk_id": "1"}],
                "certificate": [{"chunk_id": "2"}],
            }
        }
        result = {
            "content": "项目经理张三，证书编号123",
        }

        report = self.service.check_rag_fact_risk(context, result)

        assert report["status"] == "pass"
        assert report["rag_material_count"] == 2

    def test_check_rag_fact_risk_warning(self):
        """RAG 为空但正文出现事实关键词时 warning。"""
        context = {
            "rag_materials": {}
        }
        result = {
            "content": "项目经理张三，证书编号123，业绩金额100万",
        }

        report = self.service.check_rag_fact_risk(context, result)

        assert report["status"] == "warning"
        assert len(report["issues"]) >= 1
        assert report["issues"][0]["type"] == "unsupported_fact_risk"

    def test_check_rag_fact_risk_no_fact_keywords(self):
        """正文无事实关键词时 pass。"""
        context = {
            "rag_materials": {}
        }
        result = {
            "content": "本章介绍项目实施方案和技术路线",
        }

        report = self.service.check_rag_fact_risk(context, result)

        assert report["status"] == "pass"

    def test_check_matrix_boundary_pass(self):
        """未违反矩阵边界时 pass。"""
        context = {
            "content_matrix": {
                "write_scope": "技术方案",
                "exclude_scope": "商务报价",
            },
            "context_sections": {
                "no_duplicate_sections": []
            }
        }
        result = {
            "content": "本技术方案采用先进的技术架构...",
        }

        report = self.service.check_matrix_boundary(context, result)

        assert report["status"] == "pass"

    def test_check_matrix_boundary_exclude_violation(self):
        """违反排除范围时 warning。"""
        context = {
            "content_matrix": {
                "write_scope": "技术方案",
                "exclude_scope": "商务报价,价格",
            },
            "context_sections": {
                "no_duplicate_sections": []
            }
        }
        result = {
            "content": "本技术方案的总价格为100万元...",
        }

        report = self.service.check_matrix_boundary(context, result)

        assert report["status"] == "warning"
        assert any(i["type"] == "exclude_scope_violation" for i in report["issues"])

    def test_run_all_checks(self):
        """运行所有校验。"""
        context = {
            "analysis_points": {
                "must_respond": [{"id": 1, "title": "条款1"}],
                "score_points": [],
            },
            "rag_materials": {"personnel": [{"chunk_id": "1"}]},
            "content_matrix": {
                "write_scope": "技术方案",
                "exclude_scope": "",
            },
            "context_sections": {"no_duplicate_sections": []}
        }
        result = {
            "used_analysis_point_ids": [1],
            "content": "技术方案正文",
        }

        report = self.service.run_all_checks(context, result)

        assert "analysis_point_coverage" in report
        assert "rag_fact_check" in report
        assert "matrix_boundary_check" in report
        assert "final_status" in report
        assert report["final_status"] == "pass"
