/**
 * 文档分块服务
 * 将长文档智能分割成适合向量化的文本块
 * 优化：实现递归字符文本分割（RecursiveCharacterTextSplitter）
 * 修复：块大小控制、分隔符保留逻辑
 */

export interface ChunkOptions {
  chunkSize: number;          // 目标块大小（字符数）
  chunkOverlap: number;       // 块之间的重叠字符数
  separators: string[];       // 分隔符优先级
  keepSeparator: boolean;     // 是否保留分隔符
  respectStructure: boolean;  // 是否尊重文档结构
}

export interface TextChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  documentId: string;
  source: string;
  chunkIndex: number;
  startIndex: number;
  endIndex: number;
  sectionTitle?: string;
  sectionLevel?: number;
  wordCount: number;
  charCount: number;
}

// 默认分隔符优先级：从大到小
const DEFAULT_SEPARATORS = [
  '\n\n',     // 段落分隔（最优先）
  '\n',       // 换行
  '。',       // 中文句号
  '！',       // 中文感叹号
  '？',       // 中文问号
  '；',       // 中文分号
  '，',       // 中文逗号
  '.',        // 英文句号
  '!',        // 英文感叹号
  '?',        // 英文问号
  ';',        // 英文分号
  ',',        // 英文逗号
  ' ',        // 空格
  '',         // 最后强制按字符分割
];

const DEFAULT_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  chunkOverlap: 50,
  separators: DEFAULT_SEPARATORS,
  keepSeparator: true,
  respectStructure: true,
};

/**
 * 文档分块器类
 * 优化：使用递归分割算法，优先按语义边界分割
 */
export class DocumentChunker {
  private options: ChunkOptions;

  constructor(options: Partial<ChunkOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 分块文档
   */
  chunkDocument(
    documentId: string,
    content: string,
    sections?: Array<{ title: string; content: string; level: number }>
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;

    if (this.options.respectStructure && sections && sections.length > 0) {
      // 按章节结构分块
      for (const section of sections) {
        const sectionChunks = this.chunkSection(
          documentId,
          section.title,
          section.content,
          section.level,
          chunkIndex
        );
        chunks.push(...sectionChunks);
        chunkIndex += sectionChunks.length;
      }
    } else {
      // 直接按内容分块
      const contentChunks = this.splitTextRecursive(content);
      for (let i = 0; i < contentChunks.length; i++) {
        chunks.push({
          id: `${documentId}-chunk-${i}`,
          content: contentChunks[i],
          metadata: {
            documentId,
            source: '',
            chunkIndex: i,
            startIndex: 0,
            endIndex: contentChunks[i].length,
            wordCount: this.countWords(contentChunks[i]),
            charCount: contentChunks[i].length,
          },
        });
      }
    }

    return chunks;
  }

  /**
   * 分块章节内容
   */
  private chunkSection(
    documentId: string,
    sectionTitle: string,
    content: string,
    sectionLevel: number,
    startIndex: number
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const textChunks = this.splitTextRecursive(content);

    for (let i = 0; i < textChunks.length; i++) {
      chunks.push({
        id: `${documentId}-chunk-${startIndex + i}`,
        content: textChunks[i],
        metadata: {
          documentId,
          source: sectionTitle,
          chunkIndex: startIndex + i,
          startIndex: 0,
          endIndex: textChunks[i].length,
          sectionTitle,
          sectionLevel,
          wordCount: this.countWords(textChunks[i]),
          charCount: textChunks[i].length,
        },
      });
    }

    return chunks;
  }

  /**
   * 递归分割文本（核心算法）
   * 优化实现：类似 LangChain 的 RecursiveCharacterTextSplitter
   */
  private splitTextRecursive(text: string): string[] {
    // 如果文本已经足够小，直接返回
    if (text.length <= this.options.chunkSize) {
      return [text.trim()].filter(s => s.length > 0);
    }

    // 使用递归分割
    const finalChunks: string[] = this.recursiveSplit(
      text,
      this.options.separators
    );

    // 添加块重叠（修复：确保总大小不超过 chunkSize）
    return this.addOverlap(finalChunks);
  }

  /**
   * 递归分割核心逻辑
   */
  private recursiveSplit(
    text: string,
    separators: string[]
  ): string[] {
    // 基础情况：文本已经足够小
    if (text.length <= this.options.chunkSize) {
      return [text.trim()].filter(s => s.length > 0);
    }

    // 没有更多分隔符可用，强制按字符分割
    if (separators.length === 0) {
      return this.forceSplit(text);
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    // 空分隔符，强制分割
    if (separator === '') {
      return this.forceSplit(text);
    }

    // 按当前分隔符分割
    const splits = text.split(separator);
    const goodSplits: string[] = [];
    const finalChunks: string[] = [];

    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];

      if (split.length === 0) continue;

      // 如果分割后的片段仍然太大，需要进一步分割
      if (split.length > this.options.chunkSize) {
        // 先保存之前积累的小片段
        if (goodSplits.length > 0) {
          const merged = this.mergeSplits(goodSplits, separator);
          finalChunks.push(...merged);
          goodSplits.length = 0;
        }

        // 递归使用剩余分隔符继续分割
        const subChunks = this.recursiveSplit(split, remainingSeparators);
        finalChunks.push(...subChunks);
      } else {
        // 检查是否可以合并到当前块
        const potentialMerge = goodSplits.length > 0
          ? goodSplits.join(separator) + separator + split
          : split;

        if (potentialMerge.length <= this.options.chunkSize) {
          goodSplits.push(split);
        } else {
          // 当前块已满，保存并开始新块
          if (goodSplits.length > 0) {
            const merged = this.mergeSplits(goodSplits, separator);
            finalChunks.push(...merged);
          }
          goodSplits.length = 0;
          goodSplits.push(split);
        }
      }
    }

    // 处理剩余的片段
    if (goodSplits.length > 0) {
      const merged = this.mergeSplits(goodSplits, separator);
      finalChunks.push(...merged);
    }

    return finalChunks.filter(s => s.length > 0);
  }

