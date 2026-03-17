# 智能标书生成系统 - 数据库迁移脚本 v2.0

## 迁移说明

本次迁移基于招标文档提取 Schema 的优化设计,扩展 `tender_analysis` 表结构,新增 `extraction_history` 表,以支持完整的招标文档结构化提取。

---

## 1. 更新 tender_analysis 表

### 1.1 添加完整提取结果字段

```sql
-- 添加 extraction_result 字段存储完整提取结果
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS extraction_result JSONB;

-- 添加元数据字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS extraction_model VARCHAR(50),
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3, 2),
ADD COLUMN IF NOT EXISTS extraction_time INT;

-- 添加详细的项目基本信息字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS project_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS procurement_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS budget_source TEXT,
ADD COLUMN IF NOT EXISTS budget_approval VARCHAR(200),
ADD COLUMN IF NOT EXISTS delivery_period VARCHAR(100),
ADD COLUMN IF NOT EXISTS warranty_period VARCHAR(100);

-- 添加详细的采购单位信息字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS purchaser_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS purchaser_email VARCHAR(100),
ADD COLUMN IF NOT EXISTS purchaser_address TEXT;

-- 添加时间节点字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS bid_publish_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bid_document_sale_start TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bid_document_sale_end TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS question_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS answer_publish_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS site_visit_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bid_opening_location TEXT,
ADD COLUMN IF NOT EXISTS evaluation_period VARCHAR(100),
ADD COLUMN IF NOT EXISTS result_publicity_date TIMESTAMP WITH TIME ZONE;

-- 添加保证金信息字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS bid_security_amount DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS bid_security_payment_method TEXT,
ADD COLUMN IF NOT EXISTS bid_security_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bid_security_return_conditions TEXT;

-- 添加中标信息字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS winner_count INT,
ADD COLUMN IF NOT EXISTS winner_selection_method TEXT,
ADD COLUMN IF NOT EXISTS bid_validity_period VARCHAR(100);

-- 添加服务要求字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS service_location TEXT,
ADD COLUMN IF NOT EXISTS service_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS payment_terms JSONB DEFAULT '[]';

-- 添加项目背景字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS construction_background TEXT,
ADD COLUMN IF NOT EXISTS construction_goals JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS construction_scope TEXT,
ADD COLUMN IF NOT EXISTS current_status TEXT,
ADD COLUMN IF NOT EXISTS business_requirements JSONB DEFAULT '[]';

-- 添加扩展字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS technical_parameters JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS tech_solution_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS performance_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS major_deviation_rules JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS bid_restrictions JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS integrity_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS legal_compliance JSONB DEFAULT '[]';

-- 添加文档要求字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS document_structure JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS format_requirements JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sealing_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS signature_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS submission_requirements JSONB DEFAULT '{}';

-- 添加其他信息字段
ALTER TABLE tender_analysis 
ADD COLUMN IF NOT EXISTS special_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

COMMENT ON COLUMN tender_analysis.extraction_result IS '完整的招标文档提取结果,JSON格式';
COMMENT ON COLUMN tender_analysis.extraction_model IS '提取使用的模型,如 gpt-4o, deepseek-chat 等';
COMMENT ON COLUMN tender_analysis.confidence_score IS '提取置信度分数,范围 0-1';
COMMENT ON COLUMN tender_analysis.extraction_time IS '提取耗时,单位毫秒';
```

### 1.2 创建提取历史记录表

```sql
-- 提取历史记录表
CREATE TABLE IF NOT EXISTS extraction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES tender_documents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 提取结果
  extraction_result JSONB NOT NULL,
  
  -- 元数据
  extraction_model VARCHAR(50),
  confidence_score DECIMAL(3, 2),
  extraction_time INT,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  
  -- 版本控制
  version INT DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_extraction_history_document ON extraction_history(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_history_project ON extraction_history(project_id);
CREATE INDEX IF NOT EXISTS idx_extraction_history_created ON extraction_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_history_current ON extraction_history(is_current);

-- 注释
COMMENT ON TABLE extraction_history IS '招标文档提取历史记录表,支持多次提取对比';
COMMENT ON COLUMN extraction_history.version IS '提取版本号,每次新提取自增';
COMMENT ON COLUMN extraction_history.is_current IS '是否为当前使用的版本';
```

