/**
 * 文档分块服务
 * 将长文档智能分割成适合向量化的文本块
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

const DEFAULT_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  chunkOverlap: 50,
  separators: ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', ''],
  keepSeparator: true,
  respectStructure: true,
};

/**
 * 文档分块器类
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
      const contentChunks = this.splitText(content, chunkIndex);
      chunks.push(...contentChunks);
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
    const textChunks = this.splitText(content, 0);

    for (let i = 0; i < textChunks.length; i++) {
      chunks.push({
        id: `${documentId}-chunk-${startIndex + i}`,
        content: textChunks[i].content,
        metadata: {
          documentId,
          source: sectionTitle,
          chunkIndex: startIndex + i,
          startIndex: textChunks[i].metadata.startIndex,
          endIndex: textChunks[i].metadata.endIndex,
          sectionTitle,
          sectionLevel,
          wordCount: this.countWords(textChunks[i].content),
          charCount: textChunks[i].content.length,
        },
      });
    }

    return chunks;
  }

  /**
   * 分割文本
   */
  private splitText(text: string, startIndex: number): TextChunk[] {
    const chunks: TextChunk[] = [];
    
    if (text.length <= this.options.chunkSize) {
      chunks.push({
        id: `chunk-${startIndex}`,
        content: text.trim(),
        metadata: {
          documentId: '',
          source: '',
          chunkIndex: startIndex,
          startIndex: 0,
          endIndex: text.length,
          wordCount: this.countWords(text),
          charCount: text.length,
        },
      });
      return chunks;
    }

    // 递归分割
    const splits = this.recursiveSplit(text, this.options.separators);
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    let globalIndex = startIndex;

    for (const split of splits) {
      if (currentLength + split.length > this.options.chunkSize) {
        if (currentChunk.length > 0) {
          const chunkContent = currentChunk.join('');
          chunks.push({
            id: `chunk-${globalIndex}`,
            content: chunkContent.trim(),
            metadata: {
              documentId: '',
              source: '',
              chunkIndex: globalIndex,
              startIndex: 0,
              endIndex: chunkContent.length,
              wordCount: this.countWords(chunkContent),
              charCount: chunkContent.length,
            },
          });
          globalIndex++;

          // 处理重叠
          if (this.options.chunkOverlap > 0) {
            const overlapText = this.getLastNChars(chunkContent, this.options.chunkOverlap);
            currentChunk = [overlapText];
            currentLength = overlapText.length;
          } else {
            currentChunk = [];
            currentLength = 0;
          }
        }
      }

      currentChunk.push(split);
      currentLength += split.length;
    }

    // 处理最后一个块
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('');
      chunks.push({
        id: `chunk-${globalIndex}`,
        content: chunkContent.trim(),
        metadata: {
          documentId: '',
          source: '',
          chunkIndex: globalIndex,
          startIndex: 0,
          endIndex: chunkContent.length,
          wordCount: this.countWords(chunkContent),
          charCount: chunkContent.length,
        },
      });
    }

    return chunks;
  }

  /**
   * 递归分割文本
   */
  private recursiveSplit(text: string, separators: string[]): string[] {
    if (text.length <= this.options.chunkSize) {
      return [text];
    }

    if (separators.length === 0) {
      // 强制分割
      return this.forceSplit(text);
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    if (separator === '') {
      return this.forceSplit(text);
    }

    const splits = text.split(separator);
    const result: string[] = [];

    for (const split of splits) {
      if (split.length === 0) continue;

      if (split.length <= this.options.chunkSize) {
        result.push(this.options.keepSeparator && separator !== '\n' ? split + separator : split);
      } else {
        const subSplits = this.recursiveSplit(split, remainingSeparators);
        result.push(...subSplits);
      }
    }

    return result;
  }

  /**
   * 强制分割（按字符数）
   */
  private forceSplit(text: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += this.options.chunkSize) {
      chunks.push(text.slice(i, i + this.options.chunkSize));
    }
    return chunks;
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
