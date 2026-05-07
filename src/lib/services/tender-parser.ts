/**
 * 招标文件解析服务
 * 专门用于解析招标文档，提取关键信息
 */

import { createDocumentParser, ParsedDocument } from './document-parser';

export interface TenderInfo {
  // 基本信息
  projectName: string;
  projectNumber: string;
  tenderingUnit: string;       // 招标单位
  tenderAgency: string;        // 招标代理机构
  tenderType: string;          // 招标类型
  
  // 时间信息
  publishDate: string;         // 发布日期
  deadlineDate: string;        // 截止日期
  openDate: string;            // 开标日期
  
  // 金额信息
  budget: number;              // 预算金额
  guaranteeAmount: number;     // 保证金金额
  
  // 联系方式
  contactPerson: string;       // 联系人
  contactPhone: string;        // 联系电话
  contactEmail: string;        // 联系邮箱
}

export interface ScoringRequirement {
  id: string;
  type: 'technical' | 'business' | 'price';
  name: string;
  maxScore: number;
  description: string;
  requirements: string[];
  scoringRules: ScoringRule[];
}

export interface ScoringRule {
  id: string;
  condition: string;
  score: number;
  description: string;
}

export interface RiskFactor {
  id: string;
  type: 'disqualification' | 'warning' | 'attention';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  source: string;              // 原文出处
  suggestion: string;          // 应对建议
}

export interface TenderDocument {
  info: TenderInfo;
  scoringRequirements: ScoringRequirement[];
  riskFactors: RiskFactor[];
  sections: DocumentSection[];
  rawContent: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  level: number;
  children: DocumentSection[];
}

/**
 * 招标文件解析器
 */
export class TenderDocumentParser {
  /**
   * 解析招标文档
   */
  async parse(content: string, filename: string): Promise<TenderDocument> {
    // 1. 提取基本信息
    const info = this.extractBasicInfo(content);
    
    // 2. 提取评分要求
    const scoringRequirements = this.extractScoringRequirements(content);
    
    // 3. 提取风险因素
    const riskFactors = this.extractRiskFactors(content);
    
    // 4. 提取文档结构
    const sections = this.extractDocumentStructure(content);

    return {
      info,
      scoringRequirements,
      riskFactors,
      sections,
      rawContent: content,
    };
  }

  /**
   * 提取基本信息
   */
  private extractBasicInfo(content: string): TenderInfo {
    return {
      projectName: this.extractField(content, [
        /项目名称[：:]\s*([^\n]+)/,
        /工程名称[：:]\s*([^\n]+)/,
        /采购项目名称[：:]\s*([^\n]+)/,
      ]) || '',
      
      projectNumber: this.extractField(content, [
        /项目编号[：:]\s*([^\n]+)/,
        /招标编号[：:]\s*([^\n]+)/,
        /采购编号[：:]\s*([^\n]+)/,
      ]) || '',
      
      tenderingUnit: this.extractField(content, [
        /招标人[：:]\s*([^\n]+)/,
        /采购人[：:]\s*([^\n]+)/,
        /建设单位[：:]\s*([^\n]+)/,
      ]) || '',
      
      tenderAgency: this.extractField(content, [
        /招标代理机构[：:]\s*([^\n]+)/,
        /采购代理机构[：:]\s*([^\n]+)/,
      ]) || '',
      
      tenderType: this.extractField(content, [
        /招标方式[：:]\s*([^\n]+)/,
        /采购方式[：:]\s*([^\n]+)/,
      ]) || '公开招标',
      
      publishDate: this.extractDate(content, [
        /发布日期[：:]\s*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
        /公告日期[：:]\s*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
      ]) || '',
      
      deadlineDate: this.extractDate(content, [
        /投标截止时间[：:]\s*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
        /响应截止时间[：:]\s*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
        /截止时间[：:]\s*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
      ]) || '',
      
      openDate: this.extractDate(content, [
        /开标时间[：:]\s*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
      ]) || '',
      
      budget: this.extractAmount(content, [
        /预算金额[：:]\s*([\d,\.]+)\s*([万元元])/,
        /采购预算[：:]\s*([\d,\.]+)\s*([万元元])/,
        /控制价[：:]\s*([\d,\.]+)\s*([万元元])/,
      ]) || 0,
      
      guaranteeAmount: this.extractAmount(content, [
        /投标保证金[：:]\s*([\d,\.]+)\s*([万元元])/,
        /保证金[：:]\s*([\d,\.]+)\s*([万元元])/,
      ]) || 0,
      
      contactPerson: this.extractField(content, [
        /联系人[：:]\s*([^\n]+)/,
        /项目联系人[：:]\s*([^\n]+)/,
      ]) || '',
      
      contactPhone: this.extractField(content, [
        /联系电话[：:]\s*([^\n]+)/,
        /电话[：:]\s*([^\n]+)/,
      ]) || '',
      
      contactEmail: this.extractField(content, [
        /电子邮箱[：:]\s*([^\n]+)/,
        /邮箱[：:]\s*([^\n]+)/,
        /E-mail[：:]\s*([^\n]+)/,
      ]) || '',
    };
  }

