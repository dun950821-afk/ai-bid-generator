/**
 * 文档解析服务
 * 支持多种格式的文档解析：PDF、Word、Excel、TXT等
 */

import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import type { Headers } from 'next/dist/compiled/@edge-runtime/primitives';

export interface ParsedDocument {
  title: string;
  content: string;
  sections: DocumentSection[];
  metadata: DocumentMetadata;
}

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  level: number;
  startIndex: number;
  endIndex: number;
}

export interface DocumentMetadata {
  fileType: string;
  wordCount: number;
  charCount: number;
  pageCount?: number;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export interface ParseResult {
  success: boolean;
  document?: ParsedDocument;
  error?: string;
}

/**
 * 文档解析器类
 */
export class DocumentParser {
  private fetchClient: FetchClient;
  private config: Config;

  constructor(customHeaders?: Record<string, string>) {
    // 设置较长的超时时间（10分钟），支持大文件解析
    this.config = new Config({ 
      timeout: 600000,  // 10分钟超时
    });
    // 启用详细日志以便调试
    this.fetchClient = new FetchClient(this.config, customHeaders, true);
    console.log(`[DocumentParser] 初始化完成, timeout=600000ms, customHeaders=${!!customHeaders}`);
  }

  /**
   * 从URL解析文档
   * 支持 text:// 协议直接传入文本内容
   */
  async parseFromUrl(url: string): Promise<ParseResult> {
    try {
      console.log(`[DocumentParser] 开始解析URL: ${url.substring(0, 100)}...`);
      
      // 支持 text:// 协议直接传入文本
      if (url.startsWith('text://')) {
        const textContent = decodeURIComponent(url.substring(7));
        console.log(`[DocumentParser] 使用文本模式，内容长度: ${textContent.length}`);
        
        const sections = this.extractSections(textContent);
        const document: ParsedDocument = {
          title: this.extractTitle(textContent) || '粘贴文本',
          content: textContent,
          sections,
          metadata: {
            fileType: 'text',
            wordCount: this.countWords(textContent),
            charCount: textContent.length,
          },
        };
        
        return {
          success: true,
          document,
        };
      }
      
      const response = await this.fetchClient.fetch(url);
      console.log(`[DocumentParser] 解析响应: status_code=${response.status_code}, status_message=${response.status_message || 'none'}`);

      if (response.status_code !== 0) {
        console.error(`[DocumentParser] 解析失败: ${response.status_message}`);
        return {
          success: false,
          error: response.status_message || '文档解析失败',
        };
      }

      // 提取文本内容
      const textItems = response.content.filter(item => item.type === 'text');
      const fullContent = textItems
        .map(item => item.text)
        .filter(Boolean)
        .join('\n\n');

      // 解析章节结构
      const sections = this.extractSections(fullContent);

      const document: ParsedDocument = {
        title: response.title || this.extractTitle(fullContent) || '未命名文档',
        content: fullContent,
        sections,
        metadata: {
          fileType: response.filetype || 'unknown',
          wordCount: this.countWords(fullContent),
          charCount: fullContent.length,
        },
      };

      return {
        success: true,
        document,
      };
    } catch (error) {
      console.error('文档解析失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '文档解析失败',
      };
    }
  }

  /**
   * 从文件内容解析文档（本地文件）
   */
  async parseFromFile(
    file: File,
    content: string
  ): Promise<ParseResult> {
    try {
      const sections = this.extractSections(content);
      const title = this.extractTitle(content) || file.name.replace(/\.[^/.]+$/, '');

      const document: ParsedDocument = {
        title,
        content,
        sections,
        metadata: {
          fileType: file.type || this.getFileType(file.name),
          wordCount: this.countWords(content),
          charCount: content.length,
        },
      };

      return {
        success: true,
        document,
      };
    } catch (error) {
      console.error('文件解析失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '文件解析失败',
      };
    }
  }

  /**
   * 解析招标文档特殊结构
   */
  async parseTenderDocument(content: string): Promise<{
    sections: DocumentSection[];
    requirements: TenderRequirement[];
    scoringItems: ScoringItem[];
    risks: TenderRisk[];
  }> {
    const sections = this.extractSections(content);
    const requirements = this.extractRequirements(content);
    const scoringItems = this.extractScoringItems(content);
    const risks = this.extractRisks(content);

    return {
      sections,
      requirements,
      scoringItems,
      risks,
    };
  }

  /**
   * 提取文档章节
   */
  private extractSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const lines = content.split('\n');
    
    // 章节标题匹配模式
    const sectionPatterns = [
      /^第[一二三四五六七八九十百]+[章节部分条]/,  // 中文章节
      /^[一二三四五六七八九十]+[、.．]/,          // 中文数字列表
      /^\d+(\.\d+)*[、.．\s]/,                    // 数字编号
      /^【[^】]+】/,                              // 方括号标题
      /^#+\s+.+/,                                 // Markdown标题
    ];

    let currentSection: DocumentSection | null = null;
    let contentBuffer: string[] = [];
    let sectionIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      let isSectionTitle = false;
      let level = 0;

      // 检查是否为章节标题
      for (let p = 0; p < sectionPatterns.length; p++) {
        if (sectionPatterns[p].test(line)) {
          isSectionTitle = true;
          level = p + 1;
          break;
        }
      }

