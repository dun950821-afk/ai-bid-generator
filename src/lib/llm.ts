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
        maxTokens: parseInt(configMap.get('max_tokens') || '32768'),
        enableThinking: configMap.get('enable_thinking') === 'true',
        thinkingBudget: parseInt(configMap.get('thinking_budget') || '32768'),
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

    console.log('[LLM] Calling model:', settings.model);

    // 构建请求体
    const requestBody: any = {
      model: settings.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: this.config.temperature,
      max_tokens: settings.maxTokens,
    };

    // 阿里云百炼思考模式
    if (settings.enableThinking && settings.apiUrl.includes('dashscope')) {
      requestBody.enable_thinking = true;
      requestBody.thinking_budget = settings.thinkingBudget;
    }

    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LLM] API错误:', response.status, errorText);
      throw new Error(`LLM API错误: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    
    // 提取响应内容
    const content = data.choices?.[0]?.message?.content || '';
    
    // 如果有思考过程，记录日志
    if (data.choices?.[0]?.message?.reasoning_content) {
      console.log('[LLM] 思考过程:', data.choices[0].message.reasoning_content.substring(0, 100) + '...');
    }

    return content;
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

    // 构建请求体
    const requestBody: any = {
      model: settings.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: settings.maxTokens,
      stream: true,
    };

    // 阿里云百炼思考模式
    if (settings.enableThinking && settings.apiUrl.includes('dashscope')) {
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
      throw new Error(`LLM API错误: ${response.status}`);
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
          } catch (e) {
            // 忽略解析错误
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
