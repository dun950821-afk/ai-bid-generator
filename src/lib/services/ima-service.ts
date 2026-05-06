/**
 * IMA 知识库服务
 * 封装 IMA OpenAPI 的服务端调用
 * 
 * 文档参考: https://ima.qq.com
 * 认证方式: ima-openapi-clientid + ima-openapi-apikey 请求头
 * Base URL: https://ima.qq.com
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
  const { method = 'GET', body } = options;
  
  try {
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
      return { success: false, error: data.msg || data.message || '请求失败' };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '网络请求失败';
    return { success: false, error: msg };
  }
}

// ==================== 类型定义 ====================

/** 知识库信息 */
export interface IMAKnowledgeBase {
  knowledge_base_id: string;
  name: string;
  description: string;
  doc_count: number;
  create_time: number;
  update_time: number;
  icon?: string;
}

/** 知识库列表搜索结果 */
export interface IMAKnowledgeBaseListData {
  list: IMAKnowledgeBase[];
  total: number;
  has_more: boolean;
}

/** 知识库详情 */
export interface IMAKnowledgeBaseDetail {
  knowledge_base_id: string;
  name: string;
  description: string;
  doc_count: number;
  create_time: number;
  update_time: number;
  config?: {
    chunk_size: number;
    search_top_k: number;
    score_threshold: number;
  };
}

/** 知识条目（文件/文件夹） */
export interface IMAKnowledgeItem {
  knowledge_id: string;
  title: string;
  type: 'file' | 'folder' | 'note' | 'url';
  status: 'processing' | 'completed' | 'failed';
  create_time: number;
  update_time: number;
  file_size?: number;
  file_type?: string;
  parent_id?: string;
  children_count?: number;
}

/** 知识库内容浏览结果 */
export interface IMAKnowledgeListData {
  list: IMAKnowledgeItem[];
  total: number;
  has_more: boolean;
}

/** 搜索结果条目 */
export interface IMASearchResult {
  knowledge_id: string;
  title: string;
  content: string;
  score: number;
  highlight?: string;
  type?: string;
}

/** 搜索结果数据 */
export interface IMASearchData {
  query: string;
  results: IMASearchResult[];
  total: number;
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

// ==================== 知识库模块 API ====================

/**
 * 搜索知识库列表
 * 对应: /openapi/wiki/v1/search_knowledge_base
 */
export async function searchKnowledgeBases(
  config: IMAConfig,
  params: {
    keyword?: string;
    page?: number;
    page_size?: number;
  } = {}
): Promise<{ success: boolean; data?: IMAKnowledgeBaseListData; error?: string }> {
  const { keyword = '', page = 1, page_size = 20 } = params;
  const query = new URLSearchParams({ page: String(page), page_size: String(page_size) });
  if (keyword) query.set('keyword', keyword);

  return imaRequest<IMAKnowledgeBaseListData>(
    `/openapi/wiki/v1/search_knowledge_base?${query.toString()}`,
    config
  );
}

/**
 * 获取知识库信息
 * 对应: /openapi/wiki/v1/get_knowledge_base
 */
export async function getKnowledgeBase(
  config: IMAConfig,
  knowledgeBaseIds: string[]
): Promise<{ success: boolean; data?: IMAKnowledgeBaseDetail[]; error?: string }> {
  return imaRequest<IMAKnowledgeBaseDetail[]>(
    '/openapi/wiki/v1/get_knowledge_base',
    config,
    {
      method: 'POST',
      body: { knowledge_base_ids: knowledgeBaseIds },
    }
  );
}

/**
 * 浏览知识库内容（支持层级浏览）
 * 对应: /openapi/wiki/v1/get_knowledge_list
 */
export async function getKnowledgeList(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    parent_id?: string;
    page?: number;
    page_size?: number;
  }
): Promise<{ success: boolean; data?: IMAKnowledgeListData; error?: string }> {
  const { knowledge_base_id, parent_id = '', page = 1, page_size = 50 } = params;
  const body: Record<string, unknown> = {
    knowledge_base_id,
    page,
    page_size,
  };
  if (parent_id) body.parent_id = parent_id;

  return imaRequest<IMAKnowledgeListData>(
    '/openapi/wiki/v1/get_knowledge_list',
    config,
    { method: 'POST', body }
  );
}

