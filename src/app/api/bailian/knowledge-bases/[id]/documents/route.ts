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
 * @description 从百炼API获取文档列表，通过取数据中心文件和知识库文档的交集获取完整标签信息
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
      // ========== 并行获取知识库文档和数据中心文件 ==========
      
      // 1. 获取知识库文档列表
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
          if (allDocuments.length > 0) break;
          return NextResponse.json(result);
        }
        
        allDocuments = allDocuments.concat(result.data.documents || []);
        
        const total = result.data.total || 0;
        hasMore = allDocuments.length < total && allDocuments.length < 500;
        pageNumber++;
      }
      
      // 2. 获取数据中心所有文件（带标签）
      const dataCenterFilesMap = new Map<string, string[]>();
      let nextToken: string | undefined;
      let hasMoreFiles = true;
      
      while (hasMoreFiles) {
        const filesResult = await service.listDataCenterFiles({
          nextToken,
          maxResults: 100,
        });
        
        if (filesResult.success && filesResult.data) {
          for (const file of filesResult.data.files) {
            // service 返回的文件对象中 id 即为 fileId
            if (file.id && file.tags && file.tags.length > 0) {
              dataCenterFilesMap.set(file.id, file.tags);
            }
          }
          hasMoreFiles = filesResult.data.hasNext;
          nextToken = filesResult.data.nextToken;
        } else {
          hasMoreFiles = false;
        }
      }
      
      // 3. 取交集：将标签信息合并到文档列表
      const documentsWithTags = allDocuments.map((doc) => {
        // doc.id 就是 fileId（ListIndexDocuments 返回的 id 即为 file_xxx 格式）
        const fileId = doc.id || doc.fileId || doc.file_id;
        const tags = fileId ? dataCenterFilesMap.get(fileId) : null;
        
        // 如果数据中心有该文件的标签，使用数据中心的标签
        if (tags && tags.length > 0) {
          return {
            ...doc,
            tags: tags.map((t: string) => ({
              id: t,
              name: t,
              color: '#3b82f6',
            })),
          };
        }
        
        // 否则保留原有标签
        if (doc.tags && doc.tags.length > 0) {
          return {
            ...doc,
            tags: Array.isArray(doc.tags) 
              ? doc.tags.map((t: any) => ({
                  id: typeof t === 'string' ? t : t.id || t.name,
                  name: typeof t === 'string' ? t : t.name || t.id,
                  color: typeof t === 'string' ? '#3b82f6' : t.color || '#3b82f6',
                }))
              : [],
          };
        }
        
        return doc;
      });
      
      return NextResponse.json({
        success: true,
        data: {
          documents: documentsWithTags,
          total: documentsWithTags.length,
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
