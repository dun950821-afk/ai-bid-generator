-- =====================================================
-- 缺失表补充迁移脚本 - 请在 Supabase SQL Editor 中执行
-- 版本: 010
-- 描述: 创建项目代码中引用但数据库中缺失的表
-- =====================================================

-- =====================================================
-- 1. 系统设置表
-- =====================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

COMMENT ON TABLE system_settings IS '系统配置表，存储API密钥、模型配置等系统级设置';
COMMENT ON COLUMN system_settings.category IS '配置分类：llm, embedding, storage, general';

-- =====================================================
-- 2. 文档缓存表
-- =====================================================
CREATE TABLE IF NOT EXISTS document_cache (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER DEFAULT 0,
  file_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_document_cache_project ON document_cache(project_id);

COMMENT ON TABLE document_cache IS '文档全文缓存表，避免重复提取文档内容';

-- =====================================================
-- 3. LLM文件缓存表
-- =====================================================
CREATE TABLE IF NOT EXISTS llm_file_cache (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  upload_id VARCHAR(100) NOT NULL UNIQUE,
  llm_file_id VARCHAR(100) NOT NULL,
  filename VARCHAR(500),
  file_url TEXT,
  file_size INTEGER,
  status VARCHAR(20) DEFAULT 'ready',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_llm_file_cache_upload_id ON llm_file_cache(upload_id);
CREATE INDEX IF NOT EXISTS idx_llm_file_cache_status ON llm_file_cache(status);
CREATE INDEX IF NOT EXISTS idx_llm_file_cache_expires_at ON llm_file_cache(expires_at);

COMMENT ON TABLE llm_file_cache IS 'LLM文件ID缓存表，存储上传到百炼平台的文件ID';
COMMENT ON COLUMN llm_file_cache.status IS '状态：ready-可用, expired-过期, error-错误, uploading-上传中';

-- =====================================================
-- 4. 知识块表（knowledge_chunks）
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id VARCHAR(36),
  knowledge_base_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER,
  embedding vector(1024),
  start_position INTEGER,
  end_position INTEGER,
  page_number INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb ON knowledge_chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks(document_id);

COMMENT ON TABLE knowledge_chunks IS '知识块表，用于知识库检索功能';

-- 创建向量索引（如果document_chunks表有）
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_knowledge_chunks_embedding') THEN
        RAISE NOTICE '知识块向量索引已存在';
    ELSE
        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding 
        ON knowledge_chunks 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    END IF;
END $$;

-- =====================================================
-- 5. 评估标准表（evaluation_criteria）
-- =====================================================
CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  seq INTEGER DEFAULT 0,
  category VARCHAR(200) NOT NULL,
  total_score DECIMAL(10, 2) DEFAULT 0,
  category_type VARCHAR(50),
  items JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_project ON evaluation_criteria(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_type ON evaluation_criteria(category_type);

COMMENT ON TABLE evaluation_criteria IS '评估标准大类表';

-- =====================================================
-- 6. 评估项目表（evaluation_items）
-- =====================================================
CREATE TABLE IF NOT EXISTS evaluation_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  criteria_id VARCHAR(36) NOT NULL,
  sub_item VARCHAR(500) NOT NULL,
  item_score DECIMAL(10, 2) DEFAULT 0,
  rule TEXT,
  basis TEXT,
  tech_doc_ref TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evaluation_items_criteria ON evaluation_items(criteria_id);

COMMENT ON TABLE evaluation_items IS '评估细项表';

-- =====================================================
-- 7. 后台任务表（background_tasks）
-- =====================================================
CREATE TABLE IF NOT EXISTS background_tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  stage VARCHAR(100),
  stage_detail TEXT,
  error_message TEXT,
  result JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_background_tasks_project ON background_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_background_tasks_status ON background_tasks(status);
CREATE INDEX IF NOT EXISTS idx_background_tasks_type ON background_tasks(task_type);

COMMENT ON TABLE background_tasks IS '后台任务表，管理长时间运行的任务';
COMMENT ON COLUMN background_tasks.task_type IS '任务类型：extraction, outline_generation, content_generation';
COMMENT ON COLUMN background_tasks.status IS '状态：pending, running, completed, failed';

-- =====================================================
-- 8. 招标提取结果表（tender_extraction_results）
-- =====================================================
CREATE TABLE IF NOT EXISTS tender_extraction_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  extracted_data JSONB NOT NULL,
  extraction_metadata JSONB DEFAULT '{}',
  confidence_score DECIMAL(5, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_tender_extraction_project ON tender_extraction_results(project_id);

COMMENT ON TABLE tender_extraction_results IS '招标文档提取结果表';

-- =====================================================
-- 9. 评分项表（scoring_items）
-- =====================================================
CREATE TABLE IF NOT EXISTS scoring_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  item_code VARCHAR(50),
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('technical', 'business', 'price')),
  parent_item_id VARCHAR(36),
  max_score DECIMAL(5, 2) NOT NULL,
  weight DECIMAL(5, 2),
  scoring_rules JSONB DEFAULT '[]',
  response_status VARCHAR(20) DEFAULT 'pending' CHECK (response_status IN ('pending', 'responded', 'verified')),
  response_quality VARCHAR(20) CHECK (response_quality IN ('full', 'partial', 'none')),
  chapter_id VARCHAR(36),
  extracted_from TEXT,
  confidence_score DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_items_project ON scoring_items(project_id);
CREATE INDEX IF NOT EXISTS idx_scoring_items_type ON scoring_items(item_type);
CREATE INDEX IF NOT EXISTS idx_scoring_items_parent ON scoring_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_scoring_items_status ON scoring_items(response_status);

COMMENT ON TABLE scoring_items IS '评分项表：存储从招标文档提取的评分项信息';

-- =====================================================
-- 10. 废标风险表（disqualification_risks）
-- =====================================================
CREATE TABLE IF NOT EXISTS disqualification_risks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  risk_type VARCHAR(50) NOT NULL,
  risk_description TEXT NOT NULL,
  source_text TEXT,
  source_location TEXT,
  response_status VARCHAR(20) DEFAULT 'unresponded' CHECK (response_status IN ('unresponded', 'responded', 'verified')),
  response_content TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  severity VARCHAR(20) DEFAULT 'high' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  extracted_from TEXT,
  confidence_score DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disqualification_risks_project ON disqualification_risks(project_id);
CREATE INDEX IF NOT EXISTS idx_disqualification_risks_type ON disqualification_risks(risk_type);
CREATE INDEX IF NOT EXISTS idx_disqualification_risks_status ON disqualification_risks(response_status);
CREATE INDEX IF NOT EXISTS idx_disqualification_risks_severity ON disqualification_risks(severity);

COMMENT ON TABLE disqualification_risks IS '废标风险表：存储可能导致废标的风险项';

-- =====================================================
-- 11. 投标章节表（bid_sections）
-- =====================================================
CREATE TABLE IF NOT EXISTS bid_sections (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'draft', 'generating', 'generated', 'approved')),
  chapter_number VARCHAR(20),
  parent_chapter VARCHAR(100),
  word_count INTEGER DEFAULT 0,
  lock_status VARCHAR(20) DEFAULT 'unlocked' CHECK (lock_status IN ('locked', 'unlocked')),
  locked_by VARCHAR(36),
  locked_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bid_sections_project ON bid_sections(project_id);
CREATE INDEX IF NOT EXISTS idx_bid_sections_status ON bid_sections(status);
CREATE INDEX IF NOT EXISTS idx_bid_sections_chapter ON bid_sections(chapter_number);

COMMENT ON TABLE bid_sections IS '投标章节表';
COMMENT ON COLUMN bid_sections.status IS '状态：pending-待生成, draft-草稿, generating-生成中, generated-已生成, approved-已审批';
COMMENT ON COLUMN bid_sections.lock_status IS '锁定状态：locked-已锁定, unlocked-未锁定';

-- =====================================================
-- 12. 内容引用表（content_citations）
-- =====================================================
CREATE TABLE IF NOT EXISTS content_citations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  section_id VARCHAR(36) NOT NULL,
  chunk_id VARCHAR(36),
  document_id VARCHAR(36),
  cited_text TEXT,
  source_text TEXT,
  source_document_name VARCHAR(500),
  relevance_score DECIMAL(5, 4),
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_citations_project ON content_citations(project_id);
CREATE INDEX IF NOT EXISTS idx_content_citations_section ON content_citations(section_id);
CREATE INDEX IF NOT EXISTS idx_content_citations_document ON content_citations(document_id);

COMMENT ON TABLE content_citations IS '内容引用表，记录章节内容的引用溯源';

-- =====================================================
-- 13. 验证结果表（validation_results）
-- =====================================================
CREATE TABLE IF NOT EXISTS validation_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  document_id VARCHAR(36),
  validation_type VARCHAR(50) NOT NULL,
  passed BOOLEAN NOT NULL,
  score DECIMAL(5, 2),
  issues JSONB DEFAULT '[]',
  details JSONB DEFAULT '{}',
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  validator_version VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_validation_results_project ON validation_results(project_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_type ON validation_results(validation_type);
CREATE INDEX IF NOT EXISTS idx_validation_results_passed ON validation_results(passed);

COMMENT ON TABLE validation_results IS '校验结果表：存储各维度的校验结果';
COMMENT ON COLUMN validation_results.validation_type IS '校验类型：compliance, score_coverage, logic_consistency, disqualification, citation';

-- =====================================================
-- 14. 映射矩阵表（mapping_matrices）
-- =====================================================
CREATE TABLE IF NOT EXISTS mapping_matrices (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id VARCHAR(36) NOT NULL,
  matrix_data JSONB NOT NULL DEFAULT '{}',
  is_current BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_by VARCHAR(36),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_mapping_matrices_project ON mapping_matrices(project_id);
CREATE INDEX IF NOT EXISTS idx_mapping_matrices_current ON mapping_matrices(is_current);

COMMENT ON TABLE mapping_matrices IS '映射矩阵表：存储招标要素到标书章节的结构化映射';

-- =====================================================
-- 15. 创建更新时间触发器函数
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间触发器
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'system_settings',
        'document_cache', 
        'llm_file_cache',
        'evaluation_criteria',
        'background_tasks',
        'tender_extraction_results',
        'scoring_items',
        'disqualification_risks',
        'bid_sections',
        'mapping_matrices'
    ]) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %s', t, t);
        EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- =====================================================
-- 16. 添加外键约束（可选，根据实际情况启用）
-- =====================================================

-- 注意：以下外键约束可能因为现有数据而失败，请根据实际情况决定是否执行

-- document_cache -> projects
-- ALTER TABLE document_cache ADD CONSTRAINT fk_document_cache_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- evaluation_criteria -> projects
-- ALTER TABLE evaluation_criteria ADD CONSTRAINT fk_evaluation_criteria_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- evaluation_items -> evaluation_criteria
-- ALTER TABLE evaluation_items ADD CONSTRAINT fk_evaluation_items_criteria 
--     FOREIGN KEY (criteria_id) REFERENCES evaluation_criteria(id) ON DELETE CASCADE;

-- background_tasks -> projects
-- ALTER TABLE background_tasks ADD CONSTRAINT fk_background_tasks_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- tender_extraction_results -> projects
-- ALTER TABLE tender_extraction_results ADD CONSTRAINT fk_tender_extraction_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- scoring_items -> projects
-- ALTER TABLE scoring_items ADD CONSTRAINT fk_scoring_items_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- disqualification_risks -> projects
-- ALTER TABLE disqualification_risks ADD CONSTRAINT fk_disqualification_risks_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- bid_sections -> projects
-- ALTER TABLE bid_sections ADD CONSTRAINT fk_bid_sections_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- content_citations -> projects
-- ALTER TABLE content_citations ADD CONSTRAINT fk_content_citations_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- content_citations -> bid_sections
-- ALTER TABLE content_citations ADD CONSTRAINT fk_content_citations_section 
--     FOREIGN KEY (section_id) REFERENCES bid_sections(id) ON DELETE CASCADE;

-- validation_results -> projects
-- ALTER TABLE validation_results ADD CONSTRAINT fk_validation_results_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- mapping_matrices -> projects
-- ALTER TABLE mapping_matrices ADD CONSTRAINT fk_mapping_matrices_project 
--     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- =====================================================
-- 验证脚本
-- =====================================================

-- 检查所有表是否创建成功
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'system_settings',
    'document_cache',
    'llm_file_cache',
    'knowledge_chunks',
    'evaluation_criteria',
    'evaluation_items',
    'background_tasks',
    'tender_extraction_results',
    'scoring_items',
    'disqualification_risks',
    'bid_sections',
    'content_citations',
    'validation_results',
    'mapping_matrices'
  )
ORDER BY table_name;

-- 应该返回14行，表示所有表都已创建
