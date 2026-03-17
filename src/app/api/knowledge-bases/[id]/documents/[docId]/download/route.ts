import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/knowledge-bases/[id]/documents/[docId]/download - 获取文档下载链接
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    const { data: doc, error } = await client
      .from('knowledge_documents')
      .select('file_path, file_name, file_type, file_size')
      .eq('id', docId)
      .eq('knowledge_base_id', id)
      .single();

    if (error || !doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 返回文件信息
    // 实际生产环境应该生成签名下载URL
    return NextResponse.json({
      success: true,
      data: {
        url: doc.file_path,
        fileName: doc.file_name,
        fileType: doc.file_type,
        fileSize: doc.file_size,
      },
    });
  } catch (error) {
    console.error('获取下载链接失败:', error);
    return NextResponse.json(
      { success: false, error: '获取下载链接失败' },
      { status: 500 }
    );
  }
}
