-- AI-Bid Phase 1 数据库迁移脚本
-- 创建评分项、废标风险、校验结果相关表

-- =====================================================
-- 1. 评分项表
-- =====================================================

CREATE TABLE IF NOT EXISTS scoring_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 评分项信息
  item_name VARCHAR(200) NOT NULL,
  item_code VARCHAR(50),
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('technical', 'business', 'price')),
  parent_item_id UUID REFERENCES scoring_items(id) ON DELETE SET NULL,

  -- 分值信息
  max_score DECIMAL(5, 2) NOT NULL,
  weight DECIMAL(5, 2),  -- 权重百分比

  -- 评分细则
  scoring_rules JSONB DEFAULT '[]',
  -- 格式: [{ "rule": "细则内容", "score": 分值 }]

  -- 响应状态
  response_status VARCHAR(20) DEFAULT 'pending' CHECK (response_status IN ('pending', 'responded', 'verified')),
  response_quality VARCHAR(20) CHECK (response_quality IN ('full', 'partial', 'none')),

  -- 对应章节
  chapter_id UUID REFERENCES bid_sections(id) ON DELETE SET NULL,

  -- 元数据
  extracted_from TEXT,  -- 提取自原文的哪部分
  confidence_score DECIMAL(3, 2),  -- 提取置信度

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_scoring_items_project ON scoring_items(project_id);
CREATE INDEX IF NOT EXISTS idx_scoring_items_type ON scoring_items(item_type);
CREATE INDEX IF NOT EXISTS idx_scoring_items_parent ON scoring_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_scoring_items_chapter ON scoring_items(chapter_id);
CREATE INDEX IF NOT EXISTS idx_scoring_items_status ON scoring_items(response_status);

-- 注释
COMMENT ON TABLE scoring_items IS '评分项表：存储从招标文档提取的评分项信息';
COMMENT ON COLUMN scoring_items.item_type IS '评分类型：technical-技术评分, business-商务评分, price-价格评分';
COMMENT ON COLUMN scoring_items.response_status IS '响应状态：pending-待响应, responded-已响应, verified-已验证';
COMMENT ON COLUMN scoring_items.response_quality IS '响应质量：full-完整响应, partial-部分响应, none-未响应';

-- =====================================================
-- 2. 废标风险表
-- =====================================================

CREATE TABLE IF NOT EXISTS disqualification_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 风险项信息
  risk_type VARCHAR(50) NOT NULL,
  -- 类型：'否决条款', '资格要求', '格式要求', '保证金要求'

  risk_description TEXT NOT NULL,
  source_text TEXT,  -- 原文内容
  source_location TEXT,  -- 原文位置（页码、章节）

  -- 响应状态
  response_status VARCHAR(20) DEFAULT 'unresponded' CHECK (response_status IN ('unresponded', 'responded', 'verified')),
  response_content TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,

  -- 风险等级
  severity VARCHAR(20) DEFAULT 'high' CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- 元数据
  extracted_from TEXT,
  confidence_score DECIMAL(3, 2),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_disqualification_risks_project ON disqualification_risks(project_id);
CREATE INDEX IF NOT EXISTS idx_disqualification_risks_type ON disqualification_risks(risk_type);
CREATE INDEX IF NOT EXISTS idx_disqualification_risks_status ON disqualification_risks(response_status);
CREATE INDEX IF NOT EXISTS idx_disqualification_risks_severity ON disqualification_risks(severity);

-- 注释
COMMENT ON TABLE disqualification_risks IS '废标风险表：存储可能导致废标的风险项';
COMMENT ON COLUMN disqualification_risks.risk_type IS '风险类型：否决条款、资格要求、格式要求等';
COMMENT ON COLUMN disqualification_risks.severity IS '风险等级：critical-致命, high-高, medium-中, low-低';

-- =====================================================
-- 3. 校验结果表
-- =====================================================

