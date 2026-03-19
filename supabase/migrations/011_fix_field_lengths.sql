-- =====================================================
-- 修复字段长度问题
-- =====================================================

-- 1. 修复 knowledge_documents.file_type 字段长度
-- 某些 MIME 类型如 "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 很长
ALTER TABLE knowledge_documents 
ALTER COLUMN file_type TYPE VARCHAR(255);

-- 2. 检查其他可能需要调整的字段
-- storage_type 目前是 VARCHAR(20)，应该够用
-- vector_status 目前是 VARCHAR(20)，应该够用

-- 验证修改
SELECT column_name, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'knowledge_documents' 
  AND column_name IN ('file_type', 'storage_type', 'vector_status');

-- 预期结果：
-- file_type | 255
-- storage_type | 20
-- vector_status | 20

COMMENT ON COLUMN knowledge_documents.file_type IS '文件MIME类型，如 application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document';
