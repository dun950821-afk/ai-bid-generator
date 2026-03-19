-- 创建上传会话相关的 RPC 函数

-- 1. 创建上传会话
CREATE OR REPLACE FUNCTION create_upload_session(
  p_id UUID,
  p_file_name TEXT,
  p_file_size BIGINT,
  p_file_type TEXT,
  p_storage_key TEXT,
  p_knowledge_base_id UUID DEFAULT NULL,
  p_uploaded_by TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO upload_sessions (
    id,
    file_name,
    file_size,
    file_type,
    storage_key,
    knowledge_base_id,
    uploaded_by,
    status
  ) VALUES (
    p_id,
    p_file_name,
    p_file_size,
    p_file_type,
    p_storage_key,
    p_knowledge_base_id,
    p_uploaded_by,
    'pending'
  );
END;
$$;

-- 2. 获取上传会话
CREATE OR REPLACE FUNCTION get_upload_session(p_id UUID)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
  storage_key TEXT,
  knowledge_base_id UUID,
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
    us.knowledge_base_id,
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

-- 3. 更新上传会话（添加已上传的分片）
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

-- 4. 完成上传会话
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

-- 5. 删除上传会话
CREATE OR REPLACE FUNCTION delete_upload_session(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM upload_sessions WHERE id = p_id;
END;
$$;

-- 添加注释
COMMENT ON FUNCTION create_upload_session IS '创建新的上传会话';
COMMENT ON FUNCTION get_upload_session IS '获取上传会话详情';
COMMENT ON FUNCTION update_upload_session IS '更新上传会话（添加已上传分片）';
COMMENT ON FUNCTION complete_upload_session IS '标记上传会话为已完成';
COMMENT ON FUNCTION delete_upload_session IS '删除上传会话';
