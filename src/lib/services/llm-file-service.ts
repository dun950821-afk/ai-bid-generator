/**
 * LLM文件管理服务
 * 用于管理阿里云百炼平台的文件上传和使用
 * 
 * 核心功能：
 * 1. 上传文件到百炼平台，获取 file_id
 * 2. 检查文件状态（是否存在、是否可用）
 * 3. 使用 file_id 进行文档分析
 * 4. 自动恢复：文件不存在时重新上传
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface LLMFile {
  id: string;                    // 百炼平台返回的 file_id
  filename: string;              // 原始文件名
  bytes: number;                 // 文件大小
  createdAt: string;             // 上传时间
  status: 'processed' | 'processing' | 'error';  // 文件状态
  purpose: string;               // 用途（file-extract）
  sourceUrl?: string;            // 原始文件URL（用于重新上传）
}

export interface LLMFileConfig {
  apiUrl: string;
  apiKey: string;
}

/**
 * 获取LLM配置
 */
async function getLLMConfig(): Promise<LLMFileConfig> {
  try {
    const client = getSupabaseClient();
    const { data: settings } = await client
      .from('system_settings')
      .select('key, value')
      .eq('category', 'llm');

    const configMap = new Map(settings?.map(s => [s.key, s.value]));
    
    return {
      apiUrl: configMap.get('api_url') || process.env.LLM_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: configMap.get('api_key') || process.env.LLM_API_KEY || '',
    };
  } catch (error) {
    console.error('[LLMFile] 获取配置失败:', error);
    return {
      apiUrl: process.env.LLM_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: process.env.LLM_API_KEY || '',
    };
  }
}

/**
 * LLM文件管理服务
 */
export class LLMFileService {
  private config: LLMFileConfig | null = null;
  private maxRetries: number = 3;
  private pollInterval: number = 2000; // 2秒轮询一次

  /**
   * 初始化配置
   */
  private async initConfig(): Promise<void> {
    if (!this.config) {
      this.config = await getLLMConfig();
    }
  }

  /**
   * 上传文件到百炼平台
   * @param fileUrl 文件URL（从对象存储下载）
   * @param filename 文件名
   * @returns LLMFile 文件信息
   */
  async uploadFile(fileUrl: string, filename: string): Promise<LLMFile> {
    await this.initConfig();
    
    if (!this.config?.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    console.log(`[LLMFile] 开始上传文件: ${filename}`);

    // 1. 从对象存储下载文件
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`下载文件失败: ${fileResponse.status}`);
    }
    
    const fileBlob = await fileResponse.blob();
    const fileArrayBuffer = await fileBlob.arrayBuffer();
    
    console.log(`[LLMFile] 文件大小: ${fileArrayBuffer.byteLength} bytes`);

    // 2. 上传到百炼平台
    const formData = new FormData();
    const file = new File([fileBlob], filename, { type: 'application/pdf' });
    formData.append('file', file);
    formData.append('purpose', 'file-extract');

    const uploadResponse = await fetch(`${this.config.apiUrl}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[LLMFile] 上传失败:', errorText);
      throw new Error(`上传文件到百炼失败: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.id;
    
    console.log(`[LLMFile] 文件上传成功, file_id: ${fileId}`);

    // 3. 等待文件处理完成
    const processedFile = await this.waitForProcessing(fileId);
    
    return {
      id: processedFile.id,
      filename: filename,
      bytes: processedFile.bytes || fileArrayBuffer.byteLength,
      createdAt: new Date().toISOString(),
      status: 'processed',
      purpose: 'file-extract',
      sourceUrl: fileUrl,
    };
  }

