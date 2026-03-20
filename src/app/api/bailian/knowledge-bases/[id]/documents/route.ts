/**
 * 百炼知识库文档API
 * GET: 获取文档列表（从百炼API获取）
 * POST: 上传文档
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindexdocuments
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取知识库文档列表
 * @description 从百炼API获取文档列表，支持前端分页与筛选模式
 * 
 * Query参数:
 * - all: 是否获取全部文档（前端分页模式），默认 true
 * - limit: 每页数量（仅后端分页模式使用），默认500
 * - offset: 偏移量（仅后端分页模式使用），默认0
 * 
 * 注意：标签过滤、状态过滤、名称搜索已移至前端实现
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    // 获取所有文档模式（前端分页）
    const all = searchParams.get('all') !== 'false'; // 默认获取全部
    
    // 分页参数（仅在非 all 模式下使用）
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = parseInt(searchParams.get('offset') || '0');

    const service = await createBailianKnowledgeService();
    
    if (all) {
      // 前端分页模式：获取所有文档（最多500条）
      // 注意：百炼API单次最多返回100条，需要分批获取
      let allDocuments: any[] = [];
      let pageNumber = 1;
      const pageSize = 100;
      let hasMore = true;
      
      while (hasMore) {
        const result = await service.listKnowledgeBaseDocuments({
          knowledgeBaseId: id,
          limit: pageSize,
          offset: (pageNumber - 1) * pageSize,
        });
        
        if (!result.success || !result.data) {
          // 如果已经获取了一些数据，返回已获取的
          if (allDocuments.length > 0) break;
          return NextResponse.json(result);
        }
        
        allDocuments = allDocuments.concat(result.data.documents || []);
        
        // 检查是否还有更多数据
        const total = result.data.total || 0;
        hasMore = allDocuments.length < total && allDocuments.length < 500; // 最多500条
        pageNumber++;
      }
      
      return NextResponse.json({
        success: true,
        data: {
          documents: allDocuments,
          total: allDocuments.length,
        },
      });
    } else {
      // 后端分页模式（保留兼容性）
      const result = await service.listKnowledgeBaseDocuments({
        knowledgeBaseId: id,
        limit,
        offset,
      });
      
      return NextResponse.json(result);
    }
  } catch (error: any) {
    console.error('[Bailian API] Get documents failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文档列表失败' },
      { status: 500 }
    );
  }
}

/**
 * 上传文档到知识库
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const parser = formData.get('parser') as string;
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : [];

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未提供文件' },
        { status: 400 }
      );
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const service = await createBailianKnowledgeService();
    const result = await service.uploadDocument({
      knowledgeBaseId: id,
      fileBuffer,
      fileName: file.name,
      parser,
      tags,
    });

    // 如果上传成功，将文档添加到知识库
    if (result.success && result.data) {
      const docId = result.data.id;
      if (docId) {
        await service.addDocumentToKnowledgeBase({
          knowledgeBaseId: id,
          documentId: docId,
        });
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Upload document failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '上传文档失败' },
      { status: 500 }
    );
  }
}
