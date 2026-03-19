-- 修复 upload_sessions 表的 knowledge_base_id 字段类型
-- 将 UUID 改为 VARCHAR(36)，与 knowledge_bases.id 保持一致

-- 1. 先删除外键约束（如果存在）
DO $$
BEGIN
  -- 检查是否存在外键约束并删除
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%upload_sessions_knowledge_base_id_fkey%'
    AND table_name = 'upload_sessions'
  ) THEN
    ALTER TABLE upload_sessions DROP CONSTRAINT upload_sessions_knowledge_base_id_fkey;
  END IF;
END $$;

-- 2. 修改字段类型为 VARCHAR(36)
ALTER TABLE upload_sessions 
ALTER COLUMN knowledge_base_id TYPE VARCHAR(36) USING knowledge_base_id::text;

-- 3. 重新添加外键约束（指向 VARCHAR(36) 类型的 knowledge_bases.id）
ALTER TABLE upload_sessions
ADD CONSTRAINT upload_sessions_knowledge_base_id_fkey
FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE;

-- 4. 更新注释
COMMENT ON COLUMN upload_sessions.knowledge_base_id IS '知识库ID，VARCHAR(36)类型，关联 knowledge_bases.id';

-- 注意：如果上述外键约束添加失败（因为 knowledge_bases.id 也是 VARCHAR 而非 UUID），
-- 可以手动执行以下 SQL 来添加正确的外键：
-- ALTER TABLE upload_sessions
-- ADD CONSTRAINT upload_sessions_knowledge_base_id_fkey
-- FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE;
