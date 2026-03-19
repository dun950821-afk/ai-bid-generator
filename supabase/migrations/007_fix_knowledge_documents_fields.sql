-- 修复 knowledge_documents 表字段长度限制
-- 解决 docx 等 Office 文件的 MIME 类型过长问题
-- 例如: application/vnd.openxmlformats-officedocument.wordprocessingml.document (71字符)

-- 1. 修改 file_type 字段长度
ALTER TABLE knowledge_documents 
  ALTER COLUMN file_type TYPE VARCHAR(255);

-- 2. 确保 name 和 original_name 有足够长度（已是500，确认一下）
-- ALTER TABLE knowledge_documents ALTER COLUMN name TYPE VARCHAR(500);
-- ALTER TABLE knowledge_documents ALTER COLUMN original_name TYPE VARCHAR(500);

-- 3. 确保 storage_path 有足够长度（已是1000，确认一下）
-- ALTER TABLE knowledge_documents ALTER COLUMN storage_path TYPE VARCHAR(1000);

-- 添加注释
COMMENT ON COLUMN knowledge_documents.file_type IS '文件MIME类型，最大255字符，支持Office等长类型名';
