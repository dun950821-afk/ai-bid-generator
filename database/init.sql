-- =====================================================
-- AI-Bid 智能标书生成系统 - 数据库初始化脚本
-- 数据库: PostgreSQL (Supabase)
-- 版本: 1.0.0
-- =====================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. 系统表
-- =====================================================

-- 系统设置表
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_settings_category_idx ON system_settings(category);
CREATE INDEX IF NOT EXISTS system_settings_key_idx ON system_settings(key);

-- 健康检查表
CREATE TABLE IF NOT EXISTS health_check (
    id SERIAL PRIMARY KEY,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2. 知识库相关表
-- =====================================================

-- 知识库文档表
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id VARCHAR(36) NOT NULL,
    name VARCHAR(500) NOT NULL,
    file_path TEXT,
    file_size BIGINT,
    file_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    -- pending, processing, completed, failed
    chunk_count INTEGER DEFAULT 0,
    metadata JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_documents_kb_idx ON knowledge_documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx ON knowledge_documents(status);

-- 文档表（用于招标文档解析）
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(36),
    name VARCHAR(500) NOT NULL,
    file_path TEXT,
    file_size BIGINT,
    file_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_project_idx ON documents(project_id);

-- =====================================================
-- 3. 项目相关表
-- =====================================================

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    project_number VARCHAR(100),
    knowledge_base_id VARCHAR(36),
    status VARCHAR(20) DEFAULT 'draft',
    -- draft, processing, completed, submitted
    metadata JSONB,
    extraction_result JSONB,
    created_by VARCHAR(36),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE INDEX IF NOT EXISTS projects_created_by_idx ON projects(created_by);
CREATE INDEX IF NOT EXISTS projects_kb_idx ON projects(knowledge_base_id);

-- 评分项表
CREATE TABLE IF NOT EXISTS scoring_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_name VARCHAR(200) NOT NULL,
    item_code VARCHAR(50),
    item_type VARCHAR(20) NOT NULL,
    -- technical, business, price
    parent_item_id VARCHAR(36),
    max_score INTEGER NOT NULL DEFAULT 0,
    weight INTEGER,
    scoring_rules JSONB DEFAULT '[]',
    reference_text TEXT,
    response_status VARCHAR(20) DEFAULT 'pending',
    -- pending, responded, verified
    response_quality VARCHAR(20),
    -- full, partial, none
    chapter_id VARCHAR(36),
    extracted_from TEXT,
    confidence_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scoring_items_project_idx ON scoring_items(project_id);
CREATE INDEX IF NOT EXISTS scoring_items_type_idx ON scoring_items(item_type);
CREATE INDEX IF NOT EXISTS scoring_items_parent_idx ON scoring_items(parent_item_id);
CREATE INDEX IF NOT EXISTS scoring_items_status_idx ON scoring_items(response_status);

-- 废标风险表
CREATE TABLE IF NOT EXISTS disqualification_risks (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    risk_type VARCHAR(50) NOT NULL,
    -- 否决条款, 资格要求, 格式要求, 保证金要求, 其他
    risk_description TEXT NOT NULL,
    source_text TEXT,
    source_location TEXT,
    response_status VARCHAR(20) DEFAULT 'unresponded',
    -- unresponded, responded, verified
    response_content TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    responded_by VARCHAR(36),
    severity VARCHAR(20) DEFAULT 'high',
    -- critical, high, medium, low
    mitigation_suggestion TEXT,
    extracted_from TEXT,
    confidence_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS disqualification_risks_project_idx ON disqualification_risks(project_id);
CREATE INDEX IF NOT EXISTS disqualification_risks_type_idx ON disqualification_risks(risk_type);
CREATE INDEX IF NOT EXISTS disqualification_risks_status_idx ON disqualification_risks(response_status);
CREATE INDEX IF NOT EXISTS disqualification_risks_severity_idx ON disqualification_risks(severity);

-- 风险因素表
CREATE TABLE IF NOT EXISTS risk_factors (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    factor_type VARCHAR(50) NOT NULL,
    factor_name VARCHAR(200) NOT NULL,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'medium',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_factors_project_idx ON risk_factors(project_id);

-- =====================================================
-- 4. 章节相关表
-- =====================================================

-- 章节内容表
CREATE TABLE IF NOT EXISTS bid_sections (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500),
    content TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    -- pending, generating, completed, failed
    is_locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR(100),
    lock_expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bid_sections_project_idx ON bid_sections(project_id);
CREATE INDEX IF NOT EXISTS bid_sections_status_idx ON bid_sections(status);

-- 映射矩阵表
CREATE TABLE IF NOT EXISTS mapping_matrices (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER DEFAULT 1,
    is_current BOOLEAN DEFAULT TRUE,
    mapping_data JSONB NOT NULL DEFAULT '[]',
    created_by VARCHAR(36),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mapping_matrices_project_idx ON mapping_matrices(project_id);
CREATE INDEX IF NOT EXISTS mapping_matrices_current_idx ON mapping_matrices(is_current);

-- =====================================================
-- 5. 评分标准表
-- =====================================================

-- 评分标准大类表
CREATE TABLE IF NOT EXISTS evaluation_criteria (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_name VARCHAR(200) NOT NULL,
    category_type VARCHAR(50),
    max_score INTEGER DEFAULT 0,
    weight DECIMAL(5,2),
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evaluation_criteria_project_idx ON evaluation_criteria(project_id);

-- 评分项明细表
CREATE TABLE IF NOT EXISTS evaluation_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    criteria_id VARCHAR(36) NOT NULL REFERENCES evaluation_criteria(id) ON DELETE CASCADE,
    item_name VARCHAR(200) NOT NULL,
    item_code VARCHAR(50),
    max_score INTEGER DEFAULT 0,
    scoring_rules JSONB DEFAULT '[]',
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evaluation_items_criteria_idx ON evaluation_items(criteria_id);

-- =====================================================
-- 6. 提取结果表
-- =====================================================

-- 招标文档提取结果表
CREATE TABLE IF NOT EXISTS tender_extraction_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    segment VARCHAR(50) NOT NULL,
    -- 'basic_info', 'scoring_criteria', 'disqualification_risks', etc.
    status VARCHAR(20) DEFAULT 'pending',
    -- pending, processing, completed, failed
    result JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tender_extraction_results_project_idx ON tender_extraction_results(project_id);
CREATE INDEX IF NOT EXISTS tender_extraction_results_segment_idx ON tender_extraction_results(segment);

-- =====================================================
-- 7. 上传相关表
-- =====================================================

-- 上传会话表
CREATE TABLE IF NOT EXISTS upload_sessions (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    chunk_size INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    uploaded_chunks INTEGER[] DEFAULT '{}',
    knowledge_base_id VARCHAR(36),
    status VARCHAR(20) DEFAULT 'pending',
    -- pending, uploading, completed, cancelled
    storage_key TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS upload_sessions_status_idx ON upload_sessions(status);

-- LLM文件缓存表
CREATE TABLE IF NOT EXISTS llm_file_cache (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id VARCHAR(36) NOT NULL,
    file_id VARCHAR(100),
    parsed_content TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_file_cache_upload_idx ON llm_file_cache(upload_id);

-- =====================================================
-- 8. 项目字典表
-- =====================================================

-- 项目字典表（企业信息、资质等）
CREATE TABLE IF NOT EXISTS project_dictionaries (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    -- company_info, qualification, team_member, etc.
    name VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_dictionaries_category_idx ON project_dictionaries(category);
CREATE INDEX IF NOT EXISTS project_dictionaries_active_idx ON project_dictionaries(is_active);

-- =====================================================
-- 9. 章节引用表
-- =====================================================

-- 章节引用表
CREATE TABLE IF NOT EXISTS section_citations (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id VARCHAR(36) NOT NULL,
    chunk_id VARCHAR(36) NOT NULL,
    document_id VARCHAR(36),
    document_name VARCHAR(500),
    cited_text TEXT,
    source_text TEXT,
    relevance_score DECIMAL(5,4),
    offsets JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS section_citations_section_idx ON section_citations(section_id);
CREATE INDEX IF NOT EXISTS section_citations_chunk_idx ON section_citations(chunk_id);

-- =====================================================
-- 10. 初始化系统设置数据
-- =====================================================

INSERT INTO system_settings (category, key, value, description) VALUES
-- LLM配置
('llm', 'api_url', '', 'LLM API地址'),
('llm', 'api_key', '', 'LLM API密钥'),
('llm', 'model', 'qwen-long', '默认模型'),
('llm', 'doc_extract_model', 'qwen-long', '文档提取模型'),
('llm', 'temperature', '0.7', '生成温度'),
('llm', 'max_tokens', '16000', '最大Token数'),

-- 百炼配置
('bailian', 'api_key', '', '阿里云百炼API密钥'),
('bailian', 'endpoint', '', '百炼服务端点'),

-- 系统配置
('system', 'app_name', 'AI-Bid智能标书生成系统', '系统名称'),
('system', 'version', '1.0.0', '系统版本')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 11. 创建更新时间触发器函数
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为所有需要的表添加更新时间触发器
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'system_settings', 'knowledge_documents', 'documents', 'projects',
        'scoring_items', 'disqualification_risks', 'risk_factors',
        'bid_sections', 'mapping_matrices', 'evaluation_criteria',
        'evaluation_items', 'tender_extraction_results', 'upload_sessions',
        'llm_file_cache', 'project_dictionaries'
    ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON %s
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- =====================================================
-- 完成
-- =====================================================

-- 插入健康检查记录
INSERT INTO health_check (updated_at) VALUES (NOW());

-- 输出完成信息
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'AI-Bid 数据库初始化完成!';
    RAISE NOTICE '创建时间: %', NOW();
    RAISE NOTICE '========================================';
END
$$;
