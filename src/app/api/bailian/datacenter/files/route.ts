/**
 * 百炼数据中心文件API
 * GET: 获取文件列表（支持标签过滤）
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listfile
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取数据中心文件列表
 * @description 支持按类目、文件名查询，支持标签过滤
 * 
 * Query参数:
 * - categoryId: 类目ID
 * - fileName: 文件名（精确匹配，不含后缀）
 * - maxResults: 每页数量（1-200），默认50
 * - nextToken: 分页Token
 * - tags: 标签过滤，多个标签用逗号分隔（文件包含任一标签即可）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 查询参数
    const categoryId = searchParams.get('categoryId') || undefined;
    const fileName = searchParams.get('fileName') || undefined;
    const maxResults = parseInt(searchParams.get('maxResults') || '50');
    const nextToken = searchParams.get('nextToken') || undefined;
    
    // 标签过滤参数
    const tagsParam = searchParams.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : undefined;

    const service = await createBailianKnowledgeService();
    const result = await service.listDataCenterFiles({
      categoryId,
      fileName,
      maxResults,
      nextToken,
      tags,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Get datacenter files failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文件列表失败' },
      { status: 500 }
    );
  }
}