### 1.3 创建提取任务表

```sql
-- 提取任务表(用于异步任务管理)
CREATE TABLE IF NOT EXISTS extraction_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES tender_documents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 任务状态
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- 任务配置
  extraction_model VARCHAR(50),
  extraction_mode VARCHAR(20) DEFAULT 'full' CHECK (extraction_mode IN ('full', 'incremental', 'partial')),
  
  -- 结果
  result_id UUID REFERENCES extraction_history(id),
  error_message TEXT,
  error_stack TEXT,
  
  -- 时间记录
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_extraction_tasks_document ON extraction_tasks(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_tasks_project ON extraction_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_extraction_tasks_status ON extraction_tasks(status);
CREATE INDEX IF NOT EXISTS idx_extraction_tasks_created ON extraction_tasks(created_at DESC);

-- 注释
COMMENT ON TABLE extraction_tasks IS '招标文档提取任务表,支持异步处理';
COMMENT ON COLUMN extraction_tasks.extraction_mode IS '提取模式: full-完整提取, incremental-增量提取, partial-部分提取';
```

---

## 2. 创建视图

### 2.1 招标文档提取完整信息视图

```sql
CREATE OR REPLACE VIEW v_tender_extraction_full AS
SELECT 
  ta.id AS analysis_id,
  ta.document_id,
  ta.project_id,
  
  -- 项目基本信息
  ta.project_name,
  ta.project_number,
  ta.project_type,
  ta.procurement_method,
  
  -- 采购单位信息
  ta.purchaser,
  ta.purchaser_contact,
  ta.purchaser_phone,
  ta.purchaser_email,
  ta.purchaser_address,
  
  -- 资金信息
  ta.budget,
  ta.budget_cap,
  ta.budget_source,
  ta.budget_approval,
  ta.deposit_amount,
  
  -- 时间节点
  ta.bid_publish_date,
  ta.bid_document_sale_start,
  ta.bid_document_sale_end,
  ta.question_deadline,
  ta.answer_publish_date,
  ta.site_visit_date,
  ta.bid_deadline,
  ta.open_bid_time,
  ta.bid_opening_location,
  
  -- 项目周期
  ta.delivery_period,
  ta.warranty_period,
  ta.valid_days,
  ta.bid_validity_period,
  
  -- 中标信息
  ta.winner_count,
  ta.winner_selection_method,
  
  -- 服务要求
  ta.service_location,
  ta.service_requirements,
  ta.payment_terms,
  
  -- 保证金
  ta.bid_security_amount,
  ta.bid_security_payment_method,
  ta.bid_security_deadline,
  ta.bid_security_return_conditions,
  
  -- 项目背景
  ta.construction_background,
  ta.construction_goals,
  ta.construction_scope,
  ta.current_status,
  ta.business_requirements,
  
  -- 技术要求
  ta.technical_requirements,
  ta.technical_parameters,
  ta.tech_solution_requirements,
  ta.performance_requirements,
  ta.qualification_requirements,
  
  -- 评分标准
  ta.scoring_criteria,
  
  -- 合规要求
  ta.disqualification_rules,
  ta.major_deviation_rules,
  ta.bid_restrictions,
  ta.integrity_requirements,
  ta.legal_compliance,
  
  -- 文档要求
  ta.document_structure,
  ta.format_requirements,
  ta.sealing_requirements,
  ta.signature_requirements,
  ta.submission_requirements,
  
  -- 其他信息
  ta.special_requirements,
  ta.notes,
  ta.attachments,
  
  -- 完整提取结果
  ta.extraction_result,
  
  -- 元数据
  ta.extraction_model,
  ta.confidence_score,
  ta.extraction_time,
  ta.parse_status,
  ta.parse_error,
  
  -- 关联信息
  td.filename,
  td.file_type,
  td.file_size,
  p.name AS project_name_original,
  
  ta.created_at,
  ta.updated_at
  
FROM tender_analysis ta
LEFT JOIN tender_documents td ON ta.document_id = td.id
LEFT JOIN projects p ON ta.project_id = p.id;

COMMENT ON VIEW v_tender_extraction_full IS '招标文档提取完整信息视图';
```

