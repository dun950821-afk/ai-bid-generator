/**
 * 分隔符格式解析器
 * 
 * 用于解析LLM输出的分隔符格式文本，比JSON更容错
 * 
 * 格式示例：
 * ===RISK_START===
 * riskType: 资格性
 * description: 简洁描述
 * sourceText: 原文内容
 * severity: high
 * ===RISK_END===
 */

export interface RiskItem {
  riskType: string;
  description: string;
  sourceText: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * 评分项接口（用于分隔符格式）
 */
export interface ScoringItem {
  subItem: string;
  itemScore: number;
  rule: string;
  basis?: string;
  techDocRef?: string;
}

/**
 * 解析分隔符格式的风险项
 * @param text LLM输出的文本
 * @returns 风险项数组
 */
export function parseDelimiterRisks(text: string): RiskItem[] {
  const risks: RiskItem[] = [];
  
  if (!text || text.trim().length === 0) {
    return risks;
  }

  // 使用正则匹配所有风险块
  const blockRegex = /===RISK_START===([\s\S]*?)===RISK_END===/g;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    const block = match[1].trim();
    const risk = parseRiskBlock(block);
    
    if (risk && isValidRisk(risk)) {
      risks.push(risk);
    }
  }

  console.log(`[DelimiterParser] 解析完成，共 ${risks.length} 个风险项`);
  return risks;
}

/**
 * 解析评分项的分隔符格式文本
 * 用于混合格式：外层JSON + 内层分隔符
 * 
 * 格式：
 * ===ITEM_START===
 * subItem: 技术方案
 * itemScore: 30
 * rule: 评分标准原文
 * ===ITEM_END===
 * 
 * @param text 包含评分项的分隔符文本
 * @returns 评分项数组
 */
export function parseScoringItems(text: string): ScoringItem[] {
  const items: ScoringItem[] = [];
  
  if (!text || text.trim().length === 0) {
    return items;
  }

  // 使用正则匹配所有评分项块
  const blockRegex = /===ITEM_START===([\s\S]*?)===ITEM_END===/g;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    const block = match[1].trim();
    const item = parseScoringItemBlock(block);
    
    if (item && isValidScoringItem(item)) {
      items.push(item);
    }
  }

  console.log(`[DelimiterParser] 评分项解析完成，共 ${items.length} 项`);
  return items;
}

/**
 * 解析单个风险块
 */
function parseRiskBlock(block: string): RiskItem | null {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const risk: Partial<RiskItem> = {};
  
  for (const line of lines) {
    // 解析 key: value 格式
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    
    switch (key) {
      case 'risktype':
        risk.riskType = normalizeRiskType(value);
        break;
      case 'description':
        risk.description = value;
        break;
      case 'sourcetext':
        risk.sourceText = value;
        break;
      case 'severity':
        risk.severity = normalizeSeverity(value);
        break;
    }
  }
  
  return risk as RiskItem;
}

/**
 * 标准化风险类型
 */
function normalizeRiskType(value: string): string {
  const typeMap: Record<string, string> = {
    '资格性': '资格性',
    '符合性': '符合性',
    '技术性': '技术性',
    '商务性': '商务性',
    '程序性': '程序性',
    // 兼容可能的英文输入
    'qualification': '资格性',
    'compliance': '符合性',
    'technical': '技术性',
    'commercial': '商务性',
    'procedural': '程序性',
  };
  
  return typeMap[value] || value;
}

/**
 * 标准化严重程度
 */
function normalizeSeverity(value: string): 'critical' | 'high' | 'medium' | 'low' {
  const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    'critical': 'critical',
    'high': 'high',
    'medium': 'medium',
    'low': 'low',
    // 中文映射
    '严重': 'critical',
    '高': 'high',
    '中': 'medium',
    '低': 'low',
  };
  
  return severityMap[value.toLowerCase()] || 'high';
}

/**
 * 验证风险项是否有效
 */
function isValidRisk(risk: Partial<RiskItem>): risk is RiskItem {
  return (
    typeof risk.riskType === 'string' &&
    risk.riskType.length > 0 &&
    typeof risk.description === 'string' &&
    risk.description.length > 0 &&
    typeof risk.sourceText === 'string' &&
    risk.sourceText.length > 0
  );
}

/**
 * 解析单个评分项块
 */
function parseScoringItemBlock(block: string): ScoringItem | null {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const item: Partial<ScoringItem> = {};
  
  for (const line of lines) {
    // 解析 key: value 格式
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    
    switch (key) {
      case 'subitem':
      case 'name':
        item.subItem = value;
        break;
      case 'itemscore':
      case 'score':
        item.itemScore = parseFloat(value) || 0;
        break;
      case 'rule':
      case 'scoringmethod':
        item.rule = value;
        break;
      case 'basis':
        item.basis = value;
        break;
      case 'techdocref':
        item.techDocRef = value;
        break;
    }
  }
  
  return item as ScoringItem;
}

/**
 * 验证评分项是否有效
 */
function isValidScoringItem(item: Partial<ScoringItem>): item is ScoringItem {
  return (
    typeof item.subItem === 'string' &&
    item.subItem.length > 0 &&
    typeof item.itemScore === 'number' &&
    item.itemScore >= 0 &&
    typeof item.rule === 'string' &&
    item.rule.length > 0
  );
}

/**
 * 解析混合格式的评分标准
 * 外层JSON + 内层分隔符
 * 
 * @param data 解析后的JSON对象（包含itemsText字段）
 * @returns 完整的评分标准数据
 */
export function parseHybridScoringCriteria(data: any): any {
  if (!data || !data.evaluationCriteria) {
    return data;
  }

  const criteria = data.evaluationCriteria;
  
  // 处理每个大类
  for (const category of criteria) {
    if (category.itemsText && typeof category.itemsText === 'string') {
      // 解析内层分隔符格式的评分项
      const items = parseScoringItems(category.itemsText);
      category.items = items;
      delete category.itemsText; // 删除临时字段
    }
  }

  return data;
}

/**
 * 通用的分隔符格式解析器
 * 可用于解析其他类型的分隔符格式
 */
export function parseDelimiterFormat<T>(
  text: string,
  startMarker: string,
  endMarker: string,
  fieldMappers: Record<string, (value: string) => any>
): T[] {
  const results: T[] = [];
  
  if (!text || text.trim().length === 0) {
    return results;
  }

  const regex = new RegExp(
    `${escapeRegex(startMarker)}([\\s\\S]*?)${escapeRegex(endMarker)}`,
    'g'
  );
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const block = match[1].trim();
    const item = parseBlock(block, fieldMappers);
    if (item) {
      results.push(item as T);
    }
  }
  
  return results;
}

/**
 * 解析单个块
 */
function parseBlock(block: string, fieldMappers: Record<string, (value: string) => any>): Record<string, any> | null {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const item: Record<string, any> = {};
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    
    if (fieldMappers[key]) {
      item[key] = fieldMappers[key](value);
    } else {
      item[key] = value;
    }
  }
  
  return Object.keys(item).length > 0 ? item : null;
}

/**
 * 转义正则特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
