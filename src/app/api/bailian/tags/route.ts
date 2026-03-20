/**
 * 百炼标签聚合API
 * GET: 获取所有已使用的标签（从数据中心聚合）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * GET /api/bailian/tags
 * 获取所有已使用的标签（从数据中心文件聚合）
 * 
 * 用于文档选择器的标签筛选功能
 */
export async function GET(request: NextRequest) {
  try {
    const service = await createBailianKnowledgeService();
    
    // 直接从数据中心获取所有文件，聚合标签
    // 标签信息存储在数据中心，而不是知识库文档中
    const tagMap = new Map<string, { id: string; name: string; documentCount: number }>();
    
    let nextToken: string | undefined;
    let hasMoreFiles = true;
    
    while (hasMoreFiles) {
      const filesResult = await service.listDataCenterFiles({
        nextToken,
        maxResults: 100,
      });
      
      if (filesResult.success && filesResult.data) {
        for (const file of filesResult.data.files) {
          const tags: string[] = file.tags || [];
          
          for (const tag of tags) {
            const tagName = typeof tag === 'string' ? tag : String(tag);
            if (tagName) {
              if (tagMap.has(tagName)) {
                tagMap.get(tagName)!.documentCount++;
              } else {
                tagMap.set(tagName, {
                  id: tagName,
                  name: tagName,
                  documentCount: 1,
                });
              }
            }
          }
        }
        hasMoreFiles = filesResult.data.hasNext;
        nextToken = filesResult.data.nextToken;
      } else {
        hasMoreFiles = false;
      }
    }

    // 按文档数量排序
    const tags = Array.from(tagMap.values())
      .sort((a, b) => b.documentCount - a.documentCount);

    return NextResponse.json({
      success: true,
      data: tags,
    });
  } catch (error: any) {
    console.error('[Bailian API] Get all tags failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取标签失败' },
      { status: 500 }
    );
  }
}
