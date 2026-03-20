/**
 * 百炼标签聚合API
 * GET: 获取所有已使用的标签（从所有知识库聚合）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * GET /api/bailian/tags
 * 获取所有已使用的标签（从所有知识库聚合）
 * 
 * 用于文档选择器的标签筛选功能
 */
export async function GET(request: NextRequest) {
  try {
    const service = await createBailianKnowledgeService();
    
    // 1. 获取所有知识库
    const kbsResult = await service.listKnowledgeBases({ limit: 100 });
    if (!kbsResult.success || !kbsResult.data?.items) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const knowledgeBases = kbsResult.data.items || [];

    // 2. 并行获取每个知识库的文档来聚合标签
    const tagMap = new Map<string, { id: string; name: string; documentCount: number }>();

    // 并行请求所有知识库的文档
    const docPromises = knowledgeBases.map(async (kb: any) => {
      try {
        const docsResult = await service.listKnowledgeBaseDocuments({
          knowledgeBaseId: kb.id,
          limit: 500,
        });
        
        if (docsResult.success && docsResult.data?.documents) {
          return docsResult.data.documents;
        }
        return [];
      } catch (error) {
        console.error(`获取知识库 ${kb.id} 文档失败:`, error);
        return [];
      }
    });

    const allDocsArrays = await Promise.all(docPromises);
    
    // 3. 聚合所有文档的标签
    for (const docs of allDocsArrays) {
      for (const doc of docs) {
        const tags = (doc as any).tags || [];
        
        if (Array.isArray(tags)) {
          for (const tag of tags) {
            const tagName = typeof tag === 'string' ? tag : tag.name || String(tag);
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
      }
    }

    // 4. 按文档数量排序
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
