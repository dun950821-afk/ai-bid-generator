-- AI-Bid 大纲生成任务表迁移脚本
-- 创建 generation_tasks 表，用于存储标书生成的细粒度任务

-- =====================================================
-- 1. 任务类型枚举
-- =====================================================

-- 创建任务类型枚举（如果不存在）
DO $$ BEGIN
    CREATE TYPE task_type_enum AS (
        'Rule-Based-Form',    -- 规则表单填充
        'Data-Filling',       -- 数据填空
        'Text-Generation'     -- 文本生成
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 创建任务状态枚举（如果不存在）
DO $$ BEGIN
    CREATE TYPE task_status_enum AS (
        'pending',            -- 待执行
        'running',            -- 执行中
        'completed',          -- 已完成
        'failed',             -- 失败
        'needs_review'        -- 待人工复核
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 2. 生成任务表
-- =====================================================

CREATE TABLE IF NOT EXISTS generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 任务标识
  task_code VARCHAR(50) NOT NULL,        -- 如 "task-11.1"
  chapter_id VARCHAR(20) NOT NULL,       -- 如 "11.1"
  chapter_name VARCHAR(200) NOT NULL,
  
  -- 层级信息
  level INTEGER DEFAULT 1,               -- 层级：1=一级标题，2=二级标题
  parent_task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
  
  -- 任务分类
  task_type VARCHAR(20) NOT NULL DEFAULT 'Text-Generation',
  task_group VARCHAR(20) DEFAULT 'technical',
  -- task_type: Rule-Based-Form, Data-Filling, Text-Generation
  -- task_group: cover, index, business, technical, compliance, appendix

  -- 评分绑定（JSONB格式）
  scoring_bindings JSONB DEFAULT '[]',
  -- [{ 
  --   "scoring_item_id": "xxx", 
  --   "scoring_item_name": "需求分析", 
  --   "max_score": 10, 
  --   "scoring_criteria": "...",
  --   "response_strategy": "...",
  --   "key_points": ["..."]
  -- }]

  -- 生成配置
  word_limit INTEGER DEFAULT 1500,
  requirements JSONB DEFAULT '{}',
  -- {
  --   "must_include": ["..."],
  --   "format_rules": ["..."],
  --   "prohibited_terms": ["..."]
  -- }
  
  -- 上下文依赖
  context_dependencies JSONB DEFAULT '[]',
  -- [{ "task_id": "task-11.1", "dependency_type": "outline", "description": "技术方案大纲" }]

  -- 状态管理
  status VARCHAR(20) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,            -- 进度百分比 (0-100)
  generated_content TEXT,
  
  -- 人工复核
  review_required BOOLEAN DEFAULT FALSE,
  review_priority VARCHAR(20) DEFAULT 'medium',
  -- priority: critical, high, medium
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES users(id),
  review_notes TEXT,

  -- 执行信息
  execution_order INTEGER DEFAULT 0,     -- 执行顺序
  parallel_group VARCHAR(50),            -- 可并行的任务组ID
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- 元数据
  metadata JSONB DEFAULT '{}',
  -- { "section_type": "technical", "estimated_duration": "60s" }

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_generation_tasks_project ON generation_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_type ON generation_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_chapter ON generation_tasks(chapter_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_parent ON generation_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_order ON generation_tasks(execution_order);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_tasks_unique ON generation_tasks(project_id, task_code);

-- 注释
COMMENT ON TABLE generation_tasks IS '标书生成任务表：存储大纲拆解后的细粒度生成任务';
COMMENT ON COLUMN generation_tasks.task_type IS '任务类型：Rule-Based-Form(规则表单), Data-Filling(数据填空), Text-Generation(文本生成)';
COMMENT ON COLUMN generation_tasks.task_group IS '任务分组：cover(封面), index(索引), business(商务), technical(技术), compliance(合规), appendix(附录)';
COMMENT ON COLUMN generation_tasks.status IS '任务状态：pending(待执行), running(执行中), completed(已完成), failed(失败), needs_review(待复核)';
COMMENT ON COLUMN generation_tasks.scoring_bindings IS '评分项绑定：关联的评分标准及响应策略';
COMMENT ON COLUMN generation_tasks.context_dependencies IS '上下文依赖：生成此章节需要的前置章节信息';

-- =====================================================
-- 3. 任务执行计划表
-- =====================================================

CREATE TABLE IF NOT EXISTS task_execution_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 计划信息
  plan_name VARCHAR(100) DEFAULT '默认执行计划',
  total_tasks INTEGER DEFAULT 0,
  
  -- 任务统计
  task_stats JSONB DEFAULT '{}',
  -- { "rule_based_form": 20, "data_filling": 15, "text_generation": 15 }
  
  -- 执行阶段
  phases JSONB DEFAULT '[]',
  -- [{
  --   "phase_id": "phase-1",
  --   "phase_name": "模板填充阶段",
  --   "tasks": ["task-1", "task-2"],
  --   "execution_mode": "parallel",
  --   "dependencies": []
  -- }]
  
  -- 复核点
  review_points JSONB DEFAULT '[]',
  -- [{ "task_id": "task-3", "reason": "报价表需确认", "priority": "critical" }]
  
  -- 执行状态
  current_phase INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_plans_project ON task_execution_plans(project_id);

COMMENT ON TABLE task_execution_plans IS '任务执行计划表：存储任务树的执行编排信息';

-- =====================================================
-- 4. 更新触发器
-- =====================================================

DROP TRIGGER IF EXISTS update_generation_tasks_updated_at ON generation_tasks;
CREATE TRIGGER update_generation_tasks_updated_at
    BEFORE UPDATE ON generation_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_task_plans_updated_at ON task_execution_plans;
CREATE TRIGGER update_task_plans_updated_at
    BEFORE UPDATE ON task_execution_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. 辅助函数
-- =====================================================

-- 获取项目任务执行进度
CREATE OR REPLACE FUNCTION get_project_task_progress(p_project_id UUID)
RETURNS TABLE (
  total_tasks INT,
  completed_tasks INT,
  failed_tasks INT,
  pending_tasks INT,
  needs_review_tasks INT,
  progress_rate DECIMAL(5, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT AS total_tasks,
    COUNT(CASE WHEN status = 'completed' THEN 1 END)::INT AS completed_tasks,
    COUNT(CASE WHEN status = 'failed' THEN 1 END)::INT AS failed_tasks,
    COUNT(CASE WHEN status = 'pending' THEN 1 END)::INT AS pending_tasks,
    COUNT(CASE WHEN status = 'needs_review' THEN 1 END)::INT AS needs_review_tasks,
    ROUND(
      COUNT(CASE WHEN status IN ('completed', 'needs_review') THEN 1 END)::DECIMAL / 
      NULLIF(COUNT(*), 0) * 100,
      2
    ) AS progress_rate
  FROM generation_tasks
  WHERE project_id = p_project_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_project_task_progress IS '获取项目任务执行进度';

-- 获取可并行执行的任务组
CREATE OR REPLACE FUNCTION get_parallel_tasks(p_project_id UUID, p_phase INT DEFAULT 1)
RETURNS TABLE (
  task_id UUID,
  task_code VARCHAR(50),
  chapter_id VARCHAR(20),
  chapter_name VARCHAR(200),
  task_type VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gt.id AS task_id,
    gt.task_code,
    gt.chapter_id,
    gt.chapter_name,
    gt.task_type
  FROM generation_tasks gt
  WHERE gt.project_id = p_project_id
    AND gt.status = 'pending'
    AND gt.parallel_group = (
      SELECT DISTINCT parallel_group 
      FROM generation_tasks 
      WHERE project_id = p_project_id 
        AND parallel_group IS NOT NULL
      ORDER BY parallel_group
      LIMIT 1 OFFSET p_phase - 1
    )
  ORDER BY gt.execution_order;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_parallel_tasks IS '获取指定阶段可并行执行的任务';

-- =====================================================
-- 6. 回滚脚本
-- =====================================================

/*
-- 如需回滚，执行以下命令：

DROP FUNCTION IF EXISTS get_parallel_tasks(UUID, INT);
DROP FUNCTION IF EXISTS get_project_task_progress(UUID);

DROP TRIGGER IF EXISTS update_task_plans_updated_at ON task_execution_plans;
DROP TRIGGER IF EXISTS update_generation_tasks_updated_at ON generation_tasks;

DROP TABLE IF EXISTS task_execution_plans;
DROP TABLE IF EXISTS generation_tasks;

DROP TYPE IF EXISTS task_status_enum;
DROP TYPE IF EXISTS task_type_enum;
*/
