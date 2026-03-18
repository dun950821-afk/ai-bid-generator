import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const client = getSupabaseClient();

    // 查询提取结果
    const { data, error } = await client
      .from('tender_extraction_results')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 没有找到记录
        return NextResponse.json({
          success: false,
          error: '未找到提取结果',
          data: null
        });
      }
      console.error('查询提取结果失败:', error);
      return NextResponse.json({
        success: false,
        error: '查询失败',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('获取提取结果失败:', error);
    return NextResponse.json({
      success: false,
      error: '服务器错误'
    }, { status: 500 });
  }
}
