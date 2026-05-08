import { NextRequest, NextResponse } from 'next/server';
import { createDocumentByFile } from '@/lib/services/coze-api-client';
import { KnowledgeClient } from 'coze-coding-dev-sdk';

export const maxDuration = 300;

/**
 * 上传文件到扣子知识库（双写机制）
 * 
 * 1. 通过官方 Coze Open API (api.coze.cn) 上传文件 → 用于文档管理和预览
 * 2. 通过 SDK batch_import (integration.coze.cn) 导入提取的文本 → 用于向量搜索
 * 
 * 对于文件上传，SDK batch_import 不支持直接上传文件，
 * 因此需要先从文件中提取文本，再通过 batch_import 导入。
 * 文本提取逻辑：根据文件类型使用不同方法（txt直接读取，其他类型使用官方API处理后的内容）
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

    // Step 1: 通过官方 API 上传文件
    const docTitle = title || fileName.replace(/\.[^/.]+$/, '');
    const result = await createDocumentByFile(
      datasetId,
      docTitle,
      fileBase64,
      fileType,
      chunkStrategy
    );

    // Step 2: 尝试通过 SDK batch_import 导入到搜索空间
    let sdkDocIds: string[] = [];
    let sdkImportMsg = '';

    try {
      // 对于文本文件（.txt, .md, .csv），可以直接读取内容并导入
      if (['.txt', '.md', '.csv'].includes(fileExtension)) {
        const textContent = fileBuffer.toString('utf-8');
        if (textContent.trim()) {
          const client = new KnowledgeClient();
          const sdkResult = await client.addDocuments(
            [{ source: 0, raw_data: textContent }],
            datasetId,  // 使用 dataset_id 作为表名
            { separator: '\n', max_tokens: 800 },
          );
          sdkDocIds = sdkResult.doc_ids || [];
          sdkImportMsg = sdkDocIds.length > 0 ? `，已同步到搜索空间` : '';
        }
      } else {
        // 对于非文本文件（PDF, docx等），SDK 不支持直接导入
        // 这些文档将通过官方 API 的 doc_tree_tos_url 获取内容后，
        // 在搜索时直接从官方 API 文档列表匹配
        // 未来可以增加异步回填机制：等待官方 API 处理完成后下载内容再导入
        sdkImportMsg = '（文件类型暂不支持搜索空间同步）';
      }
    } catch (sdkErr) {
      console.warn('[Coze Upload] SDK 导入失败（不影响官方API上传）:', sdkErr);
      sdkImportMsg = '，搜索空间同步失败';
    }

    return NextResponse.json({
      success: true,
      data: {
        official: result,
        sdk_doc_ids: sdkDocIds,
      },
      message: `文件「${fileName}」已上传，正在后台处理${sdkImportMsg}`,
    });
  } catch (error) {
    console.error('[Coze Knowledge] 文件上传失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '文件上传失败' },
      { status: 500 }
    );
  }
}