  /**
   * 提取评分要求
   */
  private extractScoringRequirements(content: string): ScoringRequirement[] {
    const requirements: ScoringRequirement[] = [];
    
    // 1. 提取技术评分项
    const techSection = this.findSection(content, ['技术评分', '技术标评分', '技术部分']);
    if (techSection) {
      requirements.push(...this.parseScoringSection(techSection, 'technical'));
    }
    
    // 2. 提取商务评分项
    const bizSection = this.findSection(content, ['商务评分', '商务标评分', '商务部分']);
    if (bizSection) {
      requirements.push(...this.parseScoringSection(bizSection, 'business'));
    }
    
    // 3. 提取价格评分项
    const priceSection = this.findSection(content, ['价格评分', '报价评分', '经济标评分']);
    if (priceSection) {
      requirements.push(...this.parseScoringSection(priceSection, 'price'));
    }
    
    return requirements;
  }

  /**
   * 提取风险因素
   */
  private extractRiskFactors(content: string): RiskFactor[] {
    const risks: RiskFactor[] = [];
    
    // 1. 废标条款
    const disqualificationSection = this.findSection(content, ['废标条款', '无效投标', '否决投标']);
    if (disqualificationSection) {
      risks.push(...this.parseRiskSection(disqualificationSection, 'disqualification', 'critical'));
    }
    
    // 2. 实质性要求
    const substantiveSection = this.findSection(content, ['实质性要求', '实质性条款', '★']);
    if (substantiveSection) {
      risks.push(...this.parseRiskSection(substantiveSection, 'warning', 'high'));
    }
    
    // 3. 特别说明
    const attentionSection = this.findSection(content, ['特别说明', '注意事项', '重要提示']);
    if (attentionSection) {
      risks.push(...this.parseRiskSection(attentionSection, 'attention', 'medium'));
    }
    
    // 4. 扫描全文中的废标关键词
    const keywordRisks = this.scanRiskKeywords(content);
    risks.push(...keywordRisks);
    
    return risks;
  }

  /**
   * 提取文档结构
   */
  private extractDocumentStructure(content: string): DocumentSection[] {
    const lines = content.split('\n');
    const sections: DocumentSection[] = [];
    const stack: Array<{ level: number; section: DocumentSection }> = [];
    
    const headingPatterns = [
      { pattern: /^第[一二三四五六七八九十]+[章节部分条]/, level: 1 },
      { pattern: /^[一二三四五六七八九十]+[、.．]/, level: 2 },
      { pattern: /^\d+\.\d+/, level: 3 },
      { pattern: /^\d+[、.．]/, level: 2 },
      { pattern: /^【[^】]+】/, level: 2 },
      { pattern: /^#+\s+/, level: 1 },
    ];
    
    let currentContent: string[] = [];
    
    for (const line of lines) {
      let isHeading = false;
      let headingLevel = 0;
      const headingText = line.trim();
      
      for (const { pattern, level } of headingPatterns) {
        if (pattern.test(line.trim())) {
          isHeading = true;
          headingLevel = level;
          break;
        }
      }
      
      if (isHeading && headingText.length > 0) {
        // 保存上一个章节的内容
        if (stack.length > 0) {
          stack[stack.length - 1].section.content = currentContent.join('\n').trim();
        }
        currentContent = [];
        
        const newSection: DocumentSection = {
          id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: headingText,
          content: '',
          level: headingLevel,
          children: [],
        };
        
        // 找到正确的父节点
        while (stack.length > 0 && stack[stack.length - 1].level >= headingLevel) {
          stack.pop();
        }
        
        if (stack.length === 0) {
          sections.push(newSection);
        } else {
          stack[stack.length - 1].section.children.push(newSection);
        }
        
        stack.push({ level: headingLevel, section: newSection });
      } else {
        currentContent.push(line);
      }
    }
    
    // 保存最后一个章节的内容
    if (stack.length > 0) {
      stack[stack.length - 1].section.content = currentContent.join('\n').trim();
    }
    
    return sections;
  }

  /**
   * 辅助方法：提取字段
   */
  private extractField(content: string, patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * 辅助方法：提取日期
   */
  private extractDate(content: string, patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        // 标准化日期格式
        return match[1].replace(/[年月]/g, '-').replace(/日/g, '');
      }
    }
    return '';
  }

