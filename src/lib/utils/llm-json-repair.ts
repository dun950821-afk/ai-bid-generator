/**
 * LLM JSON修复服务
 * 当JSON解析失败时，调用LLM进行智能修复
 * 仅用于处理JSON格式错误，不处理其他类型的错误
 */

import { createModel } from '@/lib/llm';

/**
 * LLM修复选项
 */
export interface LLMRepairOptions {
  /** 期望的数据结构描述（JSON Schema或简单描述） */
  expectedSchema?: string;
  /** 字段名称（用于日志） */
  fieldName?: string;
  /** 最大token限制 */
  maxTokens?: number;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

/**
 * LLM修复结果
 */
export interface LLMRepairResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  repairDetails?: string[];
}

/**
 * 修复JSON的Prompt模板
 */
const REPAIR_JSON_PROMPT = `你是一个JSON修复专家。下面的JSON因为格式问题无法被解析。

**原始内容**：
\`\`\`json
{truncatedJson}
\`\`\`

**错误信息**：
{errorMessage}

**期望的数据结构**：
{expectedSchema}

**修复要求**：
1. 输出合法的JSON格式
2. 保留所有已解析出的完整数据
3. 对于被截断或不完整的部分：
   - 如果是数组元素被截断，删除该不完整元素
   - 如果是对象属性被截断，删除该不完整键值对
   - 如果是字符串被截断，在该字符串末尾添加合适的内容闭合
4. 不要添加原文中不存在的新数据
5. 不要删除已存在的完整数据

**输出格式**：
只输出修复后的JSON，不要添加任何解释或代码块标记。`;

/**
 * LLM JSON修复服务类
 */
export class LLMJsonRepairService {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * 使用LLM修复JSON
   * @param content 原始内容（解析失败的JSON）
   * @param parseError 解析错误信息
   * @param options 修复选项
   */
  async repair<T = any>(
    content: string,
    parseError: string,
    options: LLMRepairOptions = {}
  ): Promise<LLMRepairResult<T>> {
    const {
      expectedSchema = '根据内容推断',
      fieldName = '未知字段',
      maxTokens = 8192,
      verbose = this.verbose
    } = options;

    if (verbose) {
      console.log(`[LLMRepair] 开始修复JSON，字段: ${fieldName}`);
      console.log(`[LLMRepair] 原始内容长度: ${content.length}`);
      console.log(`[LLMRepair] 解析错误: ${parseError.substring(0, 200)}`);
    }

    try {
      // 创建LLM实例
      const llm = createModel({
        enableThinking: false,
        temperature: 0.1, // 低温度确保输出稳定
        maxTokens: maxTokens
      });

      // 构建修复提示
      const prompt = REPAIR_JSON_PROMPT
        .replace('{truncatedJson}', content.substring(0, 12000)) // 限制输入长度
        .replace('{errorMessage}', parseError.substring(0, 500))
        .replace('{expectedSchema}', expectedSchema);

      if (verbose) {
        console.log(`[LLMRepair] 调用LLM进行修复...`);
      }

      // 调用LLM
      const response = await llm.invoke(prompt);

      if (verbose) {
        console.log(`[LLMRepair] LLM响应长度: ${response.length}`);
      }

      // 尝试解析修复后的JSON
      const repairedJson = this.extractJsonFromResponse(response);
      
      if (!repairedJson) {
        return {
          success: false,
          error: 'LLM未返回有效的JSON',
          repairDetails: ['LLM响应中未找到JSON结构']
        };
      }

      // 解析JSON
      try {
        const data = JSON.parse(repairedJson);
        
        if (verbose) {
          console.log(`[LLMRepair] JSON修复成功`);
          console.log(`[LLMRepair] 修复后数据keys:`, 
            Array.isArray(data) ? `数组(${data.length}项)` : Object.keys(data));
        }

        return {
          success: true,
          data,
          repairDetails: ['LLM修复成功']
        };
      } catch (parseErr: any) {
        if (verbose) {
          console.log(`[LLMRepair] 修复后的JSON仍然无法解析:`, parseErr.message);
        }
        
        return {
          success: false,
          error: `修复后的JSON仍然无效: ${parseErr.message}`,
          repairDetails: [`LLM修复后解析失败: ${parseErr.message}`]
        };
      }
    } catch (error: any) {
      if (verbose) {
        console.error(`[LLMRepair] LLM调用失败:`, error.message);
      }
      
      return {
        success: false,
        error: `LLM调用失败: ${error.message}`,
        repairDetails: [`LLM调用异常: ${error.message}`]
      };
    }
  }

  /**
   * 从LLM响应中提取JSON
   */
  private extractJsonFromResponse(response: string): string | null {
    // 清理响应
    let cleaned = response.trim();
    
    // 移除可能的markdown代码块标记
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    
    // 尝试找到JSON对象或数组
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    
    if (objectMatch) {
      return objectMatch[0];
    }
    if (arrayMatch) {
      return arrayMatch[0];
    }
    
    // 如果都没有，返回清理后的原始响应
    if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
      return cleaned;
    }
    
    return null;
  }
}

// 单例实例
let repairServiceInstance: LLMJsonRepairService | null = null;

/**
 * 获取LLM修复服务实例
 */
export function getLLMRepairService(verbose: boolean = false): LLMJsonRepairService {
  if (!repairServiceInstance) {
    repairServiceInstance = new LLMJsonRepairService(verbose);
  }
  return repairServiceInstance;
}

/**
 * 快捷修复函数
 */
export async function repairJsonWithLLM<T = any>(
  content: string,
  parseError: string,
  options?: LLMRepairOptions
): Promise<LLMRepairResult<T>> {
  const service = getLLMRepairService(options?.verbose);
  return service.repair<T>(content, parseError, options);
}