      if (isSectionTitle && line.length > 0) {
        // 保存上一个章节
        if (currentSection) {
          currentSection.content = contentBuffer.join('\n').trim();
          currentSection.endIndex = i - 1;
          sections.push(currentSection);
        }

        // 开始新章节
        currentSection = {
          id: `section-${sectionIndex++}`,
          title: line,
          content: '',
          level,
          startIndex: i,
          endIndex: i,
        };
        contentBuffer = [];
      } else if (currentSection) {
        contentBuffer.push(lines[i]);
      }
    }

    // 保存最后一个章节
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n').trim();
      currentSection.endIndex = lines.length - 1;
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * 提取招标要求
   */
  private extractRequirements(content: string): TenderRequirement[] {
    const requirements: TenderRequirement[] = [];
    const patterns = [
      /(?:投标人|供应商|乙方)[^。？！]*应当[^。？！]+[。？！]/g,
      /(?:要求|须|必须|应当)[^。？！]*[。？！]/g,
      /(?:资质|资格|条件)[^。？！]*[。？！]/g,
    ];

    let index = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        requirements.push({
          id: `req-${index++}`,
          content: match.trim(),
          type: this.categorizeRequirement(match),
          isRequired: true,
        });
      }
    }

    return requirements;
  }

  /**
   * 提取评分项
   */
  private extractScoringItems(content: string): ScoringItem[] {
    const scoringItems: ScoringItem[] = [];
    
    // 评分项匹配模式
    const patterns = [
      /(\d+(?:\.\d+)?)\s*[分点][^。？！]*(?:[。？！]|$)/g,
      /评分[标准细则]*[^。？！]*[。？！]/g,
      /(?:技术|商务|价格)[^。？！]*评分[^。？！]*[。？！]/g,
    ];

    let index = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        const scoreMatch = match.match(/(\d+(?:\.\d+)?)/);
        const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

        scoringItems.push({
          id: `score-${index++}`,
          content: match.trim(),
          maxScore: score,
          type: this.categorizeScoringItem(match),
        });
      }
    }

    return scoringItems;
  }

  /**
   * 提取废标风险
   */
  private extractRisks(content: string): TenderRisk[] {
    const risks: TenderRisk[] = [];
    
    // 废标条款匹配模式
    const patterns = [
      /(?:废标|无效|否决)[^。？！]*[。？！]/g,
      /(?:有下列|具有|存在)[^。？！]*(?:情形|行为)[^。？！]*(?:废标|无效)[^。？！]*[。？！]/g,
      /(?:不符合|不满足)[^。？！]*(?:要求|条件)[^。？！]*[。？！]/g,
    ];

    let index = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        risks.push({
          id: `risk-${index++}`,
          content: match.trim(),
          severity: this.assessRiskSeverity(match),
          type: 'disqualification',
        });
      }
    }

    return risks;
  }

  /**
   * 分类要求类型
   */
  private categorizeRequirement(text: string): string {
    if (/资质|资格|证书|认证/.test(text)) return 'qualification';
    if (/经验|业绩|案例/.test(text)) return 'experience';
    if (/人员|团队|技术/.test(text)) return 'technical';
    if (/服务|售后|响应/.test(text)) return 'service';
    if (/价格|报价|成本/.test(text)) return 'price';
    return 'other';
  }

  /**
   * 分类评分项类型
   */
  private categorizeScoringItem(text: string): string {
    if (/技术|方案|实施|功能/.test(text)) return 'technical';
    if (/商务|资质|经验|业绩/.test(text)) return 'business';
    if (/价格|报价|成本/.test(text)) return 'price';
    return 'other';
  }

  /**
   * 评估风险严重程度
   */
  private assessRiskSeverity(text: string): 'critical' | 'high' | 'medium' | 'low' {
    if (/废标|无效|否决|拒绝/.test(text)) return 'critical';
    if (/不符合|不满足|缺少/.test(text)) return 'high';
    if (/警告|扣分|降级/.test(text)) return 'medium';
    return 'low';
  }

  /**
   * 提取文档标题
   */
  private extractTitle(content: string): string | null {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    // 尝试从前几行找标题
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (line.length > 5 && line.length < 100) {
        // 排除明显的非标题行
        if (!/^[0-9\s\.\-]+$/.test(line)) {
          return line;
        }
      }
    }

    return null;
  }

  /**
   * 统计字数
   */
  private countWords(text: string): number {
    // 中文按字符计算，英文按单词计算
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  /**
   * 获取文件类型
   */
  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      md: 'text/markdown',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}

// 辅助类型定义
interface TenderRequirement {
  id: string;
  content: string;
  type: string;
  isRequired: boolean;
}

interface ScoringItem {
  id: string;
  content: string;
  maxScore: number;
  type: string;
}

interface TenderRisk {
  id: string;
  content: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
}

/**
 * 创建文档解析器实例
 */
export function createDocumentParser(headers?: Headers | Record<string, string>): DocumentParser {
  let customHeaders: Record<string, string> | undefined;
  
  if (headers) {
    if (typeof HeaderUtils.extractForwardHeaders === 'function') {
      customHeaders = HeaderUtils.extractForwardHeaders(headers);
      console.log(`[DocumentParser] 提取到 ${Object.keys(customHeaders || {}).length} 个自定义请求头`);
    } else {
      console.warn(`[DocumentParser] HeaderUtils.extractForwardHeaders 不可用`);
    }
  } else {
    console.warn(`[DocumentParser] 未传入 headers 参数`);
  }

  return new DocumentParser(customHeaders);
}
