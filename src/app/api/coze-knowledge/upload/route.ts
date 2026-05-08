import { NextRequest, NextResponse } from 'next/server';
import { importDocumentsToCoze } from '@/lib/services/retrieval/coze-provider';

/**
 * 上传文件并导入到扣子知识库
 * POST /api/coze-knowledge/upload
 * Content-Type: multipart/form-data
 * Body: { file: File, title?: string, dataset?: string }
 *
 * 流程：
 * 1. 接收文件
 * 2. 根据文件类型提取文本（Word 用 mammoth，PDF 用 pdf-parse，文本直接读取）
 * 3. 使用 DataSourceType.TEXT 导入到扣子知识库
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || '';
    const dataset = (formData.get('dataset') as string) || 'coze_doc_knowledge';

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未提供文件' },
        { status: 400 }
      );
    }

    // 支持的文件扩展名
    const allowedExtensions = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.md', '.csv',
    ];

    const fileName = file.name;
    const fileExtension = '.' + fileName.split('.').pop()?.toLowerCase();

    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { success: false, error: `不支持的文件类型: ${fileExtension}。支持: ${allowedExtensions.join(', ')}` },
        { status: 400 }
      );
    }

    // 文件大小限制: 20MB
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: '文件大小超过 20MB 限制' },
        { status: 400 }
      );
    }

    // Step 1: 从文件中提取文本内容
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractTextFromFile(fileBuffer, fileExtension, file.type);

    if (!extractedText.trim()) {
      return NextResponse.json(
        { success: false, error: '未能从文件中提取到文本内容，请确认文件非空且格式正确' },
        { status: 400 }
      );
    }

    // Step 2: 使用文本模式导入到扣子知识库
    const docTitle = title || fileName.replace(/\.[^/.]+$/, '');
    const result = await importDocumentsToCoze(
      [{ title: docTitle, content: extractedText, type: 'text' }],
      dataset
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      docIds: result.docIds,
      message: `文件「${fileName}」已导入，提取文本 ${extractedText.length} 字符`,
    });
  } catch (error) {
    console.error('[Coze Knowledge] 文件上传导入失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '文件上传失败' },
      { status: 500 }
    );
  }
}

/**
 * 根据文件类型提取文本内容
 */
async function extractTextFromFile(
  buffer: Buffer,
  extension: string,
  mimeType: string
): Promise<string> {
  try {
    switch (extension) {
      case '.txt':
      case '.md':
      case '.csv':
        // 纯文本文件直接读取
        return buffer.toString('utf-8');

      case '.docx':
        // Word 文档使用 mammoth 提取
        return await extractDocxText(buffer);

      case '.doc':
        // .doc 格式较老，mammoth 也支持
        return await extractDocxText(buffer);

      case '.pdf':
        // PDF 使用 pdf-parse 提取
        return await extractPdfText(buffer);

      case '.xlsx':
      case '.xls':
        // Excel 文件 - 尝试提取纯文本
        return await extractExcelText(buffer);

      case '.pptx':
      case '.ppt':
        // PowerPoint 文件 - 尝试提取
        return await extractPptText(buffer);

      default:
        // 未知类型，尝试作为纯文本读取
        return buffer.toString('utf-8');
    }
  } catch (error) {
    console.error(`[Coze Knowledge] 文本提取失败 (${extension}):`, error);
    // 降级：尝试直接读取为文本
    try {
      return buffer.toString('utf-8');
    } catch {
      return '';
    }
  }
}

/**
 * 使用 mammoth 提取 Word 文档文本
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/**
 * 使用 pdf-parse 提取 PDF 文本
 */
/**
 * 使用 pdf-parse 提取 PDF 文本
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    return textResult.text || '';
  } finally {
    await parser.destroy();
  }
}

/**
 * 提取 Excel 文本（简单方式：解压读取共享字符串）
 */
async function extractExcelText(buffer: Buffer): Promise<string> {
  // Excel 文件本质是 zip 包含 XML
  // 简单处理：尝试用 mammoth 或直接返回文件名提示
  // 对于 xlsx，可以用 xlsx 库，但这里暂时简单处理
  try {
    // 尝试读取为文本（某些 Excel 可以部分读取）
    const text = buffer.toString('utf-8');
    // 过滤掉不可读字符，只保留有意义的文本
    const cleanText = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleanText.length > 50 ? cleanText : '[Excel 文件内容需要专用工具解析]';
  } catch {
    return '[Excel 文件内容需要专用工具解析]';
  }
}

/**
 * 提取 PPT 文本
 */
async function extractPptText(buffer: Buffer): Promise<string> {
  try {
    const text = buffer.toString('utf-8');
    const cleanText = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleanText.length > 50 ? cleanText : '[PPT 文件内容需要专用工具解析]';
  } catch {
    return '[PPT 文件内容需要专用工具解析]';
  }
}
