-- =====================================================
-- 添加知识库标签表和文档标签关联表
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

-- 注释
COMMENT ON TABLE knowledge_tags IS '知识库标签表';
COMMENT ON TABLE document_tags IS '文档与标签关联表';