### 2.2 提取历史对比视图

```sql
CREATE OR REPLACE VIEW v_extraction_history_compare AS
SELECT 
  eh.id,
  eh.document_id,
  eh.project_id,
  eh.version,
  eh.extraction_model,
  eh.confidence_score,
  eh.extraction_time,
  eh.status,
  eh.is_current,
  eh.created_at,
  eh.created_by,
  
  -- 关联信息
  td.filename,
  p.name AS project_name,
  u.name AS created_by_name
  
FROM extraction_history eh
LEFT JOIN tender_documents td ON eh.document_id = td.id
LEFT JOIN projects p ON eh.project_id = p.id
LEFT JOIN users u ON eh.created_by = u.id
ORDER BY eh.created_at DESC;

COMMENT ON VIEW v_extraction_history_compare IS '提取历史对比视图,用于版本对比';
```

---

## 3. 创建函数

### 3.1 自动更新提取版本函数

```sql
CREATE OR REPLACE FUNCTION fn_update_extraction_version()
RETURNS TRIGGER AS $$
BEGIN
  -- 将同文档的旧版本标记为非当前版本
  UPDATE extraction_history
  SET is_current = FALSE
  WHERE document_id = NEW.document_id
    AND id != NEW.id
    AND is_current = TRUE;
  
  -- 设置新版本为当前版本
  NEW.is_current := TRUE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 绑定触发器
CREATE TRIGGER trg_update_extraction_version
BEFORE INSERT ON extraction_history
FOR EACH ROW
EXECUTE FUNCTION fn_update_extraction_version();
```

### 3.2 提取结果差异对比函数

```sql
CREATE OR REPLACE FUNCTION fn_compare_extraction_results(
  p_extraction_id_1 UUID,
  p_extraction_id_2 UUID
)
RETURNS TABLE (
  field_name TEXT,
  old_value JSONB,
  new_value JSONB,
  change_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH 
    e1 AS (
      SELECT extraction_result 
      FROM extraction_history 
      WHERE id = p_extraction_id_1
    ),
    e2 AS (
      SELECT extraction_result 
      FROM extraction_history 
      WHERE id = p_extraction_id_2
    )
  SELECT 
    key AS field_name,
    e1.extraction_result->key AS old_value,
    e2.extraction_result->key AS new_value,
    CASE
      WHEN e1.extraction_result->key IS NULL THEN '新增'
      WHEN e2.extraction_result->key IS NULL THEN '删除'
      WHEN e1.extraction_result->key != e2.extraction_result->key THEN '修改'
      ELSE '无变化'
    END AS change_type
  FROM e1, e2
  CROSS JOIN LATERAL (
    SELECT DISTINCT key 
    FROM (
      SELECT key FROM jsonb_object_keys(e1.extraction_result)
      UNION
      SELECT key FROM jsonb_object_keys(e2.extraction_result)
    ) keys
  ) all_keys
  WHERE e1.extraction_result->key != e2.extraction_result->key
     OR e1.extraction_result->key IS NULL
     OR e2.extraction_result->key IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_compare_extraction_results IS '对比两次提取结果的差异';
```

### 3.3 获取项目关键时间节点函数