  /**
   * 上传文件（使用Buffer）
   */
  async uploadFileFromBuffer(fileBuffer: Buffer, filename: string): Promise<LLMFile> {
    await this.initConfig();
    
    if (!this.config?.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    console.log(`[LLMFile] 开始上传文件(Buffer): ${filename}, 大小: ${fileBuffer.length} bytes`);

    // 创建FormData - 直接使用Buffer的底层ArrayBuffer
    const formData = new FormData();
    // 创建一个新的ArrayBuffer副本，避免类型问题
    const arrayBuffer = new ArrayBuffer(fileBuffer.length);
    new Uint8Array(arrayBuffer).set(fileBuffer);
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const file = new File([blob], filename, { type: 'application/pdf' });
    formData.append('file', file);
    formData.append('purpose', 'file-extract');

    const uploadResponse = await fetch(`${this.config.apiUrl}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[LLMFile] 上传失败:', errorText);
      throw new Error(`上传文件到百炼失败: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.id;
    
    console.log(`[LLMFile] 文件上传成功, file_id: ${fileId}`);

    // 等待文件处理完成
    const processedFile = await this.waitForProcessing(fileId);
    
    return {
      id: processedFile.id,
      filename: filename,
      bytes: processedFile.bytes || fileBuffer.length,
      createdAt: new Date().toISOString(),
      status: 'processed',
      purpose: 'file-extract',
    };
  }

  /**
   * 等待文件处理完成
   */
  private async waitForProcessing(fileId: string): Promise<any> {
    await this.initConfig();
    
    console.log(`[LLMFile] 等待文件处理: ${fileId}`);
    
    let attempts = 0;
    const maxAttempts = 60; // 最多等待2分钟

    while (attempts < maxAttempts) {
      const fileInfo = await this.getFileInfo(fileId);
      
      if (fileInfo.status === 'processed') {
        console.log(`[LLMFile] 文件处理完成: ${fileId}`);
        return fileInfo;
      }
      
      if (fileInfo.status === 'error') {
        throw new Error(`文件处理失败: ${fileId}`);
      }

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      attempts++;
    }

    throw new Error(`文件处理超时: ${fileId}`);
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(fileId: string): Promise<any> {
    await this.initConfig();
    
    const response = await fetch(`${this.config!.apiUrl}/files/${fileId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config!.apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { status: 'not_found' };
      }
      throw new Error(`获取文件信息失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 检查文件是否存在且可用
   */
  async checkFileAvailable(fileId: string): Promise<boolean> {
    try {
      const fileInfo = await this.getFileInfo(fileId);
      return fileInfo.status === 'processed';
    } catch (error) {
      console.error('[LLMFile] 检查文件状态失败:', error);
      return false;
    }
  }

  /**
   * 使用文件ID进行分析
   * @param fileId 文件ID
   * @param task 分析任务描述
   * @param model 使用的模型
   * @returns 分析结果
   */
  async analyzeWithFileId(
    fileId: string,
    task: string,
    model: string = 'qwen3.5-plus'
  ): Promise<any> {
    await this.initConfig();
    
    if (!this.config?.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    console.log(`[LLMFile] 使用 file_id 进行分析: ${fileId}`);
    console.log(`[LLMFile] 任务: ${task.substring(0, 100)}...`);

    const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的招标文档分析专家。请基于上传的文档内容准确回答用户问题，并以JSON格式输出。不要包含任何markdown标记或额外说明。',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: task },
              { type: 'file', file_id: fileId }  // 使用 file_id 引用文件
            ]
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }  // 强制JSON输出
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LLMFile] 分析请求失败:', errorText);
      
      // 如果是文件不存在错误，抛出特殊错误
      if (errorText.includes('file') && errorText.includes('not found')) {
        throw new Error('FILE_NOT_FOUND');
      }
      
      throw new Error(`分析请求失败: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log(`[LLMFile] 分析完成，响应长度: ${content.length}`);
    
    // 尝试解析JSON
    try {
      return JSON.parse(content);
    } catch {
      // 尝试提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('无法解析LLM响应为JSON');
    }
  }

  /**
   * 智能分析：自动检查文件可用性，不存在则重新上传
   * @param fileId 文件ID（可为空）
   * @param sourceUrl 源文件URL
   * @param filename 文件名
   * @param task 分析任务
   * @returns 分析结果和更新后的文件信息
   */
  async smartAnalyze(
    fileId: string | null,
    sourceUrl: string,
    filename: string,
    task: string
  ): Promise<{ result: any; fileInfo: LLMFile; reuploaded: boolean }> {
    let currentFileId = fileId;
    let fileInfo: LLMFile | null = null;
    let reuploaded = false;

    // 检查文件是否存在
    if (currentFileId) {
      const available = await this.checkFileAvailable(currentFileId);
      if (!available) {
        console.log(`[LLMFile] 文件不存在或不可用，重新上传: ${filename}`);
        currentFileId = null;
      }
    }

    // 需要上传文件
    if (!currentFileId) {
      fileInfo = await this.uploadFile(sourceUrl, filename);
      currentFileId = fileInfo.id;
      reuploaded = true;
    } else {
      // 构造文件信息
      fileInfo = {
        id: currentFileId,
        filename: filename,
        bytes: 0,
        createdAt: new Date().toISOString(),
        status: 'processed',
        purpose: 'file-extract',
        sourceUrl: sourceUrl,
      };
    }

    // 执行分析
    const result = await this.analyzeWithFileId(currentFileId, task);

    return {
      result,
      fileInfo,
      reuploaded,
    };
  }

  /**
   * 删除文件
   */
  async deleteFile(fileId: string): Promise<boolean> {
    await this.initConfig();
    
    try {
      const response = await fetch(`${this.config!.apiUrl}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config!.apiKey}`,
        },
      });

      if (response.ok) {
        console.log(`[LLMFile] 文件已删除: ${fileId}`);
        return true;
      }
      
      console.warn(`[LLMFile] 删除文件失败: ${response.status}`);
      return false;
    } catch (error) {
      console.error('[LLMFile] 删除文件异常:', error);
      return false;
    }
  }

  /**
   * 多文件联合分析（用于章节生成）
   * 同时引用招标文件和多个知识库文档
   * @param fileIds 文件ID列表
   * @param task 分析任务
   * @param model 使用的模型
   * @returns 分析结果
   */
  async analyzeWithMultipleFiles(
    fileIds: Array<{ id: string; name: string; type: 'tender' | 'knowledge' }>,
    task: string,
    model: string = 'qwen3.5-plus'
  ): Promise<any> {
    await this.initConfig();
    
    if (!this.config?.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    console.log(`[LLMFile] 多文件分析，文件数: ${fileIds.length}`);
    fileIds.forEach(f => console.log(`  - ${f.name} (${f.type}): ${f.id}`));
    console.log(`[LLMFile] 任务: ${task.substring(0, 100)}...`);

    // 构建消息内容 - 包含文本和多个文件引用
    const userContent: any[] = [
      { type: 'text', text: task }
    ];

    // 添加文件引用
    for (const file of fileIds) {
      userContent.push({
        type: 'file',
        file_id: file.id,
        // 某些API可能不支持file_name，但加上也无妨
        file_name: file.name
      });
    }

    const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `你是一位专业的标书编写专家。请根据提供的多份文档（招标文件和知识库文档）生成高质量的标书章节内容。

要求：
1. 严格按照招标文件的评分细则响应
2. 从知识库文档中引用相关的资质证书、案例等支撑材料
3. 确保响应所有评分项要求
4. 内容专业、准确、有说服力
5. 使用Markdown格式输出
6. 引用知识库内容时，标注来源【引用:文档名】`,
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        temperature: 0.7,
        max_tokens: 8192
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LLMFile] 多文件分析请求失败:', errorText);
      
      // 如果是文件不存在错误，抛出特殊错误
      if (errorText.includes('file') && errorText.includes('not found')) {
        throw new Error('FILE_NOT_FOUND');
      }
      
      throw new Error(`分析请求失败: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log(`[LLMFile] 多文件分析完成，响应长度: ${content.length}`);
    
    return content;
  }

  /**
   * 多文件联合分析（流式输出）
   * 用于章节生成的实时展示
   */
  async *streamAnalyzeWithMultipleFiles(
    fileIds: Array<{ id: string; name: string; type: 'tender' | 'knowledge' }>,
    task: string,
    model: string = 'qwen3.5-plus'
  ): AsyncGenerator<string> {
    await this.initConfig();
    
    if (!this.config?.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    console.log(`[LLMFile] 多文件流式分析，文件数: ${fileIds.length}`);

    // 构建消息内容
    const userContent: any[] = [
      { type: 'text', text: task }
    ];

    for (const file of fileIds) {
      userContent.push({
        type: 'file',
        file_id: file.id,
        file_name: file.name
      });
    }

    const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `你是一位专业的标书编写专家。请根据提供的多份文档生成高质量的标书章节内容。

要求：
1. 严格按照招标文件的评分细则响应
2. 从知识库文档中引用相关的资质证书、案例等
3. 确保响应所有评分项要求
4. 内容专业、准确、有说服力
5. 使用Markdown格式输出
6. 引用时标注来源【引用:文档名】`,
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        temperature: 0.7,
        max_tokens: 8192,
        stream: true
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`流式分析请求失败: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              yield content;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  }

  /**
   * 智能多文件分析：自动检查文件可用性
   */
  async smartMultiFileAnalyze(
    fileIds: Array<{ id: string; name: string; type: 'tender' | 'knowledge'; sourceUrl?: string }>,
    task: string
  ): Promise<{ result: string; reuploadedFiles: string[] }> {
    const reuploadedFiles: string[] = [];
    const validFileIds: Array<{ id: string; name: string; type: 'tender' | 'knowledge' }> = [];

    // 检查每个文件的可用性
    for (const file of fileIds) {
      const available = await this.checkFileAvailable(file.id);
      
      if (!available && file.sourceUrl) {
        console.log(`[LLMFile] 文件 ${file.name} 不可用，重新上传...`);
        const newFileInfo = await this.uploadFile(file.sourceUrl, file.name);
        validFileIds.push({ id: newFileInfo.id, name: file.name, type: file.type });
        reuploadedFiles.push(file.name);
      } else if (available) {
        validFileIds.push({ id: file.id, name: file.name, type: file.type });
      } else {
        console.warn(`[LLMFile] 文件 ${file.name} 不可用且无sourceUrl，跳过`);
      }
    }

    if (validFileIds.length === 0) {
      throw new Error('没有可用的文件进行多文件分析');
    }

    const result = await this.analyzeWithMultipleFiles(validFileIds, task);

    return { result, reuploadedFiles };
  }
}

// 单例实例
let llmFileServiceInstance: LLMFileService | null = null;

/**
 * 获取LLM文件服务实例
 */
export function getLLMFileService(): LLMFileService {
  if (!llmFileServiceInstance) {
    llmFileServiceInstance = new LLMFileService();
  }
  return llmFileServiceInstance;
}

/**
 * 创建新的LLM文件服务实例
 */
export function createLLMFileService(): LLMFileService {
  return new LLMFileService();
}
