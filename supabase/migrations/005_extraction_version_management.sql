-- 招标文档提取版本管理表
-- 支持多次提取、版本对比、人工修正

-- 1. 提取版本表
CREATE TABLE IF NOT EXISTS extraction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  
  -- 版本信息
  version_number INT NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  
  -- 提取结果（完整JSON）
  extraction_result JSONB NOT NULL,
  
  -- 提取元数据
  extraction_metadata JSONB DEFAULT '{}',
  -- 包含：extraction_time, document_name, document_pages, extraction_model, confidence_score
  
  -- 统计信息
  field_count INT DEFAULT 0,           -- 已填充字段数
  total_fields INT DEFAULT 60,         -- 总字段数
  completeness_score DECIMAL(5,2),     -- 完整度得分
  
  -- 版本备注
  notes TEXT,
  
  -- 审核信息
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  CONSTRAINT unique_project_version UNIQUE (project_id, version_number)
);

CREATE INDEX idx_extraction_versions_project ON extraction_versions(project_id);
CREATE INDEX idx_extraction_versions_current ON extraction_versions(is_current);
CREATE INDEX idx_extraction_versions_approved ON extraction_versions(is_approved);

COMMENT ON TABLE extraction_versions IS '招标文档提取版本表，支持多次提取和版本管理';

-- 2. 修改历史表
CREATE TABLE IF NOT EXISTS extraction_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES extraction_versions(id) ON DELETE CASCADE,
  
  -- 修改字段
  field_path VARCHAR(500) NOT NULL,     -- 字段路径，如 'project_basic_info.project_name'
  field_name VARCHAR(200),              -- 字段中文名
  
  -- 修改内容
  old_value JSONB,                      -- 旧值
  new_value JSONB,                      -- 新值
  old_value_text TEXT,                  -- 旧值文本（用于搜索）
  new_value_text TEXT,                  -- 新值文本
  
  -- 修改原因
  reason TEXT,
  
  -- 修改人信息
  modified_by UUID REFERENCES users(id),
  modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 审核状态
  review_status VARCHAR(20) DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_comment TEXT
);

CREATE INDEX idx_extraction_modifications_version ON extraction_modifications(version_id);
CREATE INDEX idx_extraction_modifications_field ON extraction_modifications(field_path);
CREATE INDEX idx_extraction_modifications_time ON extraction_modifications(modified_at DESC);

COMMENT ON TABLE extraction_modifications IS '提取结果修改历史表，记录所有字段级别的修改';

-- 3. 版本对比结果缓存表
CREATE TABLE IF NOT EXISTS extraction_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 对比的版本
  version_a_id UUID NOT NULL REFERENCES extraction_versions(id) ON DELETE CASCADE,
  version_b_id UUID NOT NULL REFERENCES extraction_versions(id) ON DELETE CASCADE,
  
  -- 对比结果
  comparison_result JSONB NOT NULL,
  -- 结构：{ differences: [{field, valueA, valueB, diffType}], summary: {added, removed, modified, unchanged} }
  
  -- 统计
  total_differences INT DEFAULT 0,
  added_fields INT DEFAULT 0,
  removed_fields INT DEFAULT 0,
  modified_fields INT DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_version_comparison UNIQUE (version_a_id, version_b_id)
);

CREATE INDEX idx_extraction_comparisons_project ON extraction_comparisons(project_id);

COMMENT ON TABLE extraction_comparisons IS '版本对比结果缓存表，避免重复计算';

-- 4. 字段修正建议表（AI辅助修正）
CREATE TABLE IF NOT EXISTS extraction_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES extraction_versions(id) ON DELETE CASCADE,
  
  -- 字段信息
  field_path VARCHAR(500) NOT NULL,
  field_name VARCHAR(200),
  
  -- 建议内容
  current_value JSONB,
  suggested_value JSONB,
  suggestion_reason TEXT,
  
  -- 来源
  source VARCHAR(50) DEFAULT 'ai',      -- 'ai', 'rule', 'manual'
  confidence DECIMAL(3,2),              -- 建议置信度
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_extraction_suggestions_version ON extraction_suggestions(version_id);
CREATE INDEX idx_extraction_suggestions_status ON extraction_suggestions(status);

COMMENT ON TABLE extraction_suggestions IS '字段修正建议表，支持AI辅助修正';

-- 5. 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_extraction_version_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_extraction_versions_update
  BEFORE UPDATE ON extraction_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_extraction_version_timestamp();

-- 6. 触发器：版本切换时自动设置 is_current
CREATE OR REPLACE FUNCTION set_current_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = TRUE THEN
    UPDATE extraction_versions
    SET is_current = FALSE
    WHERE project_id = NEW.project_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_current_version
  BEFORE INSERT OR UPDATE ON extraction_versions
  FOR EACH ROW
  EXECUTE FUNCTION set_current_version();
