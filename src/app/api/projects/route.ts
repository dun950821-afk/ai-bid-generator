/**
 * 项目管理API
 * GET: 获取项目列表
 * POST: 创建项目
 * DELETE: 删除项目
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取项目列表
 * @description 支持分页、搜索和状态过滤
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const customerIndustry = searchParams.get('customerIndustry');
    const serviceType = searchParams.get('serviceType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const orderBy = searchParams.get('orderBy') || 'created_at';
    const order = searchParams.get('order') || 'desc';

    const client = getSupabaseClient();

    let query = client
      .from('projects')
      .select('*', { count: 'exact' })
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    // 客户行业筛选
    if (customerIndustry) {
      query = query.eq('customer_industry', customerIndustry);
    }

    // 服务类型筛选
    if (serviceType) {
      query = query.eq('service_type', serviceType);
    }

    // 模糊搜索：项目名称或项目编号
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,project_number.ilike.%${searchTerm}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('获取项目列表失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        items: data,
        total: count,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('获取项目列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取项目列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建项目
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      projectNumber,
      knowledgeBaseId,
      metadata,
      createdBy,
      customerIndustry,
      serviceType,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '项目名称不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from('projects')
      .insert({
        name,
        description,
        project_number: projectNumber,
        knowledge_base_id: knowledgeBaseId,
        metadata,
        created_by: createdBy,
        status: 'draft',
        customer_industry: customerIndustry,
        service_type: serviceType,
      })
      .select()
      .single();

    if (error) {
      console.error('创建项目失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('创建项目失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建项目失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除项目
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: '项目ID不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查项目是否存在
    const { data: project, error: fetchError } = await client
      .from('projects')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 删除关联数据
    // 1. 删除评分项
    await client.from('scoring_items').delete().eq('project_id', id);
    
    // 2. 删除废标风险
    await client.from('disqualification_risks').delete().eq('project_id', id);
    
    // 3. 删除章节
    await client.from('bid_sections').delete().eq('project_id', id);
    
    // 4. 删除引用记录
    await client.from('content_citations').delete().eq('project_id', id);
    
    // 5. 删除校验结果
    await client.from('validation_results').delete().eq('project_id', id);
    
    // 6. 删除映射矩阵
    await client.from('mapping_matrices').delete().eq('project_id', id);

    // 最后删除项目本身
    const { error: deleteError } = await client
      .from('projects')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('删除项目失败:', deleteError);
      return NextResponse.json(
        { success: false, error: '删除项目失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `项目"${project.name}"已删除`,
    });
  } catch (error) {
    console.error('删除项目失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除项目失败',
      },
      { status: 500 }
    );
  }
}
