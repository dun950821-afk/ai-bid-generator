-- =====================================================
-- 迁移：删除本地知识库相关表
-- 说明：知识库功能已完全迁移到阿里云百炼API
--       本地表不再需要，全部数据从百炼API获取
-- =====================================================

-- 1. 删除文档标签关联表
DROP TABLE IF EXISTS document_tags CASCADE;

-- 2. 删除知识标签表
DROP TABLE IF EXISTS knowledge_tags CASCADE;

-- 3. 删除文档分块表
DROP TABLE IF EXISTS document_chunks CASCADE;

-- 4. 删除知识文档表
DROP TABLE IF EXISTS knowledge_documents CASCADE;

-- 5. 删除知识库表（注意：projects表有外键引用，需要先处理）
-- 先移除 projects 表中的外键约束
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_knowledge_base_id_fkey;

-- 然后删除 knowledge_bases 表
DROP TABLE IF EXISTS knowledge_bases CASCADE;

-- 6. 删除相关的向量搜索函数（已废弃）
DROP FUNCTION IF EXISTS match_documents(uuid, float, int, uuid);
DROP FUNCTION IF EXISTS match_documents_with_filter(uuid, float, int, uuid, uuid[]);

-- 7. 清理 upload_sessions 表中的 knowledge_base_id 字段
-- （保留表，但移除对已删除表的外键引用）
ALTER TABLE upload_sessions DROP CONSTRAINT IF EXISTS upload_sessions_knowledge_base_id_fkey;

-- 8. 添加注释说明
COMMENT ON TABLE upload_sessions IS '上传会话表 - knowledge_base_id 现在存储百炼知识库ID（字符串）';
COMMENT ON COLUMN upload_sessions.knowledge_base_id IS '百炼知识库ID（来自阿里云百炼平台）';

-- =====================================================
-- 迁移完成
-- =====================================================
