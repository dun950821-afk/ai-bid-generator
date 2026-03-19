-- =====================================================
-- 阿里云百炼知识库配置 - 迁移脚本
-- 版本: 012
-- 描述: 添加阿里云百炼知识库相关配置项
-- =====================================================

-- 插入百炼配置项
INSERT INTO system_settings (key, value, category, description) VALUES
-- 百炼基础配置
('access_key_id', NULL, 'bailian', '阿里云 AccessKey ID'),
('access_key_secret', NULL, 'bailian', '阿里云 AccessKey Secret'),
('workspace_id', NULL, 'bailian', '百炼工作空间ID'),
('endpoint', 'bailian.cn-beijing.aliyuncs.com', 'bailian', '百炼API端点'),
('region_id', 'cn-beijing', 'bailian', '百炼地域ID'),

-- 百炼知识库配置
('default_embedding_model', 'text-embedding-v4', 'bailian', '默认Embedding模型'),
('default_rerank_model', 'qwen3-rerank-hybrid', 'bailian', '默认Rerank模型'),
('default_chunk_size', '500', 'bailian', '默认分块大小'),
('default_overlap_size', '100', 'bailian', '默认分块重叠大小'),
('default_rerank_min_score', '0.01', 'bailian', '默认相似度阈值'),

-- 百炼文档解析配置
('default_parser', 'DOCUMENT_UNDERSTANDING_LLM', 'bailian', '默认文档解析方式'),
('parser_timeout', '600000', 'bailian', '文档解析超时时间(毫秒)')

ON CONFLICT (key) DO NOTHING;

-- 添加注释
COMMENT ON COLUMN system_settings.category IS '配置分类：llm, embedding, storage, general, bailian';
