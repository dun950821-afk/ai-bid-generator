/**
 * IMA 知识库服务
 * 封装 IMA OpenAPI 的服务端调用
 * 
 * 文档参考: https://skillhub.cn/skills/ima-skills
 * 认证方式: ima-openapi-clientid + ima-openapi-apikey 请求头
 * Base URL: https://ima.qq.com
 * 
 * 所有接口均为 POST + JSON body 方式调用
 * 响应格式: { retcode: 0, errmsg: "成功", data: {...} }
 * retcode=0 表示成功，retcode≠0 表示失败
 * 
 * 重要: 
 * - get_knowledge_list 使用 folder_id（非 parent_folder_id）浏览子文件夹
 * - 根目录的 folder_id 等于 knowledge_base_id
 * - 不存在 get_media_info API（v1.1.3）
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

    // IMA API 实际使用 code/msg（非 retcode/errmsg）
    if (data.code === 0) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.msg || `请求失败(code:${data.code})` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '网络请求失败';
    return { success: false, error: msg };
  }
}

// ==================== 类型定义（对齐官方API文档） ====================

/** 知识库搜索结果（search_knowledge_base 返回的 SearchedKnowledgeBaseInfo） */
export interface IMAKnowledgeBase {
  kb_id: string;
  kb_name: string;
  description: string;
  content_count: number;
  member_count: number;
  creator: string;
  role_type: number;
  base_type: number;
  create_time: number;
  update_time: number;
}

/** 知识库详情（get_knowledge_base 返回的 KnowledgeBaseInfo） */
export interface IMAKnowledgeBaseDetail {
  id: string;
  name: string;
  cover_url: string;
  description: string;
  recommended_questions?: string[];
}

/** get_knowledge_base 返回的 infos 是 kb_id -> detail 的映射 */
export interface IMAKnowledgeBaseInfoData {
  infos: Record<string, IMAKnowledgeBaseDetail>;
}

/** 知识条目/文件（get_knowledge_list 返回的 KnowledgeInfo） */
export interface IMAKnowledgeItem {
  media_id: string;
  title: string;
  parent_folder_id: string;
}

/** 文件夹条目（get_knowledge_list 返回的 FolderInfo） */
export interface IMAFolderItem {
  folder_id: string;
  name: string;
  file_number: number;
  folder_number: number;
  parent_folder_id: string;
  is_top: boolean;
}

/** get_knowledge_list 返回结果中的条目（可能是文件或文件夹） */
export interface IMAKnowledgeListEntry {
  // 通用字段
  media_type?: number;
  // 文件字段
  media_id?: string;
  title?: string;
  parent_folder_id?: string;
  // 文件夹字段
  folder_id?: string;
  name?: string;
  file_number?: number;
  folder_number?: number;
  is_top?: boolean;
}

/** 知识库内容浏览结果（get_knowledge_list 返回） */
export interface IMAKnowledgeListData {
  knowledge_list: IMAKnowledgeListEntry[];
  is_end: boolean;
  next_cursor: string;
  current_path: IMAFolderItem[];
}

/** 搜索结果条目（search_knowledge 返回的 SearchedKnowledgeInfo） */
export interface IMASearchResultItem {
  media_id: string;
  title: string;
  parent_folder_id: string;
  highlight_content: string;
  media_type?: number;  // 搜索结果可能不返回此字段
}

/** 搜索结果数据（search_knowledge 返回） */
export interface IMASearchData {
  info_list: IMASearchResultItem[];
  is_end: boolean;
  next_cursor: string;
}

/** COS 上传凭证（create_media 返回的 Credential） */
export interface IMACosCredential {
  token: string;
  secret_id: string;
  secret_key: string;
  start_time: number;
  expired_time: number;
  appid: string;
  bucket_name: string;
  region: string;
  custom_domain: string;
  cos_key: string;
}

/** create_media 返回数据 */
export interface IMACreateMediaData {
  credential: IMACosCredential;
  media_id: string;
}

/** add_knowledge 的 FileInfo */
export interface IMAFileInfo {
  cos_key: string;
  file_size: number;
  last_modify_time: number;
  password?: string;
  file_name: string;
}

/** add_knowledge 的 ContentInfo */
export interface IMAContentInfo {
  content_id: string;
}

/** 导入URL的单条结果（import_urls 返回的 ImportURLData） */
export interface IMAImportUrlEntry {
  url: string;
  ret_code: number;
  media_id: string;
}

/** 导入URL结果（import_urls 返回） */
export interface IMAImportUrlData {
  results: Record<string, IMAImportUrlEntry>;
}

/** 重复名检查的单条结果 */
export interface IMARepeatedNameResult {
  name: string;
  is_repeated: boolean;
}

/** 重复名检查结果（check_repeated_names 返回） */
export interface IMARepeatedNameData {
  results: IMARepeatedNameResult[];
}

/** 可添加的知识库信息（get_addable_knowledge_base_list 返回） */
export interface IMAAddableKnowledgeBase {
  id: string;
  name: string;
}

