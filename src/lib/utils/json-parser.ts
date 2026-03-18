/**
 * JSON解析增强工具
 * 提供统一的JSON解析、修复和验证功能
 */

/**
 * JSON解析选项
 */
export interface JSONParseOptions {
  /** 是否允许截断JSON修复 */
  allowTruncated?: boolean;
  /** 是否记录详细日志 */
  verbose?: boolean;
  /** 最大尝试修复次数 */
  maxRepairAttempts?: number;
}

/**
 * JSON解析结果
 */
export interface JSONParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  repaired?: boolean;
  repairDetails?: string[];
}

/**
 * 增强的JSON解析器
 */
export class JSONParser {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * 解析JSON字符串，支持多种格式和自动修复
   */
  parse<T = any>(content: string, options: JSONParseOptions = {}): JSONParseResult<T> {
    const { allowTruncated = true, maxRepairAttempts = 3 } = options;
    const repairDetails: string[] = [];

    try {
      // 1. 尝试直接解析
      const result = this.tryDirectParse<T>(content);
      if (result.success) {
        return result;
      }
    } catch (error: any) {
      if (this.verbose) {
        console.log('[JSONParser] 直接解析失败:', error.message);
      }
    }

    // 2. 尝试提取JSON代码块
    try {
      const result = this.tryExtractCodeBlock<T>(content);
      if (result.success) {
        if (this.verbose) {
          console.log('[JSONParser] 从代码块提取成功');
        }
        return result;
      }
    } catch (error: any) {
      if (this.verbose) {
        console.log('[JSONParser] 代码块提取失败:', error.message);
      }
    }

    // 3. 尝试提取纯JSON对象
    try {
      const result = this.tryExtractJSONObject<T>(content);
      if (result.success) {
        if (this.verbose) {
          console.log('[JSONParser] 提取纯JSON对象成功');
        }
        return result;
      }
    } catch (error: any) {
      if (this.verbose) {
        console.log('[JSONParser] 提取JSON对象失败:', error.message);
      }
    }

    // 4. 尝试修复截断的JSON
    if (allowTruncated) {
      try {
        const result = this.tryRepairTruncated<T>(content, maxRepairAttempts);
        if (result.success) {
          if (this.verbose) {
            console.log('[JSONParser] 修复截断JSON成功');
          }
          return { ...result, repaired: true, repairDetails };
        }
      } catch (error: any) {
        if (this.verbose) {
          console.log('[JSONParser] 修复截断JSON失败:', error.message);
        }
      }
    }

    return {
      success: false,
      error: '无法解析JSON响应',
      repairDetails,
    };
  }

  /**
   * 尝试直接解析
   */
  private tryDirectParse<T>(content: string): JSONParseResult<T> {
    try {
      const data = JSON.parse(content);
      return { success: true, data };
    } catch {
      return { success: false };
    }
  }

  /**
   * 尝试从代码块提取JSON
   */
  private tryExtractCodeBlock<T>(content: string): JSONParseResult<T> {
    // 匹配 ```json ... ``` 代码块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const data = JSON.parse(jsonMatch[1].trim());
      return { success: true, data };
    }

