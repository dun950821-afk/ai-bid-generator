/**
 * Coze Open API 客户端
 * 使用官方 Coze Open API (api.coze.cn) 进行知识库管理
 * 需要用户在设置中配置 Space ID 和 Personal Access Token (PAT)
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

const COZE_API_BASE = 'https://api.coze.cn';

/**
 * 从数据库获取 Coze 配置
 */
async function getCozeConfig(): Promise<{ spaceId: string; apiToken: string }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('system_settings')
    .select('key, value')
    .eq('category', 'coze')
    .in('key', ['space_id', 'api_token']);

  if (error) {
    throw new Error(`获取 Coze 配置失败: ${error.message}`);
  }

  const settingsMap = new Map((data || []).map((item: { key: string; value: string | null }) => [item.key, item.value]));
  const spaceId = settingsMap.get('space_id');
  const apiToken = settingsMap.get('api_token');

  if (!spaceId) {
    throw new Error('未配置 Coze Space ID，请在设置中配置');
  }
  if (!apiToken) {
    throw new Error('未配置 Coze Authorization Token，请在设置中配置');
  }

  return { spaceId, apiToken };
}

/**
 * 通用请求方法
 */
async function cozeRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {}
): Promise<T> {
  const { apiToken } = await getCozeConfig();
  const { method = 'GET', body, params } = options;

  let url = `${COZE_API_BASE}${path}`;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    'Agw-Js-Conv': 'str',
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  console.log(`[Coze API] ${method} ${url}`);

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Coze API] 请求失败: ${response.status}`, errorText);
    throw new Error(`Coze API 请求失败 (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    console.error(`[Coze API] 业务错误:`, data);
    throw new Error(data.msg || 'Coze API 业务错误');
  }

  return data as T;
}

// ============ 知识库 (Dataset) API ============

export interface CozeDataset {
  dataset_id: string;
  name: string;
  space_id: string;
  format_type: number;  // 0=文本, 1=表格, 2=图片
  doc_count: number;
  slice_count: number;
  hit_count: number;
  status: number;  // 0=启用, 1=禁用
  description: string;
  create_time: number;
  update_time: number;
  icon_url: string;
  icon_uri: string;
  creator_id: string;
  creator_name: string;
  can_edit: boolean;
  all_file_size: string;
  bot_used_count: number;
  file_list: string[];
  processing_file_list: string[];
  failed_file_list: string[];
  chunk_strategy: Record<string, unknown>;
}

export interface CozeDatasetListResponse {
  code: number;
  msg: string;
  data: {
    dataset_list: CozeDataset[];
    total_count: number;
    has_more: boolean;
    first_id: string;
    last_id: string;
  };
}

export interface CozeDatasetCreateResponse {
  code: number;
  msg: string;
  data: {
    dataset_id: string;
  };
}

/**
 * 获取知识库列表
 */
export async function listDatasets(
  page: number = 1,
  pageSize: number = 20
): Promise<{ datasets: CozeDataset[]; hasMore: boolean }> {
  const { spaceId } = await getCozeConfig();

  const data = await cozeRequest<CozeDatasetListResponse>('/v1/datasets', {
    params: {
      space_id: spaceId,
      page_size: String(pageSize),
      page: String(page),
    },
  });

  return {
    datasets: data.data?.dataset_list || [],
    hasMore: data.data?.has_more || false,
  };
}

/**
 * 创建知识库
 */
export async function createDataset(
  name: string,
  formatType: number = 0
): Promise<{ id: string; name: string }> {
  const { spaceId } = await getCozeConfig();

  const data = await cozeRequest<CozeDatasetCreateResponse>('/v1/datasets', {
    method: 'POST',
    body: {
      name,
      space_id: spaceId,
      format_type: formatType,
    },
  });

  return {
    id: data.data?.dataset_id || '',
    name: name,
  };
}

/**
 * 修改知识库信息
 */
export async function updateDataset(
  datasetId: string,
  name?: string,
  formatType?: number
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (name !== undefined) body.name = name;
  if (formatType !== undefined) body.format_type = formatType;

  await cozeRequest(`/v1/datasets/${datasetId}`, {
    method: 'PUT',
    body,
  });
}