```sql
CREATE OR REPLACE FUNCTION fn_get_project_key_dates(
  p_project_id UUID
)
RETURNS TABLE (
  date_type TEXT,
  date_value TIMESTAMP WITH TIME ZONE,
  days_remaining INT,
  urgency_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE
      WHEN ta.bid_deadline IS NOT NULL AND CURRENT_TIMESTAMP <= ta.bid_deadline THEN '投标截止'
      WHEN ta.open_bid_time IS NOT NULL AND CURRENT_TIMESTAMP <= ta.open_bid_time THEN '开标时间'
      WHEN ta.question_deadline IS NOT NULL AND CURRENT_TIMESTAMP <= ta.question_deadline THEN '提问截止'
      ELSE NULL
    END AS date_type,
    CASE
      WHEN ta.bid_deadline IS NOT NULL AND CURRENT_TIMESTAMP <= ta.bid_deadline THEN ta.bid_deadline
      WHEN ta.open_bid_time IS NOT NULL AND CURRENT_TIMESTAMP <= ta.open_bid_time THEN ta.open_bid_time
      WHEN ta.question_deadline IS NOT NULL AND CURRENT_TIMESTAMP <= ta.question_deadline THEN ta.question_deadline
      ELSE NULL
    END AS date_value,
    CASE
      WHEN ta.bid_deadline IS NOT NULL AND CURRENT_TIMESTAMP <= ta.bid_deadline 
        THEN EXTRACT(DAY FROM (ta.bid_deadline - CURRENT_TIMESTAMP))::INT
      WHEN ta.open_bid_time IS NOT NULL AND CURRENT_TIMESTAMP <= ta.open_bid_time 
        THEN EXTRACT(DAY FROM (ta.open_bid_time - CURRENT_TIMESTAMP))::INT
      WHEN ta.question_deadline IS NOT NULL AND CURRENT_TIMESTAMP <= ta.question_deadline 
        THEN EXTRACT(DAY FROM (ta.question_deadline - CURRENT_TIMESTAMP))::INT
      ELSE NULL
    END AS days_remaining,
    CASE
      WHEN EXTRACT(DAY FROM (ta.bid_deadline - CURRENT_TIMESTAMP)) <= 3 THEN '紧急'
      WHEN EXTRACT(DAY FROM (ta.bid_deadline - CURRENT_TIMESTAMP)) <= 7 THEN '重要'
      ELSE '一般'
    END AS urgency_level
  FROM tender_analysis ta
  WHERE ta.project_id = p_project_id
    AND ta.bid_deadline IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_get_project_key_dates IS '获取项目关键时间节点及紧急程度';
```

---

## 4. Row Level Security (RLS) 策略

### 4.1 extraction_history 表 RLS

```sql
-- 启用 RLS
ALTER TABLE extraction_history ENABLE ROW LEVEL SECURITY;

-- 部门级别访问策略
CREATE POLICY policy_extraction_history_department ON extraction_history
FOR ALL
TO authenticated_user
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = extraction_history.project_id
      AND (
        p.department_id = current_user_department()
        OR p.created_by = current_user_id()
        OR user_has_permission('extraction:read:all')
      )
  )
);

-- 注释
COMMENT ON POLICY policy_extraction_history_department ON extraction_history IS '部门级别访问策略: 用户可访问本部门的提取记录';
```

### 4.2 extraction_tasks 表 RLS

```sql
-- 启用 RLS
ALTER TABLE extraction_tasks ENABLE ROW LEVEL SECURITY;

-- 创建者或部门成员可访问
CREATE POLICY policy_extraction_tasks_access ON extraction_tasks
FOR ALL
TO authenticated_user
USING (
  created_by = current_user_id()
  OR EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = extraction_tasks.project_id
      AND p.department_id = current_user_department()
  )
  OR user_has_permission('extraction:read:all')
);

COMMENT ON POLICY policy_extraction_tasks_access ON extraction_tasks IS '任务访问策略: 创建者或部门成员可访问';
```

---

## 5. 数据迁移脚本

### 5.1 迁移现有数据到新字段

