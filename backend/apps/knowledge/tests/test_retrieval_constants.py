# backend/apps/knowledge/tests/test_retrieval_constants.py
"""检索编排常量测试。"""

from apps.knowledge.services.retrieval_constants import (
    KB_TYPE_TO_CHANNEL,
    SECTION_ROLE_TO_CHANNELS,
    KEYWORD_TO_CHANNEL,
    STRICT_MODE_CHANNELS,
    CHANNEL_WEIGHTS,
)


class TestRetrievalConstants:
    """检索常量对齐 KnowledgeBaseType 测试。"""

    def test_kb_type_to_channel_aligned_with_constants(self):
        assert KB_TYPE_TO_CHANNEL["company_profile"] == "company_info"
        assert KB_TYPE_TO_CHANNEL["case_library"] == "project_case"
        assert KB_TYPE_TO_CHANNEL["qualification"] == "certificate"
        assert KB_TYPE_TO_CHANNEL["product"] == "company_info"
        assert KB_TYPE_TO_CHANNEL["bid_history"] == "historical_bid"
        assert KB_TYPE_TO_CHANNEL["technical_solution"] == "historical_bid"

    def test_section_role_channels(self):
        assert "certificate" in SECTION_ROLE_TO_CHANNELS["qualification"]
        assert "historical_bid" in SECTION_ROLE_TO_CHANNELS["technical_solution"]

    def test_strict_mode_channels(self):
        assert STRICT_MODE_CHANNELS["strict_qualification"] == ["company_info", "certificate"]
        assert STRICT_MODE_CHANNELS["strict_commitment"] == ["company_info"]

    def test_channel_weights(self):
        assert CHANNEL_WEIGHTS["company_info"] == 1.0
        assert "personnel" in CHANNEL_WEIGHTS
