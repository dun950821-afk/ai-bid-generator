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
import { parseJSON } from '@/lib/utils/json-parser';

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
  model: string;
}

/**
 * 获取LLM配置
 * 注意：此服务专门用于文档处理，优先使用 doc_extract_model 配置
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
      // 文档提取优先使用 doc_extract_model，否则使用 model，默认 qwen-long
      model: configMap.get('doc_extract_model') || configMap.get('model') || 'qwen-long',
    };
  } catch (error) {
    console.error('[LLMFile] 获取配置失败:', error);
    return {
      apiUrl: process.env.LLM_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: process.env.LLM_API_KEY || '',
      model: 'qwen-long',
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
   * 根据文件扩展名获取 MIME 类型
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'md': 'text/markdown',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
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
    // 根据文件扩展名设置正确的 MIME 类型
    const mimeType = this.getMimeType(filename);
    const file = new File([fileBlob], filename, { type: mimeType });
    formData.append('file', file);
    formData.append('purpose', 'file-extract');  // 必须是 file-extract，才能获得 file-fe-xxxx 格式的ID

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
    // 根据文件扩展名设置正确的 MIME 类型
    const mimeType = this.getMimeType(filename);
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const file = new File([blob], filename, { type: mimeType });
    formData.append('file', file);
    formData.append('purpose', 'file-extract');  // 必须是 file-extract，才能获得 file-fe-xxxx 格式的ID

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
   * 根据百炼官方文档，正确的方式是：
   * 1. 检查文件状态是否为 processed
   * 2. 使用 Qwen-Long 模型发送一个简单的查询来验证文件可用性
   */
  async checkFileAvailable(fileId: string): Promise<boolean> {
    console.log(`[LLMFile] ========== 开始检查文件可用性 ==========`);
    console.log(`[LLMFile] fileId: ${fileId}`);
    
    try {
      // 第一步：检查文件状态
      console.log(`[LLMFile] 步骤1: 获取文件信息...`);
      const fileInfo = await this.getFileInfo(fileId);
      console.log(`[LLMFile] 文件信息: status=${fileInfo.status}, filename=${fileInfo.filename}, bytes=${fileInfo.bytes}`);
      
      if (fileInfo.status !== 'processed') {
        console.log(`[LLMFile] ❌ 文件状态不是 processed: ${fileInfo.status}`);
        return false;
      }
      
      // 第二步：通过 Qwen-Long 验证文件可用性
      try {
        await this.initConfig();
        console.log(`[LLMFile] 步骤2: 调用 Qwen-Long 验证文件可用性...`);
        console.log(`[LLMFile] API URL: ${this.config!.apiUrl}`);
        
        const testResponse = await fetch(
          `${this.config!.apiUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config!.apiKey}`,
            },
            body: JSON.stringify({
              model: this.config!.model,
              messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'system', content: `fileid://${fileId}` },
                { role: 'user', content: '这个文档有多少个字？' }
              ],
              stream: false,
            }),
          }
        );
        
        console.log(`[LLMFile] Qwen-Long 响应状态码: ${testResponse.status} ${testResponse.statusText}`);
        
        if (testResponse.status === 404 || testResponse.status === 400) {
          const errorText = await testResponse.text();
          console.log(`[LLMFile] ❌ 文件验证失败(${testResponse.status}): ${errorText.substring(0, 500)}`);
          return false;
        }
        
        // 检查是否有错误响应体
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.log(`[LLMFile] ⚠️ API返回非成功状态(${testResponse.status}): ${errorText.substring(0, 500)}`);
          return false;
        }
        
        // 成功响应
        const responseText = await testResponse.text();
        console.log(`[LLMFile] ✅ 文件可用! 响应预览: ${responseText.substring(0, 200)}...`);
        return true;
        
      } catch (extractCheckError: any) {
        console.error('[LLMFile] ❌ Qwen-Long 检查异常:', {
          errorType: extractCheckError.name,
          errorMessage: extractCheckError.message,
          errorStack: extractCheckError.stack?.substring(0, 300),
        });
        return false;
      }
    } catch (error: any) {
      console.error('[LLMFile] ❌ 获取文件信息失败:', {
        fileId,
        errorType: error.name,
        errorMessage: error.message,
      });
      return false;
    }
  }

  /**
   * 使用 Qwen-Long 模型提取文档文本
   * 根据百炼官方文档，正确的方式是：
   * 1. 在 system message 中使用 fileid://{FILE_ID} 引用文件
   * 2. 调用 Qwen-Long 模型获取文档内容
   * @param fileId 上传后获取的file_id
   * @param maxRetries 最大重试次数（针对新上传文件可能需要等待处理）
   * @returns 提取的文档全文
   */
  async extractDocumentText(fileId: string, maxRetries: number = 5): Promise<string> {
    await this.initConfig();
    
    if (!this.config?.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    console.log(`[LLMFile] 使用Qwen-Long模型提取文档文本, fileId: ${fileId}`);

    let lastError: Error | null = null;
    
    // 重试机制：新上传的文件可能需要等待解析完成
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 调用配置的模型，通过 fileid:// 引用文件
        const response = await fetch(
          `${this.config!.apiUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config!.apiKey}`,
            },
            body: JSON.stringify({
              model: this.config!.model,
              messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'system', content: `fileid://${fileId}` },
                { role: 'user', content: '请完整输出这份文档的全部文本内容，保持原有的格式和结构。如果文档内容较长，请继续输出直到完成。' }
              ],
              stream: false,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLMFile] 文档提取失败(尝试 ${attempt}/${maxRetries}):`, errorText);
          
          // 如果是 400 错误，可能是文件还在解析中
          if (response.status === 400 || response.status === 404) {
            lastError = new Error(`文档提取失败: ${response.status}`);
            
            if (attempt < maxRetries) {
              const waitTime = Math.min(3000 * attempt, 15000); // 递增等待时间，最长15秒
              console.log(`[LLMFile] 文件可能正在处理中，等待 ${waitTime/1000} 秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          } else {
            // 其他错误直接抛出
            throw new Error(`文档提取失败: ${response.status} - ${errorText}`);
          }
        } else {
          const data = await response.json();
          const docText = data.choices?.[0]?.message?.content || '';
          
          if (docText && docText.trim().length > 0) {
            console.log(`[LLMFile] 文档提取成功, 文本长度: ${docText.length}`);
            return docText;
          } else {
            console.log(`[LLMFile] 提取结果为空，可能文件还在解析中...`);
            if (attempt < maxRetries) {
              const waitTime = Math.min(3000 * attempt, 15000);
              console.log(`[LLMFile] 等待 ${waitTime/1000} 秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
            throw new Error('文档提取结果为空');
          }
        }
      } catch (error: any) {
        console.error(`[LLMFile] 提取异常(尝试 ${attempt}/${maxRetries}):`, error.message);
        
        if (error.message?.includes('400') || error.message?.includes('404') || error.message?.includes('parsing')) {
          lastError = error;
          if (attempt < maxRetries) {
            const waitTime = Math.min(3000 * attempt, 15000);
            console.log(`[LLMFile] 等待 ${waitTime/1000} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        } else {
          throw error;
        }
      }
    }
    
    // 所有重试都失败
    throw lastError || new Error('文档提取失败: 重试次数已用完');
  }

  /**
   * 使用文件ID进行分析（使用document-extractor提取文本后调用LLM）
   * @param fileId 文件ID
   * @param task 分析任务描述
   * @param model 使用的模型
   * @returns 分析结果
   */
  async analyzeWithFileId(
    fileId: string,
    task: string,
    model: string = 'qwen-turbo'
  ): Promise<any> {
    await this.initConfig();
    
    if (!this.config?.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    console.log(`[LLMFile] 开始分析文档, fileId: ${fileId}, model: ${model}`);

    // 第一步：提取文档文本
    let docText: string;
    try {
      docText = await this.extractDocumentText(fileId);
    } catch (extractError) {
      console.error('[LLMFile] 文档提取失败:', extractError);
      throw new Error(`文档提取失败: ${extractError instanceof Error ? extractError.message : '未知错误'}`);
    }

    if (!docText || docText.trim().length === 0) {
      console.error('[LLMFile] 提取的文档文本为空');
      throw new Error('文档内容为空');
    }

    // 第二步：将文本和任务一起发送给LLM
    console.log(`[LLMFile] 文档文本长度: ${docText.length}, 开始调用LLM...`);

    // 设置超时控制器 - 5分钟超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('[LLMFile] 请求超时，中止请求');
      controller.abort();
    }, 300000); // 5分钟

    try {
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
              content: '你是一个专业的招标文档分析专家。请基于提供的文档内容准确回答用户问题，并以JSON格式输出。不要包含任何markdown标记或额外说明。',
            },
            {
              role: 'user',
              content: `${task}\n\n## 文档内容\n\n${docText}`
            }
          ],
          temperature: 0.3,
          max_tokens: 32768,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LLMFile] LLM请求失败:', errorText);
        
        throw new Error(`LLM请求失败: ${response.status}`);
      }

      // 安全解析响应
      let data: any;
      try {
        const responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          console.error('[LLMFile] API返回空响应');
          return {};
        }
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[LLMFile] 解析API响应失败:', parseError);
        return {};
      }
      
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log(`[LLMFile] 分析完成，响应长度: ${content.length}`);
      
      // 使用增强型JSON解析器
      const result = parseJSON(content, { allowTruncated: true, verbose: true });
      
      if (result.success) {
        console.log(`[LLMFile] ✓ JSON解析成功${result.repaired ? '(已自动修复)' : ''}`);
        return result.data;
      }
      
      console.error(`[LLMFile] ✗ JSON解析失败:`, result.error);
      return {};
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error('[LLMFile] 请求超时（5分钟）');
        throw new Error('LLM请求超时，请稍后重试');
      }
      
      console.error('[LLMFile] 分析请求异常:', error);
      throw error;
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