    // 匹配 ``` ... ``` 代码块（无json标记）
    const codeMatch = content.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch && codeMatch[1]) {
      try {
        const data = JSON.parse(codeMatch[1].trim());
        return { success: true, data };
      } catch {
        // 不是JSON，忽略
      }
    }

    return { success: false };
  }

  /**
   * 尝试提取纯JSON对象
   */
  private tryExtractJSONObject<T>(content: string): JSONParseResult<T> {
    // 匹配第一个完整的JSON对象 {...}
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const data = JSON.parse(objectMatch[0]);
        return { success: true, data };
      } catch {
        // 继续尝试数组格式
      }
    }

    // 匹配JSON数组 [...]
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const data = JSON.parse(arrayMatch[0]);
        return { success: true, data };
      } catch {
        // 解析失败
      }
    }

    return { success: false };
  }

  /**
   * 尝试修复截断的JSON
   */
  private tryRepairTruncated<T>(content: string, maxAttempts: number): JSONParseResult<T> {
    // 提取JSON部分
    const jsonMatch = content.match(/\{[\s\S]*/);
    if (!jsonMatch) {
      return { success: false };
    }

    let jsonStr = jsonMatch[0];
    const repairs: string[] = [];

    // 多次尝试修复
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const data = JSON.parse(jsonStr);
        if (this.verbose) {
          console.log(`[JSONParser] 第${attempt}次修复成功`);
        }
        return { success: true, data, repairDetails: repairs };
      } catch (error: any) {
        const errorMsg = error.message || '';
        repairs.push(`Attempt ${attempt}: ${errorMsg}`);

        // 根据错误类型进行修复
        if (errorMsg.includes('Unexpected end of JSON input')) {
          // 截断：尝试补全
          jsonStr = this.repairTruncation(jsonStr);
        } else if (errorMsg.includes('Unexpected token')) {
          // 语法错误：尝试移除非法字符
          jsonStr = this.removeInvalidTokens(jsonStr, errorMsg);
        } else if (errorMsg.includes('Expected')) {
          // 结构错误：尝试修复结构
          jsonStr = this.repairStructure(jsonStr, errorMsg);
        } else {
          break;
        }
      }
    }

    return { success: false, repairDetails: repairs };
  }

  /**
   * 修复截断的JSON
   */
  private repairTruncation(jsonStr: string): string {
    let repaired = jsonStr;

    // 统计括号
    const counts = { '{': 0, '}': 0, '[': 0, ']': 0, '"': 0 };
    for (const char of repaired) {
      if (char in counts) {
        counts[char as keyof typeof counts]++;
      }
    }

    // 处理未闭合的字符串
    if (counts['"'] % 2 !== 0) {
      // 找到最后一个未闭合的字符串位置
      const lastQuoteIndex = repaired.lastIndexOf('"');
      if (lastQuoteIndex > 0) {
        // 检查后面是否还有冒号或逗号
        const afterQuote = repaired.substring(lastQuoteIndex + 1);
        if (afterQuote.includes(':') || afterQuote.includes(',')) {
          // 可能是键名未闭合
          repaired = repaired.substring(0, lastQuoteIndex + 1) + '"';
        } else {
          // 可能是值未闭合
          repaired += '"';
        }
      }
    }

    // 补全缺失的括号
    const missingBraces = counts['{'] - counts['}'];
    const missingBrackets = counts['['] - counts[']'];

    for (let i = 0; i < missingBraces; i++) {
      repaired += '}';
    }
    for (let i = 0; i < missingBrackets; i++) {
      repaired += ']';
    }

    return repaired;
  }

  /**
   * 移除非法token
   */
  private removeInvalidTokens(jsonStr: string, errorMsg: string): string {
    // 提取非法token的位置
    const posMatch = errorMsg.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      // 移除非法字符
      if (pos < jsonStr.length) {
        return jsonStr.substring(0, pos) + jsonStr.substring(pos + 1);
      }
    }
    return jsonStr;
  }

  /**
   * 修复结构错误
   */
  private repairStructure(jsonStr: string, errorMsg: string): string {
    // 简化实现：尝试移除最后一个可能有问题部分
    const lastCommaIndex = jsonStr.lastIndexOf(',');
    if (lastCommaIndex > 0) {
      // 尝试移除最后一个逗号
      let repaired = jsonStr.substring(0, lastCommaIndex);
      // 重新补全括号
      repaired = this.repairTruncation(repaired);
      return repaired;
    }
    return jsonStr;
  }
}

/**
 * 创建JSON解析器实例
 */
export function createJSONParser(verbose: boolean = false): JSONParser {
  return new JSONParser(verbose);
}

/**
 * 快捷解析函数
 */
export function parseJSON<T = any>(content: string, options?: JSONParseOptions): JSONParseResult<T> {
  const parser = new JSONParser(options?.verbose);
  return parser.parse<T>(content, options);
}

/**
 * 简单的JSON解析函数（向后兼容）
 */
export function safeJSONParse(content: string): any {
  const result = parseJSON(content, { allowTruncated: true });
  if (!result.success) {
    throw new Error(result.error || '无法解析JSON响应');
  }
  return result.data;
}