CREATE TABLE IF NOT EXISTS validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES bid_documents(id) ON DELETE CASCADE,

  -- 校验类型
  validation_type VARCHAR(50) NOT NULL,
  -- 类型：'compliance', 'score_coverage', 'logic_consistency', 'disqualification', 'citation'

  -- 校验结果
  passed BOOLEAN NOT NULL,
  score DECIMAL(5, 2),  -- 校验得分（0-100）

  -- 问题列表
  issues JSONB DEFAULT '[]',
  -- 格式: [{ "severity": "critical/high/medium/low", "type": "问题类型", "description": "问题描述", "location": "位置", "suggestion": "建议" }]

  -- 校验详情
  details JSONB DEFAULT '{}',

  -- 元数据
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validator_version VARCHAR(20)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_validation_results_project ON validation_results(project_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_type ON validation_results(validation_type);
CREATE INDEX IF NOT EXISTS idx_validation_results_passed ON validation_results(passed);
CREATE INDEX IF NOT EXISTS idx_validation_results_document ON validation_results(document_id);

-- 注释
COMMENT ON TABLE validation_results IS '校验结果表：存储各维度的校验结果';
COMMENT ON COLUMN validation_results.validation_type IS '校验类型：合规校验、评分覆盖校验、逻辑一致性校验等';

-- =====================================================
-- 4. 扩展 tender_analysis 表
-- =====================================================

-- 添加评分项汇总字段
ALTER TABLE tender_analysis
ADD COLUMN IF NOT EXISTS scoring_summary JSONB DEFAULT '{}';
-- 格式: { "totalScore": 100, "technicalScore": 50, "businessScore": 30, "priceScore": 20, "itemCount": 15 }

-- 添加废标风险汇总字段
ALTER TABLE tender_analysis
ADD COLUMN IF NOT EXISTS risk_summary JSONB DEFAULT '{}';
-- 格式: { "totalRisks": 10, "criticalRisks": 3, "highRisks": 5, "mediumRisks": 2, "unrespondedRisks": 8 }

-- 添加提取状态字段
ALTER TABLE tender_analysis
ADD COLUMN IF NOT EXISTS extraction_status VARCHAR(20) DEFAULT 'pending';
-- 状态：pending, extracting, completed, failed

COMMENT ON COLUMN tender_analysis.scoring_summary IS '评分项汇总信息';
COMMENT ON COLUMN tender_analysis.risk_summary IS '废标风险汇总信息';
COMMENT ON COLUMN tender_analysis.extraction_status IS '提取状态';

-- =====================================================
-- 5. 创建更新触发器
-- =====================================================

-- 更新 timestamp 的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- scoring_items 表触发器
DROP TRIGGER IF EXISTS update_scoring_items_updated_at ON scoring_items;
CREATE TRIGGER update_scoring_items_updated_at
    BEFORE UPDATE ON scoring_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- disqualification_risks 表触发器
DROP TRIGGER IF EXISTS update_disqualification_risks_updated_at ON disqualification_risks;
CREATE TRIGGER update_disqualification_risks_updated_at
    BEFORE UPDATE ON disqualification_risks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. 创建视图
-- =====================================================

-- 评分项完整信息视图
CREATE OR REPLACE VIEW v_scoring_items_full AS
SELECT
  si.*,
  p.name AS project_name,
  bs.title AS chapter_title,
  parent.item_name AS parent_item_name,
  COUNT(children.id) AS children_count
FROM scoring_items si
LEFT JOIN projects p ON si.project_id = p.id
LEFT JOIN bid_sections bs ON si.chapter_id = bs.id
LEFT JOIN scoring_items parent ON si.parent_item_id = parent.id
LEFT JOIN scoring_items children ON children.parent_item_id = si.id
GROUP BY si.id, p.name, bs.title, parent.item_name;

COMMENT ON VIEW v_scoring_items_full IS '评分项完整信息视图';

-- 废标风险完整信息视图
CREATE OR REPLACE VIEW v_disqualification_risks_full AS
SELECT
  dr.*,
  p.name AS project_name,
  u.name AS responder_name
FROM disqualification_risks dr
LEFT JOIN projects p ON dr.project_id = p.id
LEFT JOIN users u ON dr.responded_by = u.id;

COMMENT ON VIEW v_disqualification_risks_full IS '废标风险完整信息视图';

-- 校验汇总视图
CREATE OR REPLACE VIEW v_validation_summary AS
SELECT
  project_id,
  validation_type,
  COUNT(*) AS total_validations,
  COUNT(CASE WHEN passed THEN 1 END) AS passed_count,
  AVG(score) AS avg_score,
  MAX(validated_at) AS last_validated_at
FROM validation_results
GROUP BY project_id, validation_type;

COMMENT ON VIEW v_validation_summary IS '校验汇总视图';

-- =====================================================
-- 7. 创建统计函数
-- =====================================================

-- 获取项目评分覆盖率
CREATE OR REPLACE FUNCTION get_project_score_coverage(p_project_id UUID)
RETURNS TABLE (
  total_items INT,
  responded_items INT,
  full_response_items INT,
  coverage_rate DECIMAL(5, 2),
  quality_rate DECIMAL(5, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT AS total_items,
    COUNT(CASE WHEN response_status IN ('responded', 'verified') THEN 1 END)::INT AS responded_items,
    COUNT(CASE WHEN response_quality = 'full' THEN 1 END)::INT AS full_response_items,
    ROUND(
      COUNT(CASE WHEN response_status IN ('responded', 'verified') THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100,
      2
    ) AS coverage_rate,
    ROUND(
      COUNT(CASE WHEN response_quality = 'full' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100,
      2
    ) AS quality_rate
  FROM scoring_items
  WHERE project_id = p_project_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_project_score_coverage IS '获取项目评分覆盖率';

-- 获取项目废标风险统计
CREATE OR REPLACE FUNCTION get_project_risk_stats(p_project_id UUID)
RETURNS TABLE (
  total_risks INT,
  critical_risks INT,
  high_risks INT,
  unresponded_risks INT,
  response_rate DECIMAL(5, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT AS total_risks,
    COUNT(CASE WHEN severity = 'critical' THEN 1 END)::INT AS critical_risks,
    COUNT(CASE WHEN severity = 'high' THEN 1 END)::INT AS high_risks,
    COUNT(CASE WHEN response_status = 'unresponded' THEN 1 END)::INT AS unresponded_risks,
    ROUND(
      COUNT(CASE WHEN response_status IN ('responded', 'verified') THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100,
      2
    ) AS response_rate
  FROM disqualification_risks
  WHERE project_id = p_project_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_project_risk_stats IS '获取项目废标风险统计';

-- =====================================================
-- 8. 回滚脚本
-- =====================================================

/*
-- 如需回滚，执行以下命令：

DROP VIEW IF EXISTS v_validation_summary;
DROP VIEW IF EXISTS v_disqualification_risks_full;
DROP VIEW IF EXISTS v_scoring_items_full;

DROP FUNCTION IF EXISTS get_project_score_coverage(UUID);
DROP FUNCTION IF EXISTS get_project_risk_stats(UUID);
DROP FUNCTION IF EXISTS update_updated_at_column();

DROP TABLE IF EXISTS validation_results;
DROP TABLE IF EXISTS disqualification_risks;
DROP TABLE IF EXISTS scoring_items;

ALTER TABLE tender_analysis
DROP COLUMN IF EXISTS scoring_summary,
DROP COLUMN IF EXISTS risk_summary,
DROP COLUMN IF EXISTS extraction_status;
*/