/** 可添加的知识库列表数据 */
export interface IMAAddableKnowledgeBaseData {
  addable_knowledge_base_list: IMAAddableKnowledgeBase[];
  next_cursor: string;
  is_end: boolean;
}

/** media_type 枚举映射（对齐官方 API 文档 v1.1.3） */
export const IMA_MEDIA_TYPE_MAP: Record<number, string> = {
  0: '未知',
  1: 'PDF',
  2: '网页',
  3: 'Word',
  4: 'PPT',
  5: 'Excel',
  6: '公众号文章',
  7: 'Markdown',
  9: '图片',
  11: '笔记',
  12: 'AI会话',
  13: 'TXT',
  14: 'Xmind',
  15: '录音',
  16: '视频解析',
  99: '文件夹',
};

/** media_type 对应的图标颜色 */
export const IMA_MEDIA_TYPE_COLOR: Record<number, string> = {
  0: 'text-gray-400',       // 未知
  1: 'text-red-500',        // PDF
  2: 'text-blue-500',       // 网页
  3: 'text-blue-600',       // Word
  4: 'text-orange-500',     // PPT
  5: 'text-green-500',      // Excel
  6: 'text-green-600',      // 公众号
  7: 'text-gray-600',       // Markdown
  9: 'text-purple-500',     // 图片
  11: 'text-yellow-500',    // 笔记
  12: 'text-indigo-500',    // AI会话
  13: 'text-gray-500',      // TXT
  14: 'text-pink-500',      // Xmind
  15: 'text-amber-500',     // 录音
  16: 'text-cyan-500',      // 视频解析
  99: 'text-muted-foreground', // 文件夹
};

/**
 * 判断列表条目是否为文件夹
 */
export function isFolderEntry(entry: IMAKnowledgeListEntry): boolean {
  return entry.media_type === 99 || (entry.media_id?.startsWith('folder_') ?? false);
}

// ==================== 知识库模块 API ====================

/**
 * 1. 搜索知识库列表
 * POST /openapi/wiki/v1/search_knowledge_base
 * @param query 搜索关键词，空字符串返回全部
 * @param limit 返回数量，最大50
 * @param cursor 分页游标，首次为空
 */
export async function searchKnowledgeBases(
  config: IMAConfig,
  params: {
    query?: string;
    limit?: number;
    cursor?: string;
  } = {}
): Promise<{ success: boolean; data?: { info_list: IMAKnowledgeBase[]; is_end: boolean; next_cursor: string }; error?: string }> {
  const { query = '', limit = 20, cursor = '' } = params;
  const body: Record<string, unknown> = { query, limit, cursor };

  return imaRequest(
    '/openapi/wiki/v1/search_knowledge_base',
    config,
    { body }
  );
}

/**
 * 2. 获取知识库信息
 * POST /openapi/wiki/v1/get_knowledge_base
 * 返回 { infos: { [kb_id]: KnowledgeBaseInfo } } 映射
 * @param ids 知识库ID列表（1-20个）
 */
export async function getKnowledgeBase(
  config: IMAConfig,
  ids: string[]
): Promise<{ success: boolean; data?: IMAKnowledgeBaseInfoData; error?: string }> {
  return imaRequest<IMAKnowledgeBaseInfoData>(
    '/openapi/wiki/v1/get_knowledge_base',
    config,
    { body: { ids } }
  );
}

/**
 * 3. 浏览知识库内容
 * POST /openapi/wiki/v1/get_knowledge_list
 * 
 * 重要: 使用 folder_id 参数进入子文件夹（非 parent_folder_id）
 * 根目录的 folder_id 等于 knowledge_base_id
 * 省略 folder_id 则列出根目录内容
 * 
 * 返回结果中 knowledge_list 同时包含文件(KnowledgeInfo)和文件夹(FolderInfo)
 * 文件夹通过 folder_id 字段区分（非空的 folder_id 表示文件夹）
 * current_path 提供当前路径面包屑信息
 */
export async function getKnowledgeList(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    folder_id?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<{ success: boolean; data?: IMAKnowledgeListData; error?: string }> {
  const { knowledge_base_id, folder_id, limit = 50, cursor = '' } = params;
  const body: Record<string, unknown> = {
    knowledge_base_id,
    limit,
    cursor,
  };
  // folder_id: 省略则列出根目录，根目录 folder_id = knowledge_base_id
  if (folder_id) body.folder_id = folder_id;

  return imaRequest<IMAKnowledgeListData>(
    '/openapi/wiki/v1/get_knowledge_list',
    config,
    { body }
  );
}

/**
 * 4. 搜索知识库内容
 * POST /openapi/wiki/v1/search_knowledge
 * 返回 info_list: SearchedKnowledgeInfo[] (含 highlight_content)
 */
export async function searchKnowledge(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    query: string;
    cursor?: string;
    limit?: number;
  }
): Promise<{ success: boolean; data?: IMASearchData; error?: string }> {
  const { knowledge_base_id, query, cursor = '', limit } = params;
  const body: Record<string, unknown> = { knowledge_base_id, query, cursor };
  if (limit) body.limit = limit;

  return imaRequest<IMASearchData>(
    '/openapi/wiki/v1/search_knowledge',
    config,
    { body }
  );
}

