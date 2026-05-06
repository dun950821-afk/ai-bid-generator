/**
 * IMA 知识库服务
 * 封装 IMA 知识库 API 的服务端调用
 */

const IMA_API_BASE = 'https://ima.qq.com/agent-interface';

export interface IMAConfig {
  apiKey: string;
}

export interface IMAListKnowledgeBasesResponse {
  code: number;
  msg: string;
  data: {
    list: Array<{
      kb_id: string;
      kb_name: string;
      kb_desc: string;
      doc_count: number;
      create_time: number;
      update_time: number;
    }>;
    total: number;
    page: number;
    page_size: number;
  };
}

export interface IMAGetKnowledgeBaseResponse {
  code: number;
  msg: string;
  data: {
    kb_id: string;
    kb_name: string;
    kb_desc: string;
    doc_count: number;
    create_time: number;
    update_time: number;
    config: {
      chunk_size: number;
      search_top_k: number;
      score_threshold: number;
    };
  };
}

export interface IMASearchResponse {
  code: number;
  msg: string;
  data: {
    query: string;
    results: Array<{
      doc_id: string;
      doc_name: string;
      chunk_id: string;
      chunk_content: string;
      score: number;
      position: {
        start: number;
        end: number;
      };
    }>;
    total: number;
  };
}

export interface IMAUploadResponse {
  code: number;
  msg: string;
  data: {
    doc_id: string;
    doc_name: string;
    status: string;
  };
}

export interface IMADocumentStatusResponse {
  code: number;
  msg: string;
  data: {
    doc_id: string;
    doc_name: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    error_msg?: string;
    chunk_count?: number;
  };
}

/**
 * 验证 IMA 配置
 */
export async function validateConfig(config: IMAConfig): Promise<{ valid: boolean; error?: string }> {
  if (!config.apiKey || config.apiKey.trim() === '') {
    return { valid: false, error: 'API Key 不能为空' };
  }
  
  try {
    const response = await fetch(`${IMA_API_BASE}/v1/knowledge_bases/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      return { valid: true };
    } else {
      const data = await response.json();
      return { valid: false, error: data.msg || '配置验证失败' };
    }
  } catch (error) {
    return { valid: false, error: '无法连接到 IMA 服务' };
  }
}

/**
 * 获取知识库列表
 */
export async function listKnowledgeBases(
  config: IMAConfig,
  page: number = 1,
  pageSize: number = 20
): Promise<{ success: boolean; data?: IMAListKnowledgeBasesResponse['data']; error?: string }> {
  try {
    const response = await fetch(
      `${IMA_API_BASE}/v1/knowledge_bases/list?page=${page}&page_size=${pageSize}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const data: IMAListKnowledgeBasesResponse = await response.json();
    
    if (data.code === 0) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.msg || '获取知识库列表失败' };
    }
  } catch (error) {
    return { success: false, error: '网络请求失败' };
  }
}

/**
 * 获取知识库详情
 */
export async function getKnowledgeBase(
  knowledgeBaseId: string,
  config: IMAConfig
): Promise<{ success: boolean; data?: IMAGetKnowledgeBaseResponse['data']; error?: string }> {
  try {
    const response = await fetch(
      `${IMA_API_BASE}/v1/knowledge_bases/${knowledgeBaseId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const data: IMAGetKnowledgeBaseResponse = await response.json();
    
    if (data.code === 0) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.msg || '获取知识库详情失败' };
    }
  } catch (error) {
    return { success: false, error: '网络请求失败' };
  }
}

/**
 * 搜索知识库内容
 */
export async function searchKnowledgeBase(
  knowledgeBaseId: string,
  query: string,
  config: IMAConfig,
  topK: number = 5
): Promise<{ success: boolean; data?: IMASearchResponse['data']; error?: string }> {
  try {
    const response = await fetch(
      `${IMA_API_BASE}/v1/knowledge_bases/${knowledgeBaseId}/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          top_k: topK,
        }),
      }
    );
    
    const data: IMASearchResponse = await response.json();
    
    if (data.code === 0) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.msg || '搜索知识库失败' };
    }
  } catch (error) {
    return { success: false, error: '网络请求失败' };
  }
}

/**
 * 上传文档到知识库
 */
export async function uploadDocument(
  knowledgeBaseId: string,
  fileUrl: string,
  config: IMAConfig
): Promise<{ success: boolean; data?: IMAUploadResponse['data']; error?: string }> {
  try {
    const response = await fetch(
      `${IMA_API_BASE}/v1/knowledge_bases/${knowledgeBaseId}/documents`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_url: fileUrl,
        }),
      }
    );
    
    const data: IMAUploadResponse = await response.json();
    
    if (data.code === 0) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.msg || '上传文档失败' };
    }
  } catch (error) {
    return { success: false, error: '网络请求失败' };
  }
}

/**
 * 获取文档状态
 */
export async function getDocumentStatus(
  knowledgeBaseId: string,
  documentId: string,
  config: IMAConfig
): Promise<{ success: boolean; data?: IMADocumentStatusResponse['data']; error?: string }> {
  try {
    const response = await fetch(
      `${IMA_API_BASE}/v1/knowledge_bases/${knowledgeBaseId}/documents/${documentId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const data: IMADocumentStatusResponse = await response.json();
    
    if (data.code === 0) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.msg || '获取文档状态失败' };
    }
  } catch (error) {
    return { success: false, error: '网络请求失败' };
  }
}

/**
 * 删除文档
 */
export async function deleteDocument(
  knowledgeBaseId: string,
  documentId: string,
  config: IMAConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${IMA_API_BASE}/v1/knowledge_bases/${knowledgeBaseId}/documents/${documentId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const data = await response.json();
    
    if (data.code === 0) {
      return { success: true };
    } else {
      return { success: false, error: data.msg || '删除文档失败' };
    }
  } catch (error) {
    return { success: false, error: '网络请求失败' };
  }
}

/**
 * IMA 网关类 - 用于前端直接调用
 */
export class IMAGateway {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  private get config(): IMAConfig {
    return { apiKey: this.apiKey };
  }
  
  async listKnowledgeBases(page: number = 1, pageSize: number = 20) {
    return listKnowledgeBases(this.config, page, pageSize);
  }
  
  async getKnowledgeBase(knowledgeBaseId: string) {
    return getKnowledgeBase(knowledgeBaseId, this.config);
  }
  
  async search(knowledgeBaseId: string, query: string, topK: number = 5) {
    return searchKnowledgeBase(knowledgeBaseId, query, this.config, topK);
  }
  
  async uploadDocument(knowledgeBaseId: string, fileUrl: string) {
    return uploadDocument(knowledgeBaseId, fileUrl, this.config);
  }
  
  async getDocumentStatus(knowledgeBaseId: string, documentId: string) {
    return getDocumentStatus(knowledgeBaseId, documentId, this.config);
  }
  
  async deleteDocument(knowledgeBaseId: string, documentId: string) {
    return deleteDocument(knowledgeBaseId, documentId, this.config);
  }
  
  async validateConfig() {
    return validateConfig(this.config);
  }
}