/**
 * 删除知识库
 */
export async function deleteDataset(datasetId: string): Promise<void> {
  await cozeRequest(`/v1/datasets/${datasetId}`, {
    method: 'DELETE',
  });
}

// ============ 知识库文件 (Document) API ============

export interface CozeDocument {
  document_id: string;
  dataset_id?: string;
  name: string;
  source_type: number;  // 0=本地文件, 1=在线网页
  type: string;         // 文件格式后缀，如 pdf、txt、docx
  format_type: number;  // 0=文档, 1=表格, 2=照片
  char_count: number;
  slice_count: number;
  hit_count: number;
  size: number;
  status: number;       // 0=处理中, 1=处理完毕, 9=处理失败
  chunk_strategy: {
    chunk_type: number;
    separator?: string;
    max_tokens?: number;
    remove_extra_spaces?: boolean;
    remove_urls_emails?: boolean;
  };
  create_time: number;
  update_time: number;
  update_interval: number;
  update_type: number;
}

export interface CozeDocumentListResponse {
  code: number;
  msg: string;
  document_infos: CozeDocument[];
  total: number;
}

export interface CozeDocumentCreateResponse {
  code: number;
  msg: string;
  document_infos: Array<{
    document_id: string;
    name: string;
    status: number;
  }>;
}

export interface CozeDocumentDeleteResponse {
  code: number;
  msg: string;
}

/**
 * 获取知识库文件列表
 */
export async function listDocuments(
  datasetId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ documents: CozeDocument[]; hasMore: boolean }> {
  const data = await cozeRequest<CozeDocumentListResponse>('/open_api/knowledge/document/list', {
    method: 'POST',
    body: {
      dataset_id: datasetId,
      page: page,
      size: pageSize,
    },
  });

  return {
    documents: data.document_infos || [],
    hasMore: (data.document_infos?.length || 0) >= pageSize,
  };
}

/**
 * 创建知识库文件 - 文本内容
 */
export async function createDocumentByText(
  datasetId: string,
  name: string,
  content: string,
  chunkStrategy?: {
    chunk_type?: number;  // 0=自动分段, 1=自定义
    separator?: string;
    max_tokens?: number;
  }
): Promise<{ id: string; name: string }[]> {
  const body: Record<string, unknown> = {
    dataset_id: datasetId,
    document_bases: [
      {
        name,
        source_info: {
          file_base64: Buffer.from(content).toString('base64'),
          file_type: 'txt',
        },
      },
    ],
  };

  if (chunkStrategy) {
    body.chunk_strategy = {
      chunk_type: chunkStrategy.chunk_type ?? 0,
      ...(chunkStrategy.chunk_type === 1
        ? {
            separator: chunkStrategy.separator || '\\n',
            max_tokens: chunkStrategy.max_tokens || 800,
          }
        : {}),
    };
  }

  const data = await cozeRequest<CozeDocumentCreateResponse>(
    '/open_api/knowledge/document/create',
    {
      method: 'POST',
      body,
    }
  );

  return (data.document_infos || []).map((doc) => ({
    id: doc.document_id,
    name: doc.name,
  }));
}

/**
 * 创建知识库文件 - 在线网页
 */
export async function createDocumentByUrl(
  datasetId: string,
  name: string,
  url: string,
  chunkStrategy?: {
    chunk_type?: number;
    separator?: string;
    max_tokens?: number;
  }
): Promise<{ id: string; name: string }[]> {
  const body: Record<string, unknown> = {
    dataset_id: datasetId,
    document_bases: [
      {
        name,
        source_info: {
          web_url: url,
        },
      },
    ],
  };

  if (chunkStrategy) {
    body.chunk_strategy = {
      chunk_type: chunkStrategy.chunk_type ?? 0,
      ...(chunkStrategy.chunk_type === 1
        ? {
            separator: chunkStrategy.separator || '\\n',
            max_tokens: chunkStrategy.max_tokens || 800,
          }
        : {}),
    };
  }

  const data = await cozeRequest<CozeDocumentCreateResponse>(
    '/open_api/knowledge/document/create',
    {
      method: 'POST',
      body,
    }
  );

  return (data.document_infos || []).map((doc) => ({
    id: doc.document_id,
    name: doc.name,
  }));
}

