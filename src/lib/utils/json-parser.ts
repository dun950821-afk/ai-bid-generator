/**
 * JSON解析增强工具
 * 提供统一的JSON解析、修复和验证功能
 */

import { repairJsonWithLLM, LLMRepairOptions } from './llm-json-repair';

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
  /** 是否使用LLM修复（当规则修复失败时） */
  llmRepair?: boolean;
  /** LLM修复选项 */
  llmRepairOptions?: LLMRepairOptions;
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
    const { allowTruncated = true, maxRepairAttempts = 5 } = options;
    const repairDetails: string[] = [];

    // 0. 预处理：清理思考标签、处理中文引号等
    let cleanedContent = this.preprocessContent(content);

    try {
      // 1. 尝试直接解析
      const result = this.tryDirectParse<T>(cleanedContent);
      if (result.success) {
        return result;
      }
    } catch (error: any) {
      if (this.verbose) {
        console.log('[JSONParser] 直接解析失败:', error.message);
      }
      repairDetails.push(`Direct parse: ${error.message}`);
    }

    // 2. 尝试提取JSON代码块
    try {
      const result = this.tryExtractCodeBlock<T>(cleanedContent);
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
      const result = this.tryExtractJSONObject<T>(cleanedContent);
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

    // 4. 尝试修复并解析（核心修复逻辑）
    if (allowTruncated) {
      try {
        const result = this.tryRepairAndParse<T>(cleanedContent, maxRepairAttempts);
        if (result.success) {
          if (this.verbose) {
            console.log('[JSONParser] 修复JSON成功');
          }
          return { ...result, repaired: true, repairDetails: [...repairDetails, ...(result.repairDetails || [])] };
        }
      } catch (error: any) {
        if (this.verbose) {
          console.log('[JSONParser] 修复JSON失败:', error.message);
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
   * 异步解析JSON字符串，支持LLM修复
   * 当规则修复失败时，可以调用LLM进行智能修复
   */
  async parseAsync<T = any>(content: string, options: JSONParseOptions = {}): Promise<JSONParseResult<T>> {
    const { llmRepair = false, llmRepairOptions } = options;

    // 先尝试同步解析（规则修复）
    const syncResult = this.parse<T>(content, options);
    
    // 如果同步解析成功，直接返回
    if (syncResult.success) {
      return syncResult;
    }

    // 如果启用了LLM修复，尝试使用LLM修复
    if (llmRepair) {
      if (this.verbose) {
        console.log('[JSONParser] 规则修复失败，尝试LLM修复...');
      }

      const llmResult = await repairJsonWithLLM<T>(
        content,
        syncResult.error || '未知错误',
        {
          ...llmRepairOptions,
          verbose: this.verbose
        }
      );

      if (llmResult.success) {
        return {
          success: true,
          data: llmResult.data,
          repaired: true,
          repairDetails: [...(syncResult.repairDetails || []), ...(llmResult.repairDetails || [])]
        };
      }

      // LLM修复也失败了，返回原始错误
      return {
        success: false,
        error: `规则修复和LLM修复均失败: ${syncResult.error}`,
        repairDetails: [...(syncResult.repairDetails || []), `LLM修复失败: ${llmResult.error}`]
      };
    }

    // 未启用LLM修复，返回同步解析结果
    return syncResult;
  }

  /**
   * 预处理内容：清理思考标签、处理中文引号等
   */
  private preprocessContent(content: string): string {
    // 先处理中文引号（在JSON字符串值内部会导致解析失败）
    // 将中文引号替换为转义的英文引号
    // 注意：必须使用 '\\\"' 而不是 '\\"'，因为 '\\"' 在JS字符串中只是一个双引号字符
    let processed = content
      // 处理中文双引号：将 " 和 " 替换为转义的英文引号 \"
      .replace(/\u201c/g, '\\\"')  // " (左双引号 U+201C) -> \"
      .replace(/\u201d/g, '\\\"')  // " (右双引号 U+201D) -> \"
      // 处理中文单引号：将 ' 和 ' 替换为普通单引号（单引号在JSON中不需要转义）
      .replace(/\u2018/g, "'")  // ' (左单引号 U+2018) -> '
      .replace(/\u2019/g, "'"); // ' (右单引号 U+2019) -> '
    
    // 清理思考标签
    processed = processed
      .replace(/<tool_call>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    
    return processed.trim();
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
      try {
        const data = JSON.parse(jsonMatch[1].trim());
        return { success: true, data };
      } catch {}
    }

    // 匹配 ``` ... ``` 代码块（无json标记）
    const codeMatch = content.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch && codeMatch[1]) {
      try {
        const data = JSON.parse(codeMatch[1].trim());
        return { success: true, data };
      } catch {}
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
      } catch {}
    }

    // 匹配JSON数组 [...]
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const data = JSON.parse(arrayMatch[0]);
        return { success: true, data };
      } catch {}
    }

    return { success: false };
  }

  /**
   * 尝试修复并解析JSON（核心修复逻辑）
   * 处理：未转义引号、截断、语法错误等
   */
  private tryRepairAndParse<T>(content: string, maxAttempts: number): JSONParseResult<T> {
    const repairs: string[] = [];
    
    // 提取JSON部分（数组或对象）
    const isArray = content.trimStart().startsWith('[');
    const jsonMatch = isArray ? content.match(/\[[\s\S]*/) : content.match(/\{[\s\S]*/);
    
    if (!jsonMatch) {
      return { success: false, repairDetails: ['未找到JSON结构'] };
    }

    let jsonStr = jsonMatch[0];

    // 多次尝试修复
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const data = JSON.parse(jsonStr);
        if (this.verbose) {
          console.log(`[JSONParser] 第${attempt}次尝试成功`);
        }
        return { success: true, data, repairDetails: repairs };
      } catch (error: any) {
        const errorMsg = error.message || '';
        repairs.push(`Attempt ${attempt}: ${errorMsg}`);

        if (this.verbose) {
          console.log(`[JSONParser] 第${attempt}次尝试失败: ${errorMsg}`);
          
          // 打印错误位置上下文
          const posMatch = errorMsg.match(/position (\d+)/);
          if (posMatch) {
            const pos = parseInt(posMatch[1]);
            const context = jsonStr.substring(Math.max(0, pos - 30), Math.min(jsonStr.length, pos + 30));
            console.log(`[JSONParser] 错误位置(pos ${pos}): ...${context}...`);
          }
        }

        // 根据错误类型选择修复策略
        if (errorMsg.includes("Expected ','") || errorMsg.includes("Expected '}'") || errorMsg.includes("Expected ']'")) {
          // 可能是未转义引号导致的结构错误
          jsonStr = this.repairUnescapedQuotes(jsonStr, errorMsg);
        } else if (errorMsg.includes('Unexpected end of JSON input')) {
          // 截断：补全括号
          jsonStr = this.repairTruncation(jsonStr);
        } else if (errorMsg.includes('Unexpected token')) {
          // 非法token：尝试移除
          jsonStr = this.removeInvalidTokens(jsonStr, errorMsg);
        } else if (errorMsg.includes('Unexpected non-whitespace')) {
          // JSON后有多余内容：尝试截取有效部分
          jsonStr = this.extractValidJSON(jsonStr, isArray);
        } else {
          // 其他错误：尝试通用修复
          jsonStr = this.generalRepair(jsonStr, errorMsg);
        }
      }
    }

    return { success: false, repairDetails: repairs };
  }

  /**
   * 修复未转义的引号（核心修复）
   * 这是LLM返回JSON中最常见的问题
   */
  private repairUnescapedQuotes(jsonStr: string, errorMsg: string): string {
    if (this.verbose) {
      console.log('[JSONParser] 尝试修复未转义引号...');
    }

    // 获取错误位置
    const posMatch = errorMsg.match(/position (\d+)/);
    if (!posMatch) {
      return jsonStr;
    }

    const errorPos = parseInt(posMatch[1]);
    
    // 找到错误位置所在的字符串值
    // 策略：找到最近的 "key": "value" 模式
    const beforeError = jsonStr.substring(0, errorPos);
    const afterError = jsonStr.substring(errorPos);
    
    // 找到最后一个键名（格式: "key": "）
    const keyMatch = beforeError.match(/"([^"]+)"\s*:\s*$/);
    if (!keyMatch) {
      // 没有找到键，可能是数组元素，尝试其他策略
      return this.repairTruncation(jsonStr);
    }

    // 找到当前字符串值的起始位置
    const valueStartPos = beforeError.lastIndexOf('"', errorPos - 1);
    if (valueStartPos === -1) {
      return jsonStr;
    }

    // 提取字符串值部分（从起始引号到错误位置之后）
    const valueEndCandidates = this.findStringValueEnd(jsonStr, valueStartPos);
    
    if (valueEndCandidates.length > 0) {
      // 尝试每个候选的结束位置
      for (const endPos of valueEndCandidates) {
        const value = jsonStr.substring(valueStartPos + 1, endPos);
        // 转义值中的所有引号（除了开头和结尾）
        const escapedValue = this.escapeQuotesInValue(value);
        
        // 构建修复后的JSON
        const repaired = jsonStr.substring(0, valueStartPos) + 
                        '"' + escapedValue + '"' + 
                        jsonStr.substring(endPos + 1);
        
        // 尝试解析修复后的结果
        try {
          JSON.parse(repaired);
          if (this.verbose) {
            console.log('[JSONParser] 引号转义修复成功');
          }
          return repaired;
        } catch {}
      }
    }

    // 策略2：使用正则表达式批量修复未转义引号
    return this.batchEscapeQuotes(jsonStr);
  }

  /**
   * 找到字符串值的可能结束位置
   */
  private findStringValueEnd(jsonStr: string, startPos: number): number[] {
    const candidates: number[] = [];
    let i = startPos + 1;
    let depth = 0;

    while (i < jsonStr.length) {
      const char = jsonStr[i];
      const prevChar = i > 0 ? jsonStr[i - 1] : '';

      if (prevChar !== '\\' && char === '"') {
        // 可能的结束引号
        // 检查后面是否跟着合法的JSON字符（逗号、冒号、括号）
        const nextChar = jsonStr.substring(i + 1).trimStart()[0];
        if ([',', '}', ']', ':'].includes(nextChar) || !nextChar) {
          candidates.push(i);
        }
      }
      i++;
    }

    return candidates;
  }

  /**
   * 转义字符串值中的引号
   */
  private escapeQuotesInValue(value: string): string {
    // 转义所有未转义的双引号
    return value.replace(/(?<!\\)"/g, '\\"');
  }

  /**
   * 批量转义JSON中的未转义引号
   */
  private batchEscapeQuotes(jsonStr: string): string {
    if (this.verbose) {
      console.log('[JSONParser] 尝试批量转义引号...');
    }

    let result = '';
    let inString = false;
    let escapeNext = false;
    let i = 0;

    while (i < jsonStr.length) {
      const char = jsonStr[i];
      const prevChar = i > 0 ? jsonStr[i - 1] : '';

      if (escapeNext) {
        result += char;
        escapeNext = false;
        i++;
        continue;
      }

      if (char === '\\' && inString) {
        result += char;
        escapeNext = true;
        i++;
        continue;
      }

      if (char === '"') {
        if (!inString) {
          // 进入字符串
          inString = true;
          result += char;
        } else {
          // 检查是否是真正的字符串结束
          // 看后面的非空白字符
          let j = i + 1;
          while (j < jsonStr.length && /\s/.test(jsonStr[j])) {
            j++;
          }
          const nextChar = jsonStr[j] || '';

          if ([',', '}', ']', ':'].includes(nextChar) || nextChar === '') {
            // 这是真正的字符串结束
            inString = false;
            result += char;
          } else {
            // 这是字符串内部的引号，需要转义
            result += '\\"';
            if (this.verbose) {
              console.log(`[JSONParser] 转义位置${i}的引号`);
            }
          }
        }
      } else {
        result += char;
      }

      i++;
    }

    return result;
  }

  /**
   * 修复截断的JSON - 增强版
   * 策略：
   * 1. 如果字符串未闭合，尝试找到最后一个完整的键值对
   * 2. 补全缺失的括号
   * 3. 如果修复失败，尝试提取有效部分
   */
  private repairTruncation(jsonStr: string): string {
    let repaired = jsonStr;

    // 统计括号和字符串状态
    const counts = { '{': 0, '}': 0, '[': 0, ']': 0 };
    let inString = false;
    let escapeNext = false;
    let stringStartPos = -1;
    const stack: string[] = []; // 追踪嵌套层级

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        if (!inString) {
          inString = true;
          stringStartPos = i;
        } else {
          inString = false;
          stringStartPos = -1;
        }
        continue;
      }
      if (!inString) {
        if (char === '{') {
          counts['{']++;
          stack.push('{');
        }
        else if (char === '}') {
          counts['}']++;
          if (stack.length > 0 && stack[stack.length - 1] === '{') {
            stack.pop();
          }
        }
        else if (char === '[') {
          counts['[']++;
          stack.push('[');
        }
        else if (char === ']') {
          counts[']']++;
          if (stack.length > 0 && stack[stack.length - 1] === '[') {
            stack.pop();
          }
        }
      }
    }

    // 处理未闭合的字符串
    if (inString) {
      if (this.verbose) {
        console.log('[JSONParser] 检测到未闭合字符串，起始位置:', stringStartPos);
      }
      
      // 策略1: 尝试找到最后一个完整的键值对
      const lastCompleteValue = this.findLastCompleteValue(repaired, stringStartPos);
      if (lastCompleteValue !== null) {
        if (this.verbose) {
          console.log('[JSONParser] 截断到最后一个完整值，位置:', lastCompleteValue);
        }
        repaired = repaired.substring(0, lastCompleteValue);
      } else {
        // 策略2: 简单添加引号闭合
        if (this.verbose) {
          console.log('[JSONParser] 无法找到完整值，添加引号闭合');
        }
        repaired += '"';
      }
    }

    // 重新统计括号（在修复字符串后）
    const newCounts = { '{': 0, '}': 0, '[': 0, ']': 0 };
    let newInString = false;
    let newEscapeNext = false;
    
    for (const char of repaired) {
      if (newEscapeNext) {
        newEscapeNext = false;
        continue;
      }
      if (char === '\\') {
        newEscapeNext = true;
        continue;
      }
      if (char === '"') {
        newInString = !newInString;
        continue;
      }
      if (!newInString) {
        if (char === '{') newCounts['{']++;
        else if (char === '}') newCounts['}']++;
        else if (char === '[') newCounts['[']++;
        else if (char === ']') newCounts[']']++;
      }
    }

    // 补全缺失的括号
    const missingBraces = newCounts['{'] - newCounts['}'];
    const missingBrackets = newCounts['['] - newCounts[']'];

    // 按正确顺序补全（先 ] 后 }）
    for (let i = 0; i < missingBrackets; i++) {
      repaired += ']';
    }
    for (let i = 0; i < missingBraces; i++) {
      repaired += '}';
    }

    if (this.verbose && (missingBraces > 0 || missingBrackets > 0)) {
      console.log(`[JSONParser] 补全 ${missingBraces} 个 }, ${missingBrackets} 个 ]`);
    }

    return repaired;
  }

  /**
   * 找到最后一个完整的值
   * 用于处理字符串被截断的情况
   */
  private findLastCompleteValue(jsonStr: string, truncatedStringStart: number): number | null {
    // 从截断字符串的开始位置向前查找最后一个完整的值
    let pos = truncatedStringStart - 1;
    
    // 跳过空白和冒号
    while (pos >= 0 && /[\s:]/.test(jsonStr[pos])) {
      pos--;
    }
    
    // 检查是否是键名（字符串）
    if (pos >= 0 && jsonStr[pos] === '"') {
      // 这是一个键名，需要找到键名开始的位置
      let keyStart = pos - 1;
      while (keyStart >= 0 && jsonStr[keyStart] !== '"') {
        keyStart--;
        // 处理转义引号
        if (keyStart >= 0 && jsonStr[keyStart] === '\\') {
          keyStart--;
        }
      }
      
      if (keyStart >= 0) {
        // 找到了键名的开始，现在需要找到这个键值对之前的逗号或对象开始
        pos = keyStart - 1;
        while (pos >= 0 && /[\s]/.test(jsonStr[pos])) {
          pos--;
        }
        
        if (pos >= 0 && (jsonStr[pos] === ',' || jsonStr[pos] === '{' || jsonStr[pos] === '[')) {
          // 返回这个位置，丢弃不完整的键值对
          if (jsonStr[pos] === ',') {
            return pos;
          } else {
            // 如果是 { 或 [，说明这是第一个元素，不能删除
            return null;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * 移除非法token
   */
  private removeInvalidTokens(jsonStr: string, errorMsg: string): string {
    const posMatch = errorMsg.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      if (pos < jsonStr.length) {
        const char = jsonStr[pos];
        if (this.verbose) {
          console.log(`[JSONParser] 移除位置${pos}的非法字符: ${char}`);
        }
        return jsonStr.substring(0, pos) + jsonStr.substring(pos + 1);
      }
    }
    return jsonStr;
  }

  /**
   * 提取有效JSON部分
   */
  private extractValidJSON(jsonStr: string, isArray: boolean): string {
    // 尝试找到第一个完整的JSON结构
    const pattern = isArray ? /\[[\s\S]*?\]/ : /\{[\s\S]*?\}/;
    const match = jsonStr.match(pattern);
    if (match) {
      return match[0];
    }
    return jsonStr;
  }

  /**
   * 通用修复策略
   */
  private generalRepair(jsonStr: string, errorMsg: string): string {
    // 1. 尝试批量转义引号
    let repaired = this.batchEscapeQuotes(jsonStr);
    
    // 2. 尝试补全括号
    repaired = this.repairTruncation(repaired);

    // 3. 移除末尾可能的无效字符
    const lastValid = Math.max(
      repaired.lastIndexOf('}'),
      repaired.lastIndexOf(']')
    );
    if (lastValid > 0 && lastValid < repaired.length - 1) {
      repaired = repaired.substring(0, lastValid + 1);
      // 重新补全括号
      repaired = this.repairTruncation(repaired);
    }

    return repaired;
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
 * 异步快捷解析函数（支持LLM修复）
 * 当规则修复失败时，可以调用LLM进行智能修复
 */
export async function parseJSONAsync<T = any>(content: string, options?: JSONParseOptions): Promise<JSONParseResult<T>> {
  const parser = new JSONParser(options?.verbose);
  return parser.parseAsync<T>(content, options);
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
