import { NextRequest, NextResponse } from 'next/server';
import {
  listDocuments,
  createDocumentByText,
  createDocumentByUrl,
  createDocumentByFile,
  deleteDocuments,
  getDatasetProcess,
} from '@/lib/services/coze-api-client';

export const maxDuration = 300;

/**
 * GET /api/coze-knowledge/documents - 获取知识库文件列表或查询处理进度
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get('dataset_id');
    const action = searchParams.get('action'); // 'progress' for checking progress
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '20', 10);

    if (!datasetId) {
      return NextResponse.json(
        { success: false, error: 'dataset_id 不能为空' },
        { status: 400 }
      );
    }

    // 查询处理进度
    if (action === 'progress') {
      const documentIds = searchParams.get('document_ids')?.split(',').filter(Boolean);
      const processInfo = await getDatasetProcess(datasetId, documentIds);
      return NextResponse.json({
        success: true,
        data: processInfo,
      });
    }

    // 获取文件列表
    const result = await listDocuments(datasetId, page, pageSize);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Coze Documents] 获取文件列表失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取文件列表失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coze-knowledge/documents - 创建知识库文件（文本/URL/Base64文件）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataset_id, source_type, title, content, url, file_base64, file_type, chunk_strategy } = body;

    if (!dataset_id) {
      return NextResponse.json(
        { success: false, error: 'dataset_id 不能为空' },
        { status: 400 }
      );
    }

    let result: { id: string; name: string }[] = [];

    if (source_type === 'text' || source_type === undefined) {
      // 文本内容导入
      if (!content) {
        return NextResponse.json(
          { success: false, error: '文本内容不能为空' },
          { status: 400 }
        );
      }
      result = await createDocumentByText(
        dataset_id,
        title || '文本导入',
        content,
        chunk_strategy
      );
    } else if (source_type === 'url') {
      // URL 导入
      if (!url) {
        return NextResponse.json(
          { success: false, error: 'URL 不能为空' },
          { status: 400 }
        );
      }
      result = await createDocumentByUrl(
        dataset_id,
        title || new URL(url).hostname,
        url,
        chunk_strategy
      );
    } else if (source_type === 'file') {
      // Base64 文件上传
      if (!file_base64) {
        return NextResponse.json(
          { success: false, error: '文件数据不能为空' },
          { status: 400 }
        );
      }
      result = await createDocumentByFile(
        dataset_id,
        title || '文件上传',
        file_base64,
        file_type || 'pdf',
        chunk_strategy
      );
    } else {
      return NextResponse.json(
        { success: false, error: '不支持的 source_type' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Coze Documents] 创建文件失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建文件失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coze-knowledge/documents - 删除知识库文件
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataset_id, document_ids } = body;

    if (!dataset_id) {
      return NextResponse.json(
        { success: false, error: 'dataset_id 不能为空' },
        { status: 400 }
      );
    }

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'document_ids 不能为空' },
        { status: 400 }
      );
    }

    await deleteDocuments(dataset_id, document_ids);

    return NextResponse.json({
      success: true,
      message: `已删除 ${document_ids.length} 个文件`,
    });
  } catch (error) {
    console.error('[Coze Documents] 删除文件失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除文件失败' },
      { status: 500 }
    );
  }
}
