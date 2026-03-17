import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/knowledge-bases/[id]/documents - 获取知识库文档列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data, error, count } = await client
      .from('knowledge_documents')
      .select('*', { count: 'exact' })
      .eq('knowledge_base_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: data || [],
        total: count || 0,
      },
    });
  } catch (error) {
    console.error('获取文档列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档列表失败' },
      { status: 500 }
    );
  }
}

// POST /api/knowledge-bases/[id]/documents - 上传文档
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要上传的文件' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    const uploadedDocs = [];

    for (const file of files) {
      // 创建文档记录
      const { data, error } = await client
        .from('knowledge_documents')
        .insert({
          knowledge_base_id: id,
          file_name: file.name,
          file_path: `knowledge-bases/${id}/${Date.now()}-${file.name}`,
          file_type: file.type,
          file_size: file.size,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('创建文档记录失败:', error);
        continue;
      }

      uploadedDocs.push(data);
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: uploadedDocs,
        uploaded: uploadedDocs.length,
      },
    });
  } catch (error) {
    console.error('上传文档失败:', error);
    return NextResponse.json(
      { success: false, error: '上传文档失败' },
      { status: 500 }
    );
  }
}
