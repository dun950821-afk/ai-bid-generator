/**
 * IMA 知识库服务
 * 封装 IMA OpenAPI 的服务端调用
 * 
 * 文档参考: https://ima.qq.com
 * 认证方式: ima-openapi-clientid + ima-openapi-apikey 请求头
 * Base URL: https://ima.qq.com
 * 
 * 所有接口均为 POST + JSON body 方式调用
 */

const IMA_API_BASE = 'https://ima.qq.com';

export interface IMAConfig {
  apiKey: string;
  clientId: string;
}

// ==================== 通用请求封装 ====================

async function imaRequest<T>(
  path: string,
  config: IMAConfig,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { method = 'POST', body } = options;
  
  try {
    if (!config.apiKey || !config.clientId) {
      return { success: false, error: 'IMA知识库未配置（需要 API Key 和 Client ID）' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ima-openapi-clientid': config.clientId,
      'ima-openapi-apikey': config.apiKey,
    };

    const response = await fetch(`${IMA_API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (data.code === 0) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.msg || data.message || `请求失败(code:${data.code})` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '网络请求失败';
    return { success: false, error: msg };
  }
}

// ==================== 类型定义（对齐真实API响应） ====================

/** 知识库信息（search_knowledge_base 返回） */
export interface IMAKnowledgeBase {
  kb_id: string;
  kb_name: string;
  cover_url: string;
  member_count: string;
  content_count: string;
  description: string;
  creator: string;
  role_type: string;
  base_type: string;
  create_time?: string;
  update_time?: string;
}

/** 知识库列表搜索结果 */
export interface IMAKnowledgeBaseListData {
  info_list: IMAKnowledgeBase[];
  is_end: boolean;
  next_cursor: string;
}

/** 知识库详情（get_knowledge_base 返回，data.infos 是 kb_id -> detail 的映射） */
export interface IMAKnowledgeBaseDetail {
  id: string;
  name: string;
  cover_url: string;
  description: string;
  // 以下字段来自 search_knowledge_base 列表接口
  content_count?: string;
  member_count?: string;
  creator?: string;
  role_type?: string;
  base_type?: string;
  create_time?: number;
  update_time?: number;
}

/** get_knowledge_base 的返回格式: { infos: { [kb_id]: IMAKnowledgeBaseDetail } } */
export interface IMAKnowledgeBaseInfoData {
  infos: Record<string, IMAKnowledgeBaseDetail>;
}

/**
 * 知识条目（文件/文件夹 - get_knowledge_list 返回）
 * 
 * media_type 枚举：
 * 1 = PDF, 2 = 网页, 3 = Word, 4 = PPT, 5 = Excel, 6 = 公众号文章,
 * 7 = Markdown, 8 = 图片, 9 = 笔记, 10 = AI会话, 11 = TXT, 12 = Xmind, 13 = 录音
 * 99 = 文件夹
 */
export interface IMAKnowledgeItem {
  media_id: string;
  title: string;
  parent_folder_id: string;
  tags: string[];
  media_type: number;
  status?: number;
  create_time?: number;
  update_time?: number;
}

/** 文件夹信息（current_path 中的路径项） */
export interface IMAFolderInfo {
  folder_id: string;
  name: string;
  file_number: string;
  folder_number: string;
  parent_folder_id: string;
}

/** 知识库内容浏览结果 */
export interface IMAKnowledgeListData {
  knowledge_list: IMAKnowledgeItem[];
  is_end: boolean;
  next_cursor: string;
  current_path: IMAFolderInfo[];
}

/** 搜索结果条目（search_knowledge 返回） */
export interface IMASearchResultItem {
  media_id: string;
  title: string;
  parent_folder_id: string;
  highlight_content: string;
  media_type: number;
}

/** 搜索结果数据 */
export interface IMASearchData {
  info_list: IMASearchResultItem[];
  is_end: boolean;
  next_cursor: string;
}

/** 上传凭证（create_media 第一步） */
export interface IMAMediaCredential {
  upload_url: string;
  upload_credentials: Record<string, string>;
  media_id: string;
  cos_bucket: string;
  cos_region: string;
  file_path: string;
}

/** 添加知识结果（add_knowledge） */
export interface IMAAddKnowledgeResult {
  knowledge_id: string;
  title: string;
  status: string;
}

/** 导入URL结果 */
export interface IMAImportUrlResult {
  success_count: number;
  fail_count: number;
  results: Array<{
    url: string;
    knowledge_id?: string;
    title?: string;
    error?: string;
  }>;
}

/** 重复名检查结果 */
export interface IMARepeatedNameCheck {
  repeated_names: string[];
}

/** 媒体信息（原文访问链接） */
export interface IMAMediaInfo {
  media_id: string;
  title: string;
  type: string;
  access_url?: string;
  note_id?: string;
}

/** media_type 枚举映射 */
export const IMA_MEDIA_TYPE_MAP: Record<number, string> = {
  1: 'PDF',
  2: '网页',
  3: 'Word',
  4: 'PPT',
  5: 'Excel',
  6: '公众号文章',
  7: 'Markdown',
  8: '图片',
  9: '笔记',
  10: 'AI会话',
  11: 'TXT',
  12: 'Xmind',
  13: '录音',
  99: '文件夹',
};

/** media_type 对应的图标颜色 */
export const IMA_MEDIA_TYPE_COLOR: Record<number, string> = {
  1: 'text-red-500',       // PDF
  2: 'text-blue-500',      // 网页
  3: 'text-blue-600',      // Word
  4: 'text-orange-500',    // PPT
  5: 'text-green-500',     // Excel
  6: 'text-green-600',     // 公众号
  7: 'text-gray-600',      // Markdown
  8: 'text-purple-500',    // 图片
  9: 'text-yellow-500',    // 笔记
  10: 'text-indigo-500',   // AI会话
  11: 'text-gray-500',     // TXT
  12: 'text-pink-500',     // Xmind
  13: 'text-amber-500',    // 录音
  99: 'text-muted-foreground', // 文件夹
};

// ==================== 知识库模块 API ====================

/**
 * 搜索知识库列表
 * 对应: POST /openapi/wiki/v1/search_knowledge_base
 * @param query 搜索关键词，空字符串返回全部
 * @param limit 返回数量，最大20
 * @param cursor 分页游标，首次为空
 */
export async function searchKnowledgeBases(
  config: IMAConfig,
  params: {
    query?: string;
    limit?: number;
    cursor?: string;
  } = {}
): Promise<{ success: boolean; data?: IMAKnowledgeBaseListData; error?: string }> {
  const { query = '', limit = 20, cursor = '' } = params;
  const body: Record<string, unknown> = { query, limit };
  if (cursor) body.cursor = cursor;

  return imaRequest<IMAKnowledgeBaseListData>(
    '/openapi/wiki/v1/search_knowledge_base',
    config,
    { body }
  );
}

/**
 * 获取知识库信息
 * 对应: POST /openapi/wiki/v1/get_knowledge_base
 * 返回 { infos: { [kb_id]: IMAKnowledgeBaseDetail } } 映射
 */
export async function getKnowledgeBase(
  config: IMAConfig,
  knowledgeBaseIds: string[]
): Promise<{ success: boolean; data?: IMAKnowledgeBaseInfoData; error?: string }> {
  return imaRequest<IMAKnowledgeBaseInfoData>(
    '/openapi/wiki/v1/get_knowledge_base',
    config,
    {
      body: { ids: knowledgeBaseIds },
    }
  );
}

/**
 * 浏览知识库内容（支持层级浏览）
 * 对应: POST /openapi/wiki/v1/get_knowledge_list
 */
export async function getKnowledgeList(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    parent_folder_id?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<{ success: boolean; data?: IMAKnowledgeListData; error?: string }> {
  const { knowledge_base_id, parent_folder_id = '', limit = 50, cursor = '' } = params;
  const body: Record<string, unknown> = {
    knowledge_base_id,
    limit,
  };
  if (parent_folder_id) body.parent_folder_id = parent_folder_id;
  if (cursor) body.cursor = cursor;

  return imaRequest<IMAKnowledgeListData>(
    '/openapi/wiki/v1/get_knowledge_list',
    config,
    { body }
  );
}

/**
 * 搜索知识库内容
 * 对应: POST /openapi/wiki/v1/search_knowledge
 */
export async function searchKnowledge(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    query: string;
    limit?: number;
    cursor?: string;
  }
): Promise<{ success: boolean; data?: IMASearchData; error?: string }> {
  const { knowledge_base_id, query, limit = 5, cursor = '' } = params;
  const body: Record<string, unknown> = { knowledge_base_id, query, limit };
  if (cursor) body.cursor = cursor;

  return imaRequest<IMASearchData>(
    '/openapi/wiki/v1/search_knowledge',
    config,
    { body }
  );
}

/**
 * 创建媒体（获取COS上传凭证 - 文件上传第一步）
 * 对应: POST /openapi/wiki/v1/create_media
 */
export async function createMedia(
  config: IMAConfig,
  params: {
    kb_id: string;
    file_name: string;
    file_size: number;
    file_type?: string;
  }
): Promise<{ success: boolean; data?: IMAMediaCredential; error?: string }> {
  return imaRequest<IMAMediaCredential>(
    '/openapi/wiki/v1/create_media',
    config,
    { body: params }
  );
}

/**
 * 添加知识（完成文件上传/添加网页/关联笔记 - 文件上传最后一步）
 * 对应: POST /openapi/wiki/v1/add_knowledge
 */
export async function addKnowledge(
  config: IMAConfig,
  params: {
    kb_id: string;
    media_id?: string;
    title?: string;
    type: string;
    url?: string;
    note_id?: string;
    content?: string;
  }
): Promise<{ success: boolean; data?: IMAAddKnowledgeResult; error?: string }> {
  return imaRequest<IMAAddKnowledgeResult>(
    '/openapi/wiki/v1/add_knowledge',
    config,
    { body: params }
  );
}

/**
 * 获取可添加的知识库列表
 * 对应: POST /openapi/wiki/v1/get_addable_knowledge_base_list
 */
export async function getAddableKnowledgeBases(
  config: IMAConfig,
  params: {
    limit?: number;
    cursor?: string;
  } = {}
): Promise<{ success: boolean; data?: IMAKnowledgeBaseListData; error?: string }> {
  const { limit = 20, cursor = '' } = params;
  const body: Record<string, unknown> = { limit };
  if (cursor) body.cursor = cursor;

  return imaRequest<IMAKnowledgeBaseListData>(
    '/openapi/wiki/v1/get_addable_knowledge_base_list',
    config,
    { body }
  );
}

/**
 * 检查文件名重复
 * 对应: POST /openapi/wiki/v1/check_repeated_names
 */
export async function checkRepeatedNames(
  config: IMAConfig,
  params: {
    kb_id: string;
    file_names: string[];
    parent_folder_id?: string;
  }
): Promise<{ success: boolean; data?: IMARepeatedNameCheck; error?: string }> {
  return imaRequest<IMARepeatedNameCheck>(
    '/openapi/wiki/v1/check_repeated_names',
    config,
    { body: params }
  );
}

/**
 * 导入URL到知识库
 * 对应: POST /openapi/wiki/v1/import_urls
 */
export async function importUrls(
  config: IMAConfig,
  params: {
    kb_id: string;
    urls: string[];
    parent_folder_id?: string;
  }
): Promise<{ success: boolean; data?: IMAImportUrlResult; error?: string }> {
  return imaRequest<IMAImportUrlResult>(
    '/openapi/wiki/v1/import_urls',
    config,
    { body: params }
  );
}

/**
 * 获取媒体信息（原文访问链接）
 * 对应: POST /openapi/wiki/v1/get_media_info
 */
export async function getMediaInfo(
  config: IMAConfig,
  params: {
    kb_id: string;
    media_ids: string[];
  }
): Promise<{ success: boolean; data?: IMAMediaInfo[]; error?: string }> {
  return imaRequest<IMAMediaInfo[]>(
    '/openapi/wiki/v1/get_media_info',
    config,
    { body: params }
  );
}

/**
 * 验证 IMA 配置（通过搜索知识库列表测试连接）
 */
export async function validateConfig(config: IMAConfig): Promise<{ valid: boolean; error?: string }> {
  if (!config.apiKey || config.apiKey.trim() === '') {
    return { valid: false, error: 'API Key 不能为空' };
  }
  if (!config.clientId || config.clientId.trim() === '') {
    return { valid: false, error: 'Client ID 不能为空' };
  }

  const result = await searchKnowledgeBases(config, { limit: 1 });
  if (result.success) {
    return { valid: true };
  } else {
    return { valid: false, error: result.error || '配置验证失败' };
  }
}