```sql
-- 将 extraction_result 从 tender_analysis 迁移到 extraction_history
INSERT INTO extraction_history (
  document_id,
  project_id,
  extraction_result,
  extraction_model,
  confidence_score,
  extraction_time,
  status,
  version,
  is_current,
  created_at,
  created_by
)
SELECT 
  ta.document_id,
  ta.project_id,
  CASE 
    WHEN ta.extraction_result IS NOT NULL THEN ta.extraction_result
    ELSE jsonb_build_object(
      'project_basic_info', jsonb_build_object(
        'project_name', ta.project_name,
        'project_number', ta.project_number,
        'purchase_unit', ta.purchaser,
        'project_budget', ta.budget
      ),
      'technical_requirements', ta.technical_requirements,
      'scoring_criteria', ta.scoring_criteria,
      'disqualification_rules', ta.disqualification_rules
    )
  END,
  ta.extraction_model,
  ta.confidence_score,
  ta.extraction_time,
  CASE 
    WHEN ta.parse_status = 'completed' THEN 'completed'
    WHEN ta.parse_status = 'failed' THEN 'failed'
    ELSE 'pending'
  END,
  1,
  TRUE,
  ta.created_at,
  (SELECT created_by FROM projects WHERE id = ta.project_id)
FROM tender_analysis ta
WHERE ta.extraction_result IS NOT NULL 
   OR ta.technical_requirements IS NOT NULL
   OR ta.scoring_criteria IS NOT NULL;

-- 更新 tender_analysis 表的 result_id 引用
UPDATE tender_analysis ta
SET result_id = eh.id
FROM extraction_history eh
WHERE ta.document_id = eh.document_id
  AND eh.is_current = TRUE;
```

### 5.2 初始化序列

```sql
-- 创建版本号序列
CREATE SEQUENCE IF NOT EXISTS seq_extraction_version START 1;

-- 为每个文档的提取历史创建版本号
CREATE OR REPLACE FUNCTION fn_get_next_extraction_version(p_document_id UUID)
RETURNS INT AS $$
DECLARE
  v_version INT;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM extraction_history
  WHERE document_id = p_document_id;
  
  RETURN v_version;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. 索引优化

### 6.1 添加复合索引

```sql
-- 常用查询索引
CREATE INDEX IF NOT EXISTS idx_tender_analysis_project_status 
ON tender_analysis(project_id, parse_status);

CREATE INDEX IF NOT EXISTS idx_tender_analysis_deadline 
ON tender_analysis(bid_deadline) 
WHERE bid_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tender_analysis_budget 
ON tender_analysis(budget) 
WHERE budget IS NOT NULL;

-- JSONB 字段索引
CREATE INDEX IF NOT EXISTS idx_tender_analysis_extraction_result 
ON tender_analysis USING GIN(extraction_result);

CREATE INDEX IF NOT EXISTS idx_tender_analysis_tech_req 
ON tender_analysis USING GIN(technical_requirements);

CREATE INDEX IF NOT EXISTS idx_tender_analysis_scoring 
ON tender_analysis USING GIN(scoring_criteria);
```

---

## 7. 回滚脚本

```sql
-- 如需回滚本次迁移,执行以下脚本

-- 删除触发器
DROP TRIGGER IF EXISTS trg_update_extraction_version ON extraction_history;

-- 删除函数
DROP FUNCTION IF EXISTS fn_update_extraction_version();
DROP FUNCTION IF EXISTS fn_compare_extraction_results(UUID, UUID);
DROP FUNCTION IF EXISTS fn_get_project_key_dates(UUID);
DROP FUNCTION IF EXISTS fn_get_next_extraction_version(UUID);

-- 删除视图
DROP VIEW IF EXISTS v_extraction_history_compare;
DROP VIEW IF EXISTS v_tender_extraction_full;

-- 删除表
DROP TABLE IF EXISTS extraction_tasks;
DROP TABLE IF EXISTS extraction_history;

