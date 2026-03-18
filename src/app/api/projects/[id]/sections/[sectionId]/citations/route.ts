/**
 * 章节引用列表API
 * 获取章节内容的引用溯源信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/projects/[id]/sections/[sectionId]/citations - 获取章节引用列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const client = getSupabaseClient();

    // 获取章节的所有引用
    const { data: citations, error } = await client
      .from('content_citations')
      .select(`
        id,
        chunk_id,
        document_id,
        cited_text,
        source_text,
        source_document_name,
        relevance_score,
        start_offset,
        end_offset,
        created_at
      `)
      .eq('project_id', id)
      .eq('section_id', sectionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('查询引用失败:', error);
      return NextResponse.json(
        { success: false, error: '查询引用失败' },
        { status: 500 }
      );
    }

    // 按文档分组
    const groupedByDoc = (citations || []).reduce((acc: any, citation: any) => {
      const docName = citation.source_document_name;
      if (!acc[docName]) {
        acc[docName] = {
          documentName: docName,
          documentId: citation.document_id,
          citations: [],
        };
      }
      acc[docName].citations.push({
        id: citation.id,
        chunkId: citation.chunk_id,
        citedText: citation.cited_text,
        sourceText: citation.source_text,
        relevanceScore: citation.relevance_score,
        offsets: {
          start: citation.start_offset,
          end: citation.end_offset,
        },
        createdAt: citation.created_at,
      });
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        total: citations?.length || 0,
        documents: Object.values(groupedByDoc),
        citations: citations || [],
      },
    });
  } catch (error) {
    console.error('获取引用列表失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/sections/[sectionId]/citations - 删除引用
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const { searchParams } = new URL(req.url);
    const citationId = searchParams.get('citationId');

    const client = getSupabaseClient();

    if (citationId) {
      // 删除单个引用
      const { error } = await client
        .from('content_citations')
        .delete()
        .eq('id', citationId)
        .eq('project_id', id)
        .eq('section_id', sectionId);

      if (error) {
        console.error('删除引用失败:', error);
        return NextResponse.json(
          { success: false, error: '删除失败' },
          { status: 500 }
        );
      }
    } else {
      // 删除章节所有引用
      const { error } = await client
        .from('content_citations')
        .delete()
        .eq('project_id', id)
        .eq('section_id', sectionId);

      if (error) {
        console.error('删除引用失败:', error);
        return NextResponse.json(
          { success: false, error: '删除失败' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: '引用已删除',
    });
  } catch (error) {
    console.error('删除引用失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
