-- 创建上传会话表，用于支持断点续传
CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  knowledge_base_id UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  uploaded_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, uploading, completed, cancelled
  uploaded_parts JSONB DEFAULT '[]'::jsonb, -- [{partNumber, etag, key}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours') -- 24小时后过期
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_upload_sessions_knowledge_base_id ON upload_sessions(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at ON upload_sessions(expires_at);

-- 添加注释
COMMENT ON TABLE upload_sessions IS '分片上传会话表，支持断点续传';
COMMENT ON COLUMN upload_sessions.uploaded_parts IS '已上传的分片列表，JSON数组格式';
