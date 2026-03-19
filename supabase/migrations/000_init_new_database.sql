-- =====================================================
-- 新数据库初始化脚本
-- 请在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 0. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- 1. 基础表
-- =====================================================

-- knowledge_bases 表
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'enterprise',
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  chunk_size INTEGER DEFAULT 500,
  chunk_overlap INTEGER DEFAULT 50,
  document_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB,
  created_by VARCHAR(36),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS knowledge_bases_type_idx ON knowledge_bases(type);
CREATE INDEX IF NOT EXISTS knowledge_bases_created_by_idx ON knowledge_bases(created_by);
CREATE INDEX IF NOT EXISTS knowledge_bases_is_active_idx ON knowledge_bases(is_active);

-- knowledge_documents 表
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  knowledge_base_id VARCHAR(36) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  file_type VARCHAR(255),
  file_size INTEGER,
  storage_path VARCHAR(1000),
  storage_type VARCHAR(20) DEFAULT 'local',
  vector_status VARCHAR(20) DEFAULT 'pending',
  vector_error TEXT,
  chunk_count INTEGER DEFAULT 0,
  metadata JSONB,
  uploaded_by VARCHAR(36),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS knowledge_documents_kb_idx ON knowledge_documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_vector_status_idx ON knowledge_documents(vector_status);

-- document_chunks 表（用于向量存储）
CREATE TABLE IF NOT EXISTS document_chunks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id VARCHAR(36) NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  knowledge_base_id VARCHAR(36) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1024),
  start_position INTEGER,
  end_position INTEGER,
  page_number INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS document_chunks_doc_idx ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS document_chunks_kb_idx ON document_chunks(knowledge_base_id);

-- =====================================================
-- 2. 系统设置表（关键！用于存储数据库配置）
-- =====================================================

CREATE TABLE IF NOT EXISTS system_settings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

-- =====================================================
-- 3. 知识库标签表
-- =====================================================

-- knowledge_tags 表 - 知识库标签
CREATE TABLE IF NOT EXISTS knowledge_tags (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  knowledge_base_id VARCHAR(36) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS knowledge_tags_kb_idx ON knowledge_tags(knowledge_base_id);
CREATE INDEX IF NOT EXISTS knowledge_tags_name_idx ON knowledge_tags(name);

-- document_tags 表 - 文档与标签的关联
CREATE TABLE IF NOT EXISTS document_tags (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id VARCHAR(36) NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  tag_id VARCHAR(36) NOT NULL REFERENCES knowledge_tags(id) ON DELETE CASCADE,
  knowledge_base_id VARCHAR(36) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  UNIQUE(document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS document_tags_doc_idx ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS document_tags_tag_idx ON document_tags(tag_id);
CREATE INDEX IF NOT EXISTS document_tags_kb_idx ON document_tags(knowledge_base_id);

-- =====================================================
-- 4. 上传会话表
-- =====================================================

CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  knowledge_base_id VARCHAR(36) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  uploaded_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_parts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_knowledge_base_id ON upload_sessions(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at ON upload_sessions(expires_at);

-- =====================================================
-- 5. 向量索引
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_document_chunks_embedding') THEN
        RAISE NOTICE '向量索引已存在';
    ELSE
        CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
        ON document_chunks 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    END IF;
END $$;

-- =====================================================
-- 6. 向量检索函数
-- =====================================================

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_knowledge_base_id VARCHAR(36) DEFAULT NULL
)
RETURNS TABLE (
  id VARCHAR(36),
  document_id VARCHAR(36),
  knowledge_base_id VARCHAR(36),
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

-- =====================================================
-- 7. 上传会话相关 RPC 函数
-- =====================================================

-- 创建上传会话
CREATE OR REPLACE FUNCTION create_upload_session(
  p_id UUID,
  p_file_name TEXT,
  p_file_size BIGINT,
  p_file_type TEXT,
  p_storage_key TEXT,
  p_knowledge_base_id TEXT DEFAULT NULL,
  p_uploaded_by TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO upload_sessions (
    id, file_name, file_size, file_type, storage_key,
    knowledge_base_id, uploaded_by, status
  ) VALUES (
    p_id, p_file_name, p_file_size, p_file_type, p_storage_key,
    p_knowledge_base_id, p_uploaded_by, 'pending'
  );
END;
$$;

-- 获取上传会话
CREATE OR REPLACE FUNCTION get_upload_session(p_id UUID)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
  storage_key TEXT,
  knowledge_base_id TEXT,
  uploaded_by TEXT,
  status TEXT,
  uploaded_parts JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.id,
    us.file_name,
    us.file_size,
    us.file_type,
    us.storage_key,
    us.knowledge_base_id::text,
    us.uploaded_by,
    us.status,
    us.uploaded_parts,
    us.created_at,
    us.updated_at,
    us.expires_at
  FROM upload_sessions us
  WHERE us.id = p_id;
END;
$$;

-- 更新上传会话
CREATE OR REPLACE FUNCTION update_upload_session(
  p_id UUID,
  p_part_number INTEGER,
  p_etag TEXT,
  p_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE upload_sessions
  SET 
    uploaded_parts = uploaded_parts || jsonb_build_object(
      'partNumber', p_part_number,
      'etag', p_etag,
      'key', p_key
    )::jsonb,
    status = 'uploading',
    updated_at = NOW()
  WHERE id = p_id;
END;
$$;

-- 完成上传会话
CREATE OR REPLACE FUNCTION complete_upload_session(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE upload_sessions
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_id;
END;
$$;

-- 删除上传会话
CREATE OR REPLACE FUNCTION delete_upload_session(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM upload_sessions WHERE id = p_id;
END;
$$;

-- =====================================================
-- 8. 更新时间触发器
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间触发器
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'knowledge_bases',
        'knowledge_documents',
        'system_settings',
        'knowledge_tags',
        'upload_sessions'
    ]) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %s', t, t);
        EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- =====================================================
-- 验证脚本
-- =====================================================

-- 检查所有表是否创建成功
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'knowledge_bases',
    'knowledge_documents',
    'document_chunks',
    'system_settings',
    'knowledge_tags',
    'document_tags',
    'upload_sessions'
  )
ORDER BY table_name;

-- 应该返回 7 行
