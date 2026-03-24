/**
 * 项目管理API
 * GET: 获取项目列表
 * POST: 创建项目
 * DELETE: 删除项目
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { deleteProjectWithRelations } from '@/lib/services/project-service';

// 允许的排序字段白名单
const ALLOWED_ORDER_FIELDS = [
  'created_at',
  'updated_at',
  'name',
  'status',
  'project_number',
] as const;

// 允许的排序方向
const ALLOWED_ORDER_DIRECTIONS = ['asc', 'desc'] as const;

/**
 * 安全转义搜索词中的特殊字符
 * 防止在 ilike 查询中注入特殊模式字符
 */
function escapeSearchTerm(term: string): string {
  // 转义 SQL LIKE 特殊字符: % _ \
  return term.replace(/[%_\\]/g, '\\$&');
}

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
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    
    // 安全验证排序参数
    const rawOrderBy = searchParams.get('orderBy') || 'created_at';
    const orderBy = ALLOWED_ORDER_FIELDS.includes(rawOrderBy as any) 
      ? rawOrderBy 
      : 'created_at';
    
    const rawOrder = searchParams.get('order') || 'desc';
    const order = ALLOWED_ORDER_DIRECTIONS.includes(rawOrder as any)
      ? rawOrder
      : 'desc';

    const client = getSupabaseClient();

    let query = client
      .from('projects')
      .select('*', { count: 'exact' })
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (status) {
      // 验证 status 是合法值
      const validStatuses = ['draft', 'in_progress', 'completed', 'archived'];
      if (validStatuses.includes(status)) {
        query = query.eq('status', status);
      }
    }

    // 客户行业筛选 - 验证非空且长度合理
    if (customerIndustry && customerIndustry.length <= 50) {
      query = query.eq('customer_industry', customerIndustry);
    }

    // 服务类型筛选 - 验证非空且长度合理
    if (serviceType && serviceType.length <= 50) {
      query = query.eq('service_type', serviceType);
    }

    // 模糊搜索：项目名称或项目编号
    if (search && search.trim()) {
      // 限制搜索词长度并转义特殊字符
      const searchTerm = escapeSearchTerm(search.trim().slice(0, 100));
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

    // 使用统一的删除函数，确保删除关联数据
    const result = await deleteProjectWithRelations(id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error === '项目不存在' ? 404 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
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
