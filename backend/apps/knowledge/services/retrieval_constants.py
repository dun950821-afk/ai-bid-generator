# backend/apps/knowledge/services/retrieval_constants.py
"""检索编排常量。

通道映射对齐 KnowledgeBaseType 常量，修复 RagService 历史错配。
"""


# kb_type → RAG 通道（对齐 KnowledgeBaseType.CHOICES）
KB_TYPE_TO_CHANNEL = {
    "company_profile": "company_info",
    "case_library": "project_case",
    "qualification": "certificate",
    "product": "company_info",
    "bid_history": "historical_bid",
    "technical_solution": "historical_bid",
}

# 章节角色 → 检索通道
SECTION_ROLE_TO_CHANNELS = {
    "qualification": ["certificate", "company_info"],
    "technical_solution": ["company_info", "historical_bid", "project_case"],
    "business_response": ["company_info", "historical_bid"],
    "service_plan": ["company_info", "historical_bid", "project_case"],
    "team_intro": ["personnel", "certificate"],
    "attachment": [],
    "other": ["company_info", "historical_bid"],
}

# 关键词 → 检索通道
KEYWORD_TO_CHANNEL = {
    "资质": "certificate",
    "证书": "certificate",
    "认证": "certificate",
    "业绩": "project_case",
    "案例": "project_case",
    "项目经验": "project_case",
    "人员": "personnel",
    "团队": "personnel",
    "简历": "personnel",
    "技术方案": "historical_bid",
    "方案": "historical_bid",
    "公司": "company_info",
    "企业": "company_info",
}

# 严格模式 → 通道白名单（在 plan 阶段限定，覆盖默认推断）
STRICT_MODE_CHANNELS = {
    "strict_qualification": ["company_info", "certificate"],
    "strict_commitment": ["company_info"],
    "strict_attachment_index": [],
    "strict_resume": ["personnel"],
}

# 通道权重（跨通道 weighted RRF 用）
CHANNEL_WEIGHTS = {
    "company_info": 1.0,
    "historical_bid": 1.0,
    "project_case": 1.0,
    "certificate": 1.0,
    "personnel": 1.0,
}
