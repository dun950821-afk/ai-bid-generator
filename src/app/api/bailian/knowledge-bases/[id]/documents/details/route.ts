/**
 * 百炼知识库文件详情API
 * GET: 获取文件详情列表（包含分块配置等详细信息）
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindexfiledetails
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取知识库文件详情列表
 * @description 包含分块配置等详细信息
 * 
 * Query参数:
 * - limit: 每页数量，默认10（最大10）
 * - offset: 偏移量，默认0
 * - status: 文档状态过滤 (INSERT_ERROR | RUNNING | DELETED | FINISH)
 * - name: 文件名称过滤
 * - nameLike: 是否开启模糊匹配 (true/false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    // 分页参数
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 10); // 最大10
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // 过滤参数
    const status = searchParams.get('status') as 'INSERT_ERROR' | 'RUNNING' | 'DELETED' | 'FINISH' | null;
    const name = searchParams.get('name') || undefined;
    const nameLike = searchParams.get('nameLike') === 'true';

    const service = await createBailianKnowledgeService();
    const result = await service.listFileDetails({
      knowledgeBaseId: id,
      limit,
      offset,
      documentStatus: status || undefined,
      documentName: name,
      enableNameLike: nameLike,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Get file details failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文件详情失败' },
      { status: 500 }
    );
  }
}