/**
 * 搜索知识库内容
 * 对应: /openapi/wiki/v1/search_knowledge
 */
export async function searchKnowledge(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    query: string;
    top_k?: number;
  }
): Promise<{ success: boolean; data?: IMASearchData; error?: string }> {
  const { knowledge_base_id, query, top_k = 5 } = params;

  return imaRequest<IMASearchData>(
    '/openapi/wiki/v1/search_knowledge',
    config,
    {
      method: 'POST',
      body: { knowledge_base_id, query, top_k },
    }
  );
}

/**
 * 创建媒体（获取COS上传凭证 - 文件上传第一步）
 * 对应: /openapi/wiki/v1/create_media
 */
export async function createMedia(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    file_name: string;
    file_size: number;
    file_type?: string;
  }
): Promise<{ success: boolean; data?: IMAMediaCredential; error?: string }> {
  return imaRequest<IMAMediaCredential>(
    '/openapi/wiki/v1/create_media',
    config,
    {
      method: 'POST',
      body: params,
    }
  );
}

/**
 * 添加知识（完成文件上传/添加网页/关联笔记 - 文件上传最后一步）
 * 对应: /openapi/wiki/v1/add_knowledge
 */
export async function addKnowledge(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    media_id?: string;
    title?: string;
    type: 'file' | 'url' | 'note';
    url?: string;
    note_id?: string;
    content?: string;
  }
): Promise<{ success: boolean; data?: IMAAddKnowledgeResult; error?: string }> {
  return imaRequest<IMAAddKnowledgeResult>(
    '/openapi/wiki/v1/add_knowledge',
    config,
    {
      method: 'POST',
      body: params,
    }
  );
}

/**
 * 获取可添加的知识库列表
 * 对应: /openapi/wiki/v1/get_addable_knowledge_base_list
 */
export async function getAddableKnowledgeBases(
  config: IMAConfig,
  params: {
    page?: number;
    page_size?: number;
  } = {}
): Promise<{ success: boolean; data?: IMAKnowledgeBaseListData; error?: string }> {
  const { page = 1, page_size = 20 } = params;
  return imaRequest<IMAKnowledgeBaseListData>(
    `/openapi/wiki/v1/get_addable_knowledge_base_list?page=${page}&page_size=${page_size}`,
    config
  );
}

/**
 * 检查文件名重复
 * 对应: /openapi/wiki/v1/check_repeated_names
 */
export async function checkRepeatedNames(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    file_names: string[];
    parent_id?: string;
  }
): Promise<{ success: boolean; data?: IMARepeatedNameCheck; error?: string }> {
  return imaRequest<IMARepeatedNameCheck>(
    '/openapi/wiki/v1/check_repeated_names',
    config,
    {
      method: 'POST',
      body: params,
    }
  );
}

/**
 * 导入URL到知识库
 * 对应: /openapi/wiki/v1/import_urls
 */
export async function importUrls(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    urls: string[];
    parent_id?: string;
  }
): Promise<{ success: boolean; data?: IMAImportUrlResult; error?: string }> {
  return imaRequest<IMAImportUrlResult>(
    '/openapi/wiki/v1/import_urls',
    config,
    {
      method: 'POST',
      body: params,
    }
  );
}

/**
 * 获取媒体信息（原文访问链接）
 * 对应: /openapi/wiki/v1/get_media_info
 */
export async function getMediaInfo(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    knowledge_ids: string[];
  }
): Promise<{ success: boolean; data?: IMAMediaInfo[]; error?: string }> {
  return imaRequest<IMAMediaInfo[]>(
    '/openapi/wiki/v1/get_media_info',
    config,
    {
      method: 'POST',
      body: params,
    }
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

  const result = await searchKnowledgeBases(config, { page: 1, page_size: 1 });
  if (result.success) {
    return { valid: true };
  } else {
    return { valid: false, error: result.error || '配置验证失败' };
  }
}