  /**
   * 辅助方法：提取金额
   */
  private extractAmount(content: string, patterns: RegExp[]): number {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const unit = match[2] || '元';
        return unit.includes('万') ? amount * 10000 : amount;
      }
    }
    return 0;
  }

  /**
   * 辅助方法：查找章节
   */
  private findSection(content: string, keywords: string[]): string {
    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}[\\s\\S]*?(?=第[一二三四五六七八九十]+[章节部分条]|$)`, 'i');
      const match = content.match(regex);
      if (match) {
        return match[0];
      }
    }
    return '';
  }

  /**
   * 解析评分章节
   */
  private parseScoringSection(section: string, type: 'technical' | 'business' | 'price'): ScoringRequirement[] {
    const requirements: ScoringRequirement[] = [];
    const lines = section.split('\n');
    
    let currentReq: ScoringRequirement | null = null;
    let reqIndex = 0;
    
    for (const line of lines) {
      const scoreMatch = line.match(/(\d+(?:\.\d+)?)\s*[分点]/);
      
      if (scoreMatch) {
        if (currentReq) {
          requirements.push(currentReq);
        }
        
        currentReq = {
          id: `req-${type}-${reqIndex++}`,
          type,
          name: line.replace(scoreMatch[0], '').trim().substring(0, 50),
          maxScore: parseFloat(scoreMatch[1]),
          description: '',
          requirements: [],
          scoringRules: [],
        };
      } else if (currentReq) {
        currentReq.description += line.trim() + ' ';
      }
    }
    
    if (currentReq) {
      requirements.push(currentReq);
    }
    
    return requirements;
  }

  /**
   * 解析风险章节
   */
  private parseRiskSection(section: string, type: RiskFactor['type'], severity: RiskFactor['severity']): RiskFactor[] {
    const risks: RiskFactor[] = [];
    const lines = section.split('\n');
    let riskIndex = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10) {
        risks.push({
          id: `risk-${riskIndex++}`,
          type,
          severity,
          description: trimmed,
          source: section.substring(0, 100) + '...',
          suggestion: this.generateSuggestion(trimmed, type),
        });
      }
    }
    
    return risks;
  }

  /**
   * 扫描风险关键词
   */
  private scanRiskKeywords(content: string): RiskFactor[] {
    const risks: RiskFactor[] = [];
    const keywords = [
      { pattern: /不得[^。？！]+[。？！]/g, type: 'warning' as const, severity: 'high' as const },
      { pattern: /必须[^。？！]+[。？！]/g, type: 'warning' as const, severity: 'high' as const },
      { pattern: /应当[^。？！]+[。？！]/g, type: 'attention' as const, severity: 'medium' as const },
      { pattern: /视为[^。？！]*(?:无效|废标)[^。？！]*[。？！]/g, type: 'disqualification' as const, severity: 'critical' as const },
    ];
    
    let riskIndex = 0;
    
    for (const { pattern, type, severity } of keywords) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        risks.push({
          id: `risk-scan-${riskIndex++}`,
          type,
          severity,
          description: match.trim(),
          source: '全文扫描',
          suggestion: this.generateSuggestion(match, type),
        });
      }
    }
    
    return risks;
  }

  /**
   * 生成应对建议
   */
  private generateSuggestion(content: string, type: RiskFactor['type']): string {
    const suggestions: Record<string, string> = {
      disqualification: '此条款可能导致废标，请务必确保响应满足要求',
      warning: '此条款为实质性要求，需要在投标文件中明确响应',
      attention: '请仔细阅读并确保理解此要求',
    };
    return suggestions[type] || '请关注此条款';
  }
}

/**
 * 创建招标文件解析器实例
 */
export function createTenderDocumentParser(): TenderDocumentParser {
  return new TenderDocumentParser();
}
