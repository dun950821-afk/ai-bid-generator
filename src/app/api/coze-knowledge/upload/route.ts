import { NextRequest, NextResponse } from 'next/server';
import { createDocumentByFile } from '@/lib/services/coze-api-client';

export const maxDuration = 300;

/**
 * 上传文件到扣子知识库（使用官方 Coze Open API）
 * POST /api/coze-knowledge/upload
 * Content-Type: multipart/form-data
 * Body: { file: File, dataset_id: string, title?: string, chunk_strategy? }
 *
 * 流程：
 * 1. 接收文件
 * 2. 根据文件类型提取文本（Word 用 mammoth，PDF 用 pdf-parse，文本直接读取）
 * 3. 将文件 Base64 编码后通过官方 API 上传
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || '';
    const datasetId = (formData.get('dataset_id') as string) || '';
    const chunkStrategyStr = formData.get('chunk_strategy') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未提供文件' },
        { status: 400 }
      );
    }

    if (!datasetId) {
      return NextResponse.json(
        { success: false, error: '必须提供 dataset_id（知识库 ID）' },
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

    // 解析分块策略
    let chunkStrategy: { chunk_type?: number; separator?: string; max_tokens?: number } | undefined;
    if (chunkStrategyStr) {
      try {
        chunkStrategy = JSON.parse(chunkStrategyStr);
      } catch {
        // 忽略解析失败
      }
    }

    // 将文件转为 Base64
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileBase64 = fileBuffer.toString('base64');

    // 确定 file_type 参数（Coze API 使用的文件类型标识）
    const fileTypeMap: Record<string, string> = {
      '.pdf': 'pdf',
      '.doc': 'doc',
      '.docx': 'docx',
      '.xls': 'xls',
      '.xlsx': 'xlsx',
      '.ppt': 'ppt',
      '.pptx': 'pptx',
      '.txt': 'txt',
      '.md': 'txt',
      '.csv': 'csv',
    };
    const fileType = fileTypeMap[fileExtension] || 'txt';

    // 通过官方 API 上传文件
    const docTitle = title || fileName.replace(/\.[^/.]+$/, '');
    const result = await createDocumentByFile(
      datasetId,
      docTitle,
      fileBase64,
      fileType,
      chunkStrategy
    );

    return NextResponse.json({
      success: true,
      data: result,
      message: `文件「${fileName}」已上传，正在后台处理`,
    });
  } catch (error) {
    console.error('[Coze Knowledge] 文件上传失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '文件上传失败' },
      { status: 500 }
    );
  }
}
