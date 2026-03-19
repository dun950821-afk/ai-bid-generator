-- =====================================================
-- 向量索引迁移脚本
-- 为 document_chunks 表的 embedding 字段创建 HNSW 索引
-- 提升向量检索性能（万级数据量时速度提升10-100倍）
-- =====================================================

-- 1. 确保启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 检查 document_chunks 表是否存在
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'document_chunks'
    ) THEN
        RAISE NOTICE 'document_chunks 表不存在，跳过索引创建';
    ELSE
        -- 3. 创建 HNSW 索引
        -- 参数说明：
        -- - m = 16: 每个节点的连接数，影响召回率和构建时间
        --          较大的值提高召回率，但增加构建时间和内存占用
        --          推荐范围: 16-48，默认16适合大多数场景
        -- - ef_construction = 64: 构建时的候选列表大小
        --          较大的值提高索引质量，但增加构建时间
        --          推荐范围: 32-128，64是性能和质量的平衡点
        -- - vector_cosine_ops: 余弦相似度操作符
        --          因为我们主要计算余弦相似度，使用此操作符
        
        RAISE NOTICE '开始创建 HNSW 索引，这可能需要几分钟时间...';
        
        -- 使用 CONCURRENTLY 不阻塞写入操作
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_embedding 
        ON document_chunks 
        USING hnsw (embedding vector_cosine_ops)
        WITH (
            m = 16,
            ef_construction = 64
        );
        
        RAISE NOTICE 'HNSW 索引创建完成';
    END IF;
END $$;

-- 4. 为查询优化设置参数
-- 设置查询时的候选列表大小（ef_search）
-- 较大的值提高召回率，但增加查询时间
-- 默认值是 40，可根据实际需求调整
SET hnsw.ef_search = 100;

-- 5. 添加注释说明索引用途
COMMENT ON INDEX idx_document_chunks_embedding IS 
'HNSW索引用于加速向量相似度搜索，支持高召回率的近似最近邻检索';

-- 6. 验证索引创建
DO $$
DECLARE
    index_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'document_chunks'
        AND indexname = 'idx_document_chunks_embedding'
    ) INTO index_exists;
    
    IF index_exists THEN
        RAISE NOTICE '✅ 索引验证成功：idx_document_chunks_embedding 已创建';
    ELSE
        RAISE NOTICE 'ℹ️ 索引不存在，可能是因为表为空或其他原因';
    END IF;
END $$;

-- =====================================================
-- 性能建议
-- =====================================================
-- 1. 索引构建时间：
--    - 1万条记录：约1-2分钟
--    - 10万条记录：约10-20分钟
--    - 建议在低峰期执行迁移
--
-- 2. 磁盘空间：
--    - 索引大小约为原始向量数据的1.2-1.3倍
--    - 1024维向量每条约4KB，1万条约40MB，索引约48-52MB
--
-- 3. 召回率：
--    - HNSW是近似算法，召回率约95-98%
--    - 可通过调整 ef_search 参数提高召回率（牺牲查询速度）
--
-- 4. 查询优化：
--    - 使用 SET hnsw.ef_search = 200; 提高召回率
--    - 使用 EXPLAIN ANALYZE 分析查询计划
--
-- 5. 监控：
--    - 查询索引大小：SELECT pg_size_pretty(pg_relation_size('idx_document_chunks_embedding'));
--    - 查询索引状态：SELECT * FROM pg_indexes WHERE indexname = 'idx_document_chunks_embedding';
-- =====================================================
