/**
 * 提取结果人工修正API
 * 支持字段级别的修改，并记录修改历史
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 字段名称映射
const FIELD_NAMES: Record<string, string> = {
  // 项目基本信息
  'project_basic_info.project_name': '项目名称',
  'project_basic_info.project_number': '项目编号',
  'project_basic_info.purchase_unit': '采购单位',
  'project_basic_info.purchase_unit_contact': '联系人',
  'project_basic_info.purchase_unit_phone': '联系电话',
  'project_basic_info.purchase_unit_email': '邮箱',
  'project_basic_info.purchase_unit_address': '地址',
  'project_basic_info.project_type': '项目类型',
  'project_basic_info.procurement_method': '采购方式',
  'project_basic_info.project_budget': '项目预算',
  'project_basic_info.budget_source': '资金来源',
  'project_basic_info.project_cycle': '服务期限',
  'project_basic_info.delivery_period': '交付周期',
  'project_basic_info.warranty_period': '质保期',
  
  // 时间节点
  'time_schedule.bid_publish_date': '招标公告发布时间',
  'time_schedule.bid_document_sale_start': '文件发售开始',
  'time_schedule.bid_document_sale_end': '文件发售结束',
  'time_schedule.question_deadline': '提问截止时间',
  'time_schedule.answer_publish_date': '答疑发布时间',
  'time_schedule.site_visit_date': '现场踏勘时间',
  'time_schedule.bid_submission_deadline': '投标截止时间',
  'time_schedule.bid_opening_date': '开标时间',
  'time_schedule.bid_opening_location': '开标地点',
  
  // 废标条款
  'key_compliance_requirements.disqualification_rules': '废标条款',
  'key_compliance_requirements.bid_restrictions': '投标限制',
  'key_compliance_requirements.integrity_requirements': '诚信要求',
  
  // 保证金
  'business_requirements.bid_security.amount': '保证金金额',
  'business_requirements.bid_security.payment_method': '缴纳方式',
  'business_requirements.bid_security.deadline': '缴纳截止',
  
  // 评分标准
  'scoring_standard.tech_scoring.total_score': '技术评分总分',
  'scoring_standard.business_scoring.total_score': '商务评分总分',
  'scoring_standard.price_scoring.total_score': '价格评分总分',
};

// GET /api/projects/[id]/extraction-modifications - 获取修改历史
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId');
    const fieldPath = searchParams.get('fieldPath');
    const limit = parseInt(searchParams.get('limit') || '50');

    const client = getSupabaseClient();

    let query = client
      .from('extraction_modifications')
      .select('*')
      .order('modified_at', { ascending: false })
      .limit(limit);

    if (versionId) {
      query = query.eq('version_id', versionId);
    } else {
      // 获取项目当前版本的修改历史
      const { data: currentVersion } = await client
        .from('extraction_versions')
        .select('id')
        .eq('project_id', id)
        .eq('is_current', true)
        .single();

      if (currentVersion) {
        query = query.eq('version_id', currentVersion.id);
      }
    }

    if (fieldPath) {
      query = query.eq('field_path', fieldPath);
    }

    const { data: modifications, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: modifications || [],
    });
  } catch (error) {
    console.error('获取修改历史失败:', error);
    return NextResponse.json(
      { success: false, error: '获取修改历史失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/extraction-modifications - 提交字段修改
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { 
      versionId, 
      fieldPath, 
      newValue, 
      reason 
    } = body;

    if (!versionId || !fieldPath || newValue === undefined) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 1. 获取当前版本数据
    const { data: version, error: versionError } = await client
      .from('extraction_versions')
      .select('extraction_result')
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { success: false, error: '版本不存在' },
        { status: 404 }
      );
    }

    // 2. 获取旧值
    const oldValue = getNestedValue(version.extraction_result, fieldPath);
    const oldValueText = valueToString(oldValue);
    const newValueText = valueToString(newValue);

    // 3. 检查值是否相同
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      return NextResponse.json(
        { success: false, error: '新值与旧值相同，无需修改' },
        { status: 400 }
      );
    }

    // 4. 记录修改历史
    const { data: modification, error: modError } = await client
      .from('extraction_modifications')
      .insert({
        version_id: versionId,
        field_path: fieldPath,
        field_name: FIELD_NAMES[fieldPath] || fieldPath,
        old_value: oldValue,
        new_value: newValue,
        old_value_text: oldValueText,
        new_value_text: newValueText,
        reason,
        review_status: 'pending',
      })
      .select()
      .single();

    if (modError) throw modError;

    // 5. 更新提取结果
    const updatedResult = setNestedValue(
      { ...version.extraction_result },
      fieldPath,
      newValue
    );

    // 6. 保存更新后的结果
    const { error: updateError } = await client
      .from('extraction_versions')
      .update({
        extraction_result: updatedResult,
      })
      .eq('id', versionId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: {
        modification,
        message: '修改已保存',
      },
    });
  } catch (error) {
    console.error('提交修改失败:', error);
    return NextResponse.json(
      { success: false, error: '提交修改失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/extraction-modifications - 审核修改
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { modificationId, action, comment } = body;

    if (!modificationId || !action) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    if (action === 'approve') {
      // 批准修改
      const { error: updateError } = await client
        .from('extraction_modifications')
        .update({
          review_status: 'approved',
          reviewed_at: new Date().toISOString(),
          review_comment: comment,
        })
        .eq('id', modificationId);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        message: '修改已批准',
      });
    }

    if (action === 'reject') {
      // 拒绝修改，需要回滚
      const { data: modification } = await client
        .from('extraction_modifications')
        .select('*, extraction_versions!inner(project_id)')
        .eq('id', modificationId)
        .single();

      if (!modification) {
        return NextResponse.json(
          { success: false, error: '修改记录不存在' },
          { status: 404 }
        );
      }

      // 回滚到旧值
      const { data: version } = await client
        .from('extraction_versions')
        .select('extraction_result')
        .eq('id', modification.version_id)
        .single();

      if (version) {
        const updatedResult = setNestedValue(
          { ...version.extraction_result },
          modification.field_path,
          modification.old_value
        );

        await client
          .from('extraction_versions')
          .update({ extraction_result: updatedResult })
          .eq('id', modification.version_id);
      }

      // 标记为拒绝
      await client
        .from('extraction_modifications')
        .update({
          review_status: 'rejected',
          reviewed_at: new Date().toISOString(),
          review_comment: comment,
        })
        .eq('id', modificationId);

      return NextResponse.json({
        success: true,
        message: '修改已拒绝并回滚',
      });
    }

    return NextResponse.json(
      { success: false, error: '未知操作' },
      { status: 400 }
    );
  } catch (error) {
    console.error('审核修改失败:', error);
    return NextResponse.json(
      { success: false, error: '审核修改失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/extraction-modifications - 撤销修改
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const modificationId = searchParams.get('modificationId');

    if (!modificationId) {
      return NextResponse.json(
        { success: false, error: '缺少修改ID' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 获取修改记录
    const { data: modification } = await client
      .from('extraction_modifications')
      .select('*')
      .eq('id', modificationId)
      .single();

    if (!modification) {
      return NextResponse.json(
        { success: false, error: '修改记录不存在' },
        { status: 404 }
      );
    }

    // 回滚修改
    const { data: version } = await client
      .from('extraction_versions')
      .select('extraction_result')
      .eq('id', modification.version_id)
      .single();

    if (version) {
      const updatedResult = setNestedValue(
        { ...version.extraction_result },
        modification.field_path,
        modification.old_value
      );

      await client
        .from('extraction_versions')
        .update({ extraction_result: updatedResult })
        .eq('id', modification.version_id);
    }

    // 删除修改记录
    await client
      .from('extraction_modifications')
      .delete()
      .eq('id', modificationId);

    return NextResponse.json({
      success: true,
      message: '修改已撤销',
    });
  } catch (error) {
    console.error('撤销修改失败:', error);
    return NextResponse.json(
      { success: false, error: '撤销修改失败' },
      { status: 500 }
    );
  }
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    // 处理数组索引，如 'scoring_items[0]'
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayKey, index] = arrayMatch;
      return current?.[arrayKey]?.[parseInt(index)];
    }
    return current?.[key];
  }, obj);
}

/**
 * 设置嵌套对象的值
 */
function setNestedValue(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const result = { ...obj };
  let current = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);

    if (arrayMatch) {
      const [, arrayKey, index] = arrayMatch;
      if (!current[arrayKey]) {
        current[arrayKey] = [];
      }
      if (!current[arrayKey][parseInt(index)]) {
        current[arrayKey][parseInt(index)] = {};
      }
      current = current[arrayKey][parseInt(index)];
    } else {
      if (!current[key]) {
        current[key] = {};
      }
      current[key] = { ...current[key] };
      current = current[key];
    }
  }

  const lastKey = keys[keys.length - 1];
  const lastArrayMatch = lastKey.match(/^(\w+)\[(\d+)\]$/);

  if (lastArrayMatch) {
    const [, arrayKey, index] = lastArrayMatch;
    if (!current[arrayKey]) {
      current[arrayKey] = [];
    }
    current[arrayKey][parseInt(index)] = value;
  } else {
    current[lastKey] = value;
  }

  return result;
}

/**
 * 将值转换为字符串（用于搜索）
 */
function valueToString(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(v => valueToString(v)).join(' ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
