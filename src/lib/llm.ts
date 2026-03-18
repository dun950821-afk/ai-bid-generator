/**
 * LLM服务模块
 * 封装大语言模型调用
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface LLMConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  enableThinking?: boolean;
  thinkingBudget?: number;
}

/**
 * 模型配置常量
 * 基于阿里云百炼模型限制
 */
export const MODEL_LIMITS = {
  /** 最大输入长度 991K */
  MAX_INPUT_LENGTH: 991 * 1024,
  /** 最大输入长度(思考) 983K */
  MAX_INPUT_LENGTH_THINKING: 983 * 1024,
  /** 上下文长度 1M */
  CONTEXT_LENGTH: 1024 * 1024,
  /** 最大输出长度 64K */
  MAX_OUTPUT_LENGTH: 64 * 1024,
  /** 最大输出长度(思考) 64K */
  MAX_OUTPUT_LENGTH_THINKING: 64 * 1024,
  /** 最大思维链长度 80K */
  MAX_THINKING_CHAIN_LENGTH: 80 * 1024,
  /** RPM 30000 */
  RPM: 30000,
  /** TPM 5000000 */
  TPM: 5000000,
};

/**
 * LLM服务类
 */
export class LLMService {
  private config: LLMConfig;
  private maxRetries: number = 3;
  private timeoutMs: number = 300000; // 5分钟超时

  constructor(config?: LLMConfig) {
    this.config = {
      model: config?.model || process.env.LLM_MODEL || 'qwen3.5-plus',
      temperature: config?.temperature ?? 0.7,
      // 默认使用32K输出，足够处理大型招标文档
      maxTokens: config?.maxTokens || 32768,
      enableThinking: config?.enableThinking ?? false,
      // 默认思维链长度32K
      thinkingBudget: config?.thinkingBudget ?? 32768,
    };
  }

  /**
   * 获取LLM配置
   */
  private async getLLMSettings(): Promise<{
    apiUrl: string;
    apiKey: string;
    model: string;
    maxTokens: number;
    enableThinking: boolean;
    thinkingBudget: number;
  }> {
    try {
      const client = getSupabaseClient();
      
      // 查询llm category下的配置
      const { data: settings, error } = await client
        .from('system_settings')
        .select('key, value, category')
        .eq('category', 'llm');

      if (error) {
        console.error('[LLM] 查询配置失败:', error);
      }
      
      console.log('[LLM] 查询到的设置:', settings?.map(s => ({ key: s.key, value: s.value ? '***已设置***' : '空值', category: s.category })));

      const configMap = new Map(settings?.map(s => [s.key, s.value]));

      return {
        apiUrl: configMap.get('api_url') || process.env.LLM_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: configMap.get('api_key') || process.env.LLM_API_KEY || '',
        model: configMap.get('model') || this.config.model || 'qwen3.5-plus',
        // 构造函数配置优先于数据库设置（允许调用时指定特定参数）
        maxTokens: this.config.maxTokens || parseInt(configMap.get('max_tokens') || '32768'),
        enableThinking: this.config.enableThinking ?? (configMap.get('enable_thinking') === 'true'),
        thinkingBudget: this.config.thinkingBudget || parseInt(configMap.get('thinking_budget') || '32768'),
      };
    } catch (error) {
      console.error('获取LLM配置失败:', error);
      return {
        apiUrl: process.env.LLM_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: process.env.LLM_API_KEY || '',
        model: this.config.model || 'qwen3.5-plus',
        maxTokens: 32768,
        enableThinking: false,
        thinkingBudget: 32768,
      };
    }
  }