  /**
   * 合并分割片段
   * 修复：最后一个元素不加分隔符
   */
  private mergeSplits(splits: string[], separator: string): string[] {
    if (splits.length === 0) return [];

    const result: string[] = [];
    let currentChunk = splits[0];

    for (let i = 1; i < splits.length; i++) {
      // 修复：只在非换行符分隔符且保留分隔符时添加
      const shouldAddSeparator = this.options.keepSeparator 
        && separator !== '\n' 
        && separator !== '\n\n';
      
      const split = shouldAddSeparator ? splits[i] : splits[i];
      const potentialChunk = shouldAddSeparator 
        ? currentChunk + separator + split 
        : currentChunk + separator + split;

      if (potentialChunk.length <= this.options.chunkSize) {
        currentChunk = potentialChunk;
      } else {
        result.push(currentChunk.trim());
        currentChunk = split;
      }
    }

    if (currentChunk.length > 0) {
      result.push(currentChunk.trim());
    }

    return result;
  }

  /**
   * 添加块重叠
   * 修复：确保总大小不超过 chunkSize
   */
  private addOverlap(chunks: string[]): string[] {
    if (chunks.length <= 1 || this.options.chunkOverlap === 0) {
      return chunks;
    }

    const result: string[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      // 如果不是第一个块，从上一个块的末尾取重叠部分
      if (i > 0 && this.options.chunkOverlap > 0) {
        const prevChunk = chunks[i - 1];
        const overlap = this.getLastNChars(prevChunk, this.options.chunkOverlap);
        
        // 修复：确保总大小不超过 chunkSize
        // 如果当前块 + 重叠超过 chunkSize，需要截断当前块
        if (overlap.length + chunk.length > this.options.chunkSize) {
          const maxNewContent = this.options.chunkSize - overlap.length;
          chunk = overlap + chunk.slice(0, maxNewContent);
        } else {
          chunk = overlap + chunk;
        }
      }

      result.push(chunk);
    }

    return result;
  }

  /**
   * 强制分割（按字符数）
   */
  private forceSplit(text: string): string[] {
    const chunks: string[] = [];
    const chunkSize = this.options.chunkSize;
    const overlap = this.options.chunkOverlap;

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      
      // 避免无限循环
      if (i + chunkSize >= text.length) {
        break;
      }
    }

    return chunks.filter(s => s.length > 0);
  }

  /**
   * 获取最后N个字符
   */
  private getLastNChars(text: string, n: number): string {
    if (text.length <= n) return text;
    return text.slice(-n);
  }

  /**
   * 统计字数
   */
  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
}

/**
 * 创建文档分块器实例
 */
export function createDocumentChunker(options?: Partial<ChunkOptions>): DocumentChunker {
  return new DocumentChunker(options);
}

/**
 * 智能分块策略
 */
export const ChunkStrategies = {
  /**
   * 小块策略 - 适合精确检索
   */
  small: {
    chunkSize: 300,
    chunkOverlap: 30,
  },

  /**
   * 中等块策略 - 平衡检索和上下文
   */
  medium: {
    chunkSize: 500,
    chunkOverlap: 50,
  },

  /**
   * 大块策略 - 保留更多上下文
   */
  large: {
    chunkSize: 800,
    chunkOverlap: 100,
  },

  /**
   * 招标文档策略 - 尊重结构
   */
  tender: {
    chunkSize: 600,
    chunkOverlap: 80,
    respectStructure: true,
  },
};