-- 删除新增字段
ALTER TABLE tender_analysis 
DROP COLUMN IF EXISTS extraction_result,
DROP COLUMN IF EXISTS extraction_model,
DROP COLUMN IF EXISTS confidence_score,
DROP COLUMN IF EXISTS extraction_time,
DROP COLUMN IF EXISTS project_type,
DROP COLUMN IF EXISTS procurement_method,
DROP COLUMN IF EXISTS budget_source,
DROP COLUMN IF EXISTS budget_approval,
DROP COLUMN IF EXISTS delivery_period,
DROP COLUMN IF EXISTS warranty_period,
DROP COLUMN IF EXISTS purchaser_phone,
DROP COLUMN IF EXISTS purchaser_email,
DROP COLUMN IF EXISTS purchaser_address,
DROP COLUMN IF EXISTS bid_publish_date,
DROP COLUMN IF EXISTS bid_document_sale_start,
DROP COLUMN IF EXISTS bid_document_sale_end,
DROP COLUMN IF EXISTS question_deadline,
DROP COLUMN IF EXISTS answer_publish_date,
DROP COLUMN IF EXISTS site_visit_date,
DROP COLUMN IF EXISTS bid_opening_location,
DROP COLUMN IF EXISTS evaluation_period,
DROP COLUMN IF EXISTS result_publicity_date,
DROP COLUMN IF EXISTS bid_security_amount,
DROP COLUMN IF EXISTS bid_security_payment_method,
DROP COLUMN IF EXISTS bid_security_deadline,
DROP COLUMN IF EXISTS bid_security_return_conditions,
DROP COLUMN IF EXISTS winner_count,
DROP COLUMN IF EXISTS winner_selection_method,
DROP COLUMN IF EXISTS bid_validity_period,
DROP COLUMN IF EXISTS service_location,
DROP COLUMN IF EXISTS service_requirements,
DROP COLUMN IF EXISTS payment_terms,
DROP COLUMN IF EXISTS construction_background,
DROP COLUMN IF EXISTS construction_goals,
DROP COLUMN IF EXISTS construction_scope,
DROP COLUMN IF EXISTS current_status,
DROP COLUMN IF EXISTS business_requirements,
DROP COLUMN IF EXISTS technical_parameters,
DROP COLUMN IF EXISTS tech_solution_requirements,
DROP COLUMN IF EXISTS performance_requirements,
DROP COLUMN IF EXISTS major_deviation_rules,
DROP COLUMN IF EXISTS bid_restrictions,
DROP COLUMN IF EXISTS integrity_requirements,
DROP COLUMN IF EXISTS legal_compliance,
DROP COLUMN IF EXISTS document_structure,
DROP COLUMN IF EXISTS format_requirements,
DROP COLUMN IF EXISTS sealing_requirements,
DROP COLUMN IF EXISTS signature_requirements,
DROP COLUMN IF EXISTS submission_requirements,
DROP COLUMN IF EXISTS special_requirements,
DROP COLUMN IF EXISTS notes,
DROP COLUMN IF EXISTS attachments;

-- 删除序列
DROP SEQUENCE IF EXISTS seq_extraction_version;
```

---

## 8. 迁移验证

```sql
-- 验证表结构
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('tender_analysis', 'extraction_history', 'extraction_tasks')
ORDER BY table_name, ordinal_position;

-- 验证索引
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('tender_analysis', 'extraction_history', 'extraction_tasks')
ORDER BY tablename, indexname;

-- 验证视图
SELECT 
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE viewname LIKE 'v_tender_%' OR viewname LIKE 'v_extraction_%';

-- 验证函数
SELECT 
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_name LIKE 'fn_%';
```

---

**迁移版本**：v2.0  
**执行日期**：2026-03-17  
**负责人**：数据库团队  
**影响范围**：tender_analysis 表扩展、新增 extraction_history 和 extraction_tasks 表