  /**
   * 调用LLM
   * @param prompt 提示词
   * @returns 响应文本
   */
  async invoke(prompt: string): Promise<string> {
    const settings = await this.getLLMSettings();

    if (!settings.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    // 构造函数配置优先于数据库设置（允许调用时禁用思考模式）
    const enableThinking = this.config.enableThinking ?? settings.enableThinking;
    
    console.log('[LLM] Calling model:', settings.model, 'enableThinking:', enableThinking);

    // 构建请求体
    const requestBody: any = {
      model: settings.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: this.config.temperature,
      max_tokens: settings.maxTokens,
    };

    // 阿里云百炼思考模式 - 仅当显式启用时
    if (enableThinking && settings.apiUrl.includes('dashscope')) {
      requestBody.enable_thinking = true;
      requestBody.thinking_budget = settings.thinkingBudget;
    }

    // 重试机制
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[LLM] 第 ${attempt}/${this.maxRetries} 次尝试`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(`${settings.apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[LLM] API错误:', response.status, errorText);
          throw new Error(`LLM API错误: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        
        // 检查finish_reason
        const finishReason = data.choices?.[0]?.finish_reason;
        if (finishReason === 'network_error') {
          throw new Error('网络错误，LLM响应被截断');
        }
        
        // 提取响应内容
        const content = data.choices?.[0]?.message?.content || '';
        
        // 如果有思考过程，记录日志
        if (data.choices?.[0]?.message?.reasoning_content) {
          console.log('[LLM] 思考过程:', data.choices[0].message.reasoning_content.substring(0, 100) + '...');
        }

        console.log('[LLM] 响应成功，内容长度:', content.length);
        return content;
        
      } catch (error: any) {
        lastError = error;
        console.error(`[LLM] 第 ${attempt} 次调用失败:`, error.message);
        
        // 如果是网络错误或超时，等待后重试
        if (attempt < this.maxRetries && (
          error.name === 'AbortError' ||
          error.message.includes('network') ||
          error.message.includes('截断')
        )) {
          const waitTime = attempt * 2000; // 递增等待时间
          console.log(`[LLM] 等待 ${waitTime}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          break;
        }
      }
    }

    throw lastError || new Error('LLM调用失败');
  }

  /**
   * 流式调用LLM
   * @param prompt 提示词
   * @param onChunk 每个chunk的回调
   */
  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const settings = await this.getLLMSettings();

    if (!settings.apiKey) {
      throw new Error('请先在系统设置中配置LLM API密钥');
    }

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    // 构造函数配置优先于数据库设置（允许调用时禁用思考模式）
    const enableThinking = this.config.enableThinking ?? settings.enableThinking;
    
    console.log('[LLM] Stream mode, model:', settings.model, 'enableThinking:', enableThinking);

    // 构建请求体
    const requestBody: any = {
      model: settings.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: settings.maxTokens,
      stream: true,
    };

