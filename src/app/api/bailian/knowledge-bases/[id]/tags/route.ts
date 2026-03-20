/**
 * 知识库标签API
 * 
 * 说明：百炼知识库没有独立的标签管理API，标签是文档上传时的属性
 * 本API通过聚合文档列表中的标签信息来提供标签功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * GET /api/bailian/knowledge-bases/[id]/tags
 * 获取知识库的所有标签（从文档列表中聚合）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = await createBailianKnowledgeService();
    
    // 获取知识库的所有文档
    const docsResult = await service.listKnowledgeBaseDocuments({
      knowledgeBaseId: id,
      limit: 1000, // 获取足够多的文档来聚合标签
    });

    if (!docsResult.success) {
      return NextResponse.json({
        success: false,
        error: docsResult.message || '获取文档列表失败',
      });
    }

    // 从文档中聚合标签
    const tagMap = new Map<string, { id: string; name: string; document_count: number }>();
    
    if (docsResult.data?.documents) {
      for (const doc of docsResult.data.documents) {
        // 文档的标签可能在 metadata.tags 或直接在 tags 字段
        const tags = (doc as any).tags || (doc as any).metadata?.tags || [];
        
        if (Array.isArray(tags)) {
          for (const tag of tags) {
            const tagName = typeof tag === 'string' ? tag : tag.name || String(tag);
            if (tagName) {
              if (tagMap.has(tagName)) {
                tagMap.get(tagName)!.document_count++;
              } else {
                tagMap.set(tagName, {
                  id: tagName, // 使用标签名作为ID
                  name: tagName,
                  document_count: 1,
                });
              }
            }
          }
        }
      }
    }

    const tags = Array.from(tagMap.values());

    return NextResponse.json({
      success: true,
      data: tags,
    });
  } catch (error: any) {
    console.error('[Bailian API] Get tags failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取标签失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bailian/knowledge-bases/[id]/tags
 * 创建标签（仅返回标签信息，实际上传文档时使用）
 * 
 * 注意：百炼没有独立的标签创建API，标签是在上传文档时设置的
 * 这个接口主要用于前端展示和验证
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, color = '#3b82f6' } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: '标签名称不能为空' },
        { status: 400 }
      );
    }

    // 百炼不支持独立创建标签，直接返回标签信息
    // 实际使用标签是在上传文档时通过 tags 参数传递
    return NextResponse.json({
      success: true,
      data: {
        id: name,
        name,
        color,
        document_count: 0,
      },
      message: '标签信息已创建，请在上传文档时使用此标签名',
    });
  } catch (error: any) {
    console.error('[Bailian API] Create tag failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '创建标签失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bailian/knowledge-bases/[id]/tags
 * 删除标签（软删除，仅从前端列表移除）
 * 
 * 注意：百炼不支持独立删除标签，标签是文档的属性
 * 此接口仅返回成功，实际删除需要从所有文档中移除该标签
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const tagId = url.searchParams.get('tagId');

    if (!tagId) {
      return NextResponse.json(
        { success: false, error: '标签ID不能为空' },
        { status: 400 }
      );
    }

    // 百炼不支持独立删除标签
    // 要真正删除标签，需要从所有包含该标签的文档中移除
    // 这里我们只返回成功，前端会从本地列表中移除
    console.log(`[Bailian API] 标签删除请求: ${tagId}，注意：标签是文档属性，需要从文档中移除`);

    return NextResponse.json({
      success: true,
      message: '标签已从列表中移除。注意：标签是文档属性，要从知识库中彻底删除，请在上传新文档时不再使用该标签。',
    });
  } catch (error: any) {
    console.error('[Bailian API] Delete tag failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '删除标签失败' },
      { status: 500 }
    );
  }
}
