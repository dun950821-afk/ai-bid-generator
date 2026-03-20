/**
 * 百炼标签历史 API
 * GET: 获取所有标签列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取所有标签
 * @description 遍历所有文件获取唯一的标签列表
 */
export async function GET(request: NextRequest) {
  try {
    const service = await createBailianKnowledgeService();
    const result = await service.getAllTags();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data || [],
    });
  } catch (error: any) {
    console.error('[Bailian API] Get tags history failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取标签失败' },
      { status: 500 }
    );
  }
}