    // 阿里云百炼思考模式 - 仅当显式启用时
    if (enableThinking && settings.apiUrl.includes('dashscope')) {
      requestBody.enable_thinking = true;
      requestBody.thinking_budget = settings.thinkingBudget;
    }

    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LLM] Stream API错误:', response.status, errorText);
      throw new Error(`LLM API错误: ${response.status}`);
    }

    console.log('[LLM] Stream API响应成功，开始读取流...');

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let totalChunks = 0;
    let errorCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[LLM] Stream结束，共解析', totalChunks, '个有效chunk，', errorCount, '个解析错误');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('[LLM] 收到[DONE]信号');
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              totalChunks++;
              yield content;
            }
          } catch (e) {
            errorCount++;
            if (errorCount <= 3) {
              console.warn('[LLM] 解析chunk失败:', data.substring(0, 100));
            }
          }
        }
      }
    }
  }

  /**
   * 带JSON解析的调用
   */
  async invokeForJson<T>(prompt: string): Promise<T> {
    const response = await this.invoke(prompt);
    
    // 尝试提取JSON
    const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('[LLM] JSON解析失败:', e);
        throw new Error('LLM返回的内容无法解析为JSON');
      }
    }
    
    throw new Error('LLM未返回有效的JSON数据');
  }

  /**
   * 流式调用并收集完整响应
   * 适用于长输出场景，避免超时
   */
  async invokeStreaming(prompt: string, systemPrompt?: string): Promise<string> {
    console.log('[LLM] invokeStreaming 开始，prompt长度:', prompt.length);
    
    const chunks: string[] = [];
    let chunkCount = 0;
    
    try {
      for await (const chunk of this.stream(prompt, systemPrompt)) {
        chunks.push(chunk);
        chunkCount++;
        
        // 每100个chunk打印一次进度
        if (chunkCount % 100 === 0) {
          console.log(`[LLM] 已接收 ${chunkCount} 个chunk，当前总长度:`, chunks.join('').length);
        }
      }
      
      const result = chunks.join('');
      console.log('[LLM] invokeStreaming 完成，共接收', chunkCount, '个chunk，总长度:', result.length);
      console.log('[LLM] 响应内容前500字符:', result.substring(0, 500));
      
      return result;
    } catch (error) {
      console.error('[LLM] invokeStreaming 失败:', error);
      throw error;
    }
  }

  /**
   * 分段调用LLM并拼接结果
   * 适用于超长输出场景，将任务拆分后合并
   * @param prompts 多个提示词数组
   * @param mergeFn 合并函数
   */
  async invokeInSegments<T>(
    prompts: string[],
    mergeFn: (results: string[]) => T
  ): Promise<T> {
    const results: string[] = [];
    
    for (let i = 0; i < prompts.length; i++) {
      console.log(`[LLM] 执行分段任务 ${i + 1}/${prompts.length}`);
      const result = await this.invokeStreaming(prompts[i]);
      results.push(result);
    }
    
    return mergeFn(results);
  }

  /**
   * 检查响应是否被截断，如果是则继续获取
   * @param prompt 原始提示词
   * @param partialResponse 部分响应
   * @returns 完整响应
   */
  async invokeWithContinue(prompt: string): Promise<string> {
    const settings = await this.getLLMSettings();
    
    // 第一次调用
    let fullContent = await this.invokeStreaming(prompt);
    
    // 检查JSON是否完整
    const isComplete = this.isJSONComplete(fullContent);
    
    if (!isComplete) {
      console.log('[LLM] 响应不完整，尝试继续获取...');
      
      // 构建续写提示词
      const continuePrompt = `请继续完成之前的JSON输出。从以下内容继续（不要重复已输出的内容）：

${fullContent.slice(-1000)}

继续输出剩余的JSON内容：`;

      const continuedContent = await this.invokeStreaming(continuePrompt);
      fullContent = fullContent + continuedContent;
    }
    
    return fullContent;
  }

  /**
   * 检查JSON是否完整
   */
  private isJSONComplete(content: string): boolean {
    try {
      // 尝试提取并解析JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        JSON.parse(jsonMatch[0]);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 智能提取：自动选择最佳策略
   * - 对于短文档：单次调用
   * - 对于长文档：流式调用
   * - 对于超长输出：分段提取
   */
  async extractWithAutoStrategy(
    documentContent: string,
    extractionPrompts: Record<string, string>
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    // 估算输出长度
    const estimatedOutputLength = documentContent.length * 0.3; // 约30%的压缩率
    
    if (estimatedOutputLength < 10000) {
      // 短输出：单次调用
      console.log('[LLM] 使用单次调用策略');
      const prompt = Object.values(extractionPrompts).join('\n\n');
      const response = await this.invokeStreaming(prompt);
      results.full = this.parseJSON(response);
    } else if (estimatedOutputLength < 50000) {
      // 中等输出：流式调用
      console.log('[LLM] 使用流式调用策略');
      const prompt = Object.values(extractionPrompts).join('\n\n');
      const response = await this.invokeStreaming(prompt);
      results.full = this.parseJSON(response);
    } else {
      // 长输出：分段提取
      console.log('[LLM] 使用分段提取策略');
      for (const [key, prompt] of Object.entries(extractionPrompts)) {
        console.log(`[LLM] 提取 ${key}...`);
        const response = await this.invokeStreaming(prompt);
        results[key] = this.parseJSON(response);
      }
    }
    
    return results;
  }

  /**
   * 安全解析JSON
   */
  private parseJSON(content: string): any {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (e) {
      console.error('[LLM] JSON解析失败:', e);
      return null;
    }
  }
}

// 默认实例
let defaultModel: LLMService | null = null;

/**
 * 获取默认LLM实例
 */
export function loadModel(config?: LLMConfig): LLMService {
  if (!defaultModel) {
    defaultModel = new LLMService(config);
  }
  return defaultModel;
}

/**
 * 创建新的LLM实例
 */
export function createModel(config?: LLMConfig): LLMService {
  return new LLMService(config);
}