/**
 * 创建知识库文件 - Base64 文件上传
 */
export async function createDocumentByFile(
  datasetId: string,
  fileName: string,
  fileBase64: string,
  fileType: string,
  chunkStrategy?: {
    chunk_type?: number;
    separator?: string;
    max_tokens?: number;
  }
): Promise<{ id: string; name: string }[]> {
  const body: Record<string, unknown> = {
    dataset_id: datasetId,
    document_bases: [
      {
        name: fileName,
        source_info: {
          file_base64: fileBase64,
          file_type: fileType,
        },
      },
    ],
  };

  if (chunkStrategy) {
    body.chunk_strategy = {
      chunk_type: chunkStrategy.chunk_type ?? 0,
      ...(chunkStrategy.chunk_type === 1
        ? {
            separator: chunkStrategy.separator || '\\n',
            max_tokens: chunkStrategy.max_tokens || 800,
          }
        : {}),
    };
  }

  const data = await cozeRequest<CozeDocumentCreateResponse>(
    '/open_api/knowledge/document/create',
    {
      method: 'POST',
      body,
    }
  );

  return (data.document_infos || []).map((doc) => ({
    id: doc.document_id,
    name: doc.name,
  }));
}

/**
 * 修改知识库文件
 */
export async function updateDocument(
  datasetId: string,
  documentId: string,
  name?: string,
  chunkStrategy?: {
    chunk_type?: number;
    separator?: string;
    max_tokens?: number;
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    dataset_id: datasetId,
    document_id: documentId,
  };

  if (name !== undefined) body.name = name;
  if (chunkStrategy) {
    body.chunk_strategy = {
      chunk_type: chunkStrategy.chunk_type ?? 0,
      ...(chunkStrategy.chunk_type === 1
        ? {
            separator: chunkStrategy.separator || '\\n',
            max_tokens: chunkStrategy.max_tokens || 800,
          }
        : {}),
    };
  }

  await cozeRequest('/open_api/knowledge/document/update', {
    method: 'POST',
    body,
  });
}

/**
 * 删除知识库文件（支持批量）
 */
export async function deleteDocuments(
  datasetId: string,
  documentIds: string[]
): Promise<void> {
  await cozeRequest<CozeDocumentDeleteResponse>('/open_api/knowledge/document/delete', {
    method: 'POST',
    body: {
      dataset_id: datasetId,
      document_ids: documentIds,
    },
  });
}

// ============ 上传进度 API ============

export interface CozeProcessInfo {
  document_id: string;
  progress: number;  // 0-100
  status: number;    // 0=处理中, 1=处理完毕, 9=处理失败
  remaining_time: number;  // 预计剩余秒数
}

export interface CozeProcessResponse {
  code: number;
  msg: string;
  data: CozeProcessInfo[];
}

/**
 * 获取文件上传进度
 */
export async function getDatasetProcess(
  datasetId: string,
  documentIds?: string[]
): Promise<CozeProcessInfo[]> {
  const body: Record<string, unknown> = {
    dataset_id: datasetId,
  };

  if (documentIds && documentIds.length > 0) {
    body.document_ids = documentIds;
  }

  const data = await cozeRequest<CozeProcessResponse>(
    `/v1/datasets/${datasetId}/process`,
    {
      method: 'POST',
      body,
    }
  );

  return data.data || [];
}

// ============ 连接测试 ============
export async function testCozeApiConnection(): Promise<{
  success: boolean;
  message: string;
  datasetCount?: number;
}> {
  try {
    const result = await listDatasets(1, 1);
    return {
      success: true,
      message: `连接成功，当前空间有 ${result.datasets.length} 个知识库`,
      datasetCount: result.datasets.length,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '连接失败',
    };
  }
}