/**
 * 5. 创建媒体（获取COS上传凭证 - 文件上传第一步）
 * POST /openapi/wiki/v1/create_media
 * 返回 credential(COS凭证) + media_id
 */
export async function createMedia(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    media_type: number;
    title: string;
    file_size?: number;
    folder_id?: string;
  }
): Promise<{ success: boolean; data?: IMACreateMediaData; error?: string }> {
  const body: Record<string, unknown> = {
    knowledge_base_id: params.knowledge_base_id,
    media_type: params.media_type,
    title: params.title,
  };
  if (params.file_size) body.file_size = params.file_size;
  if (params.folder_id) body.folder_id = params.folder_id;

  return imaRequest<IMACreateMediaData>(
    '/openapi/wiki/v1/create_media',
    config,
    { body }
  );
}

/**
 * 6. 添加知识（完成文件上传/添加网页/关联笔记 - 文件上传最后一步）
 * POST /openapi/wiki/v1/add_knowledge
 * 
 * media_type 对应不同内容:
 * - 文件(1/3/4/5/7/9/11/12/13): 需要 media_id + file_info
 * - 网页(2): 需要 web_info.content_id = URL
 * - 笔记(11): 需要 note_info.content_id = note_id
 */
export async function addKnowledge(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    media_id?: string;
    title: string;
    media_type: number;
    folder_id?: string;
    file_info?: IMAFileInfo;
    web_info?: IMAContentInfo;
    note_info?: IMAContentInfo;
    session_info?: IMAContentInfo;
  }
): Promise<{ success: boolean; data?: { media_id: string }; error?: string }> {
  const body: Record<string, unknown> = {
    knowledge_base_id: params.knowledge_base_id,
    title: params.title,
    media_type: params.media_type,
  };
  if (params.media_id) body.media_id = params.media_id;
  if (params.folder_id) body.folder_id = params.folder_id;
  if (params.file_info) body.file_info = params.file_info;
  if (params.web_info) body.web_info = params.web_info;
  if (params.note_info) body.note_info = params.note_info;
  if (params.session_info) body.session_info = params.session_info;

  return imaRequest(
    '/openapi/wiki/v1/add_knowledge',
    config,
    { body }
  );
}

/**
 * 7. 获取可添加的知识库列表
 * POST /openapi/wiki/v1/get_addable_knowledge_base_list
 */
export async function getAddableKnowledgeBases(
  config: IMAConfig,
  params: {
    limit?: number;
    cursor?: string;
  } = {}
): Promise<{ success: boolean; data?: IMAAddableKnowledgeBaseData; error?: string }> {
  const { limit = 20, cursor = '' } = params;
  const body: Record<string, unknown> = { limit, cursor };

  return imaRequest(
    '/openapi/wiki/v1/get_addable_knowledge_base_list',
    config,
    { body }
  );
}

/**
 * 8. 检查文件名重复
 * POST /openapi/wiki/v1/check_repeated_names
 * 仅用于文件类型(media_type 1/3/4/5/7/9/11/12/13)，不用于网页/笔记
 */
export async function checkRepeatedNames(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    params_list: Array<{ name: string; media_type: number }>;
    folder_id?: string;
  }
): Promise<{ success: boolean; data?: IMARepeatedNameData; error?: string }> {
  const body: Record<string, unknown> = {
    knowledge_base_id: params.knowledge_base_id,
    params: params.params_list,
  };
  if (params.folder_id) body.folder_id = params.folder_id;

  return imaRequest(
    '/openapi/wiki/v1/check_repeated_names',
    config,
    { body }
  );
}

/**
 * 9. 导入URL到知识库
 * POST /openapi/wiki/v1/import_urls
 * 添加网页或微信公众号文章到知识库，支持批量导入（1-10个URL）
 * folder_id 必填，根目录传 knowledge_base_id
 */
export async function importUrls(
  config: IMAConfig,
  params: {
    knowledge_base_id: string;
    folder_id: string;
    urls: string[];
  }
): Promise<{ success: boolean; data?: IMAImportUrlData; error?: string }> {
  return imaRequest<IMAImportUrlData>(
    '/openapi/wiki/v1/import_urls',
    config,
    { body: params }
  );
}

// ==================== 笔记模块 API ====================

/**
 * 10. 获取笔记正文内容
 * POST /openapi/note/v1/get_doc_content
 * 
 * 用于笔记(media_type=11)的预览，需要 doc_id（即知识库中的 media_id）
 * 返回纯文本格式内容
 */
export async function getDocContent(
  config: IMAConfig,
  params: {
    doc_id: string;
    target_content_format?: number; // 0=纯文本（推荐），1=Markdown（不支持），2=JSON
  }
): Promise<{ success: boolean; data?: { content: string; doc_id: string }; error?: string }> {
  const body = {
    doc_id: params.doc_id,
    target_content_format: params.target_content_format ?? 0,  // 默认纯文本
  };

  return imaRequest(
    '/openapi/note/v1/get_doc_content',
    config,
    { body }
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
