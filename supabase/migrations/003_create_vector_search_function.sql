-- =====================================================
-- 向量检索函数
-- 用于在 document_chunks 表中执行向量相似度检索
-- =====================================================

-- 1. 创建向量相似度检索函数
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_knowledge_base_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  knowledge_base_id uuid,
  content text,
  chunk_index int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.knowledge_base_id,
    dc.content,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE 
    dc.embedding IS NOT NULL
    AND (filter_knowledge_base_id IS NULL OR dc.knowledge_base_id = filter_knowledge_base_id)
    AND 1 - (dc.embedding <=> query_embedding) >= match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 2. 添加注释
COMMENT ON FUNCTION match_documents IS '执行向量相似度检索，返回与查询向量最相似的文档分块';

-- 3. 授权（根据实际需求调整）
-- GRANT EXECUTE ON FUNCTION match_documents TO authenticated;
-- GRANT EXECUTE ON FUNCTION match_documents TO service_role;

-- =====================================================
-- 使用示例
-- =====================================================
-- SELECT * FROM match_documents(
--   '[0.1, 0.2, 0.3, ...]'::vector,  -- 查询向量
--   0.7,                              -- 相似度阈值
--   10,                               -- 返回数量
--   'knowledge-base-uuid'             -- 知识库ID（可选）
-- );
