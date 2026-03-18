/**
 * 提取结果版本对比API
 * 支持多个版本的差异对比和高亮显示
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { 
  TenderDocumentExtractionResult,
  ProjectBasicInfo,
  TimeSchedule,
  CoreTechDemand,
  BusinessRequirements,
  ScoringStandard,
  ComplianceRequirement,
} from '@/types/tender-extraction';

// 差异类型
type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

// 单个字段差异
interface FieldDiff {
  fieldPath: string;
  fieldName: string;
  valueA: any;
  valueB: any;
  diffType: DiffType;
  displayValueA: string;
  displayValueB: string;
}

// 对比结果
interface ComparisonResult {
  versionA: {
    id: string;
    versionNumber: number;
    createdAt: string;
    completenessScore: number;
  };
  versionB: {
    id: string;
    versionNumber: number;
    createdAt: string;
    completenessScore: number;
  };
  differences: FieldDiff[];
  summary: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  comparedAt: string;
}

// GET /api/projects/[id]/extraction-comparison - 获取版本对比结果
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const versionAId = searchParams.get('versionAId');
    const versionBId = searchParams.get('versionBId');

    if (!versionAId || !versionBId) {
      return NextResponse.json(
        { success: false, error: '需要提供两个版本ID' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查是否有缓存的对比结果
    const { data: cachedComparison } = await client
      .from('extraction_comparisons')
      .select('*')
      .eq('version_a_id', versionAId)
      .eq('version_b_id', versionBId)
      .single();

    if (cachedComparison) {
      return NextResponse.json({
        success: true,
        data: cachedComparison.comparison_result,
        cached: true,
      });
    }

    // 获取两个版本
    const [versionA, versionB] = await Promise.all([
      client
        .from('extraction_versions')
        .select('id, version_number, extraction_result, completeness_score, created_at')
        .eq('id', versionAId)
        .single(),
      client
        .from('extraction_versions')
        .select('id, version_number, extraction_result, completeness_score, created_at')
        .eq('id', versionBId)
        .single(),
    ]);

    if (!versionA.data || !versionB.data) {
      return NextResponse.json(
        { success: false, error: '版本不存在' },
        { status: 404 }
      );
    }

    // 执行对比
    const result = compareExtractionResults(
      versionA.data as any,
      versionB.data as any
    );

    // 缓存对比结果
    await client
      .from('extraction_comparisons')
      .insert({
        project_id: id,
        version_a_id: versionAId,
        version_b_id: versionBId,
        comparison_result: result,
        total_differences: result.summary.total,
        added_fields: result.summary.added,
        removed_fields: result.summary.removed,
        modified_fields: result.summary.modified,
      });

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
    });
  } catch (error) {
    console.error('版本对比失败:', error);
    return NextResponse.json(
      { success: false, error: '版本对比失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/extraction-comparison - 选择最佳版本
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { selectedVersionId, comparisonId } = body;

    if (!selectedVersionId) {
      return NextResponse.json(
        { success: false, error: '请选择要使用的版本' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 设置为当前版本
    const { error: updateError } = await client
      .from('extraction_versions')
      .update({ is_current: false })
      .eq('project_id', id);

    if (updateError) throw updateError;

    const { error: setCurrentError } = await client
      .from('extraction_versions')
      .update({ is_current: true })
      .eq('id', selectedVersionId);

    if (setCurrentError) throw setCurrentError;

    // 更新项目元数据
    const { data: selectedVersion } = await client
      .from('extraction_versions')
      .select('extraction_result')
      .eq('id', selectedVersionId)
      .single();

    if (selectedVersion) {
      await client
        .from('projects')
        .update({
          metadata: {
            tender_extraction: selectedVersion.extraction_result,
          },
        })
        .eq('id', id);
    }

    return NextResponse.json({
      success: true,
      message: '已选择该版本作为当前版本',
    });
  } catch (error) {
    console.error('选择版本失败:', error);
    return NextResponse.json(
      { success: false, error: '选择版本失败' },
      { status: 500 }
    );
  }
}

/**
 * 对比两个提取结果
 */
function compareExtractionResults(
  versionA: { id: string; version_number: number; extraction_result: TenderDocumentExtractionResult; completeness_score: number; created_at: string },
  versionB: { id: string; version_number: number; extraction_result: TenderDocumentExtractionResult; completeness_score: number; created_at: string }
): ComparisonResult {
  const resultA = versionA.extraction_result;
  const resultB = versionB.extraction_result;

  const differences: FieldDiff[] = [];
  const fieldPaths = getAllFieldPaths();

  for (const { path, name } of fieldPaths) {
    const valueA = getNestedValue(resultA, path);
    const valueB = getNestedValue(resultB, path);
    const diffType = getDiffType(valueA, valueB);

    differences.push({
      fieldPath: path,
      fieldName: name,
      valueA,
      valueB,
      diffType,
      displayValueA: formatValue(valueA),
      displayValueB: formatValue(valueB),
    });
  }

  const summary = {
    total: differences.filter(d => d.diffType !== 'unchanged').length,
    added: differences.filter(d => d.diffType === 'added').length,
    removed: differences.filter(d => d.diffType === 'removed').length,
    modified: differences.filter(d => d.diffType === 'modified').length,
    unchanged: differences.filter(d => d.diffType === 'unchanged').length,
  };

  return {
    versionA: {
      id: versionA.id,
      versionNumber: versionA.version_number,
      createdAt: versionA.created_at,
      completenessScore: versionA.completeness_score,
    },
    versionB: {
      id: versionB.id,
      versionNumber: versionB.version_number,
      createdAt: versionB.created_at,
      completenessScore: versionB.completeness_score,
    },
    differences,
    summary,
    comparedAt: new Date().toISOString(),
  };
}

/**
 * 获取所有需要对比的字段路径
 */
function getAllFieldPaths(): { path: string; name: string }[] {
  return [
    // 项目基本信息
    { path: 'project_basic_info.project_name', name: '项目名称' },
    { path: 'project_basic_info.project_number', name: '项目编号' },
    { path: 'project_basic_info.purchase_unit', name: '采购单位' },
    { path: 'project_basic_info.purchase_unit_contact', name: '联系人' },
    { path: 'project_basic_info.purchase_unit_phone', name: '联系电话' },
    { path: 'project_basic_info.purchase_unit_email', name: '邮箱' },
    { path: 'project_basic_info.purchase_unit_address', name: '地址' },
    { path: 'project_basic_info.project_type', name: '项目类型' },
    { path: 'project_basic_info.procurement_method', name: '采购方式' },
    { path: 'project_basic_info.project_budget', name: '项目预算' },
    { path: 'project_basic_info.budget_source', name: '资金来源' },
    { path: 'project_basic_info.project_cycle', name: '服务期限' },
    { path: 'project_basic_info.delivery_period', name: '交付周期' },
    { path: 'project_basic_info.warranty_period', name: '质保期' },
    
    // 时间节点
    { path: 'time_schedule.bid_publish_date', name: '招标公告发布' },
    { path: 'time_schedule.bid_document_sale_start', name: '文件发售开始' },
    { path: 'time_schedule.bid_document_sale_end', name: '文件发售结束' },
    { path: 'time_schedule.question_deadline', name: '提问截止' },
    { path: 'time_schedule.answer_publish_date', name: '答疑发布' },
    { path: 'time_schedule.site_visit_date', name: '现场踏勘' },
    { path: 'time_schedule.bid_submission_deadline', name: '投标截止' },
    { path: 'time_schedule.bid_opening_date', name: '开标时间' },
    { path: 'time_schedule.bid_opening_location', name: '开标地点' },
    
    // 技术需求
    { path: 'core_tech_demand.system_upgrade_demands', name: '系统功能需求' },
    { path: 'core_tech_demand.technical_parameters', name: '技术参数' },
    
    // 商务要求
    { path: 'business_requirements.bidder_qualification.basic_qualification', name: '资格要求' },
    { path: 'business_requirements.bidder_qualification.required_certificates', name: '资质证书' },
    { path: 'business_requirements.service_location', name: '服务地点' },
    { path: 'business_requirements.bid_security.amount', name: '保证金金额' },
    { path: 'business_requirements.bid_security.payment_method', name: '保证金缴纳方式' },
    
    // 评分标准
    { path: 'scoring_standard.tech_scoring.total_score', name: '技术评分总分' },
    { path: 'scoring_standard.business_scoring.total_score', name: '商务评分总分' },
    { path: 'scoring_standard.price_scoring.total_score', name: '价格评分总分' },
    { path: 'scoring_standard.tech_scoring.scoring_items', name: '技术评分项' },
    { path: 'scoring_standard.business_scoring.scoring_items', name: '商务评分项' },
    
    // 合规要求
    { path: 'key_compliance_requirements.disqualification_rules', name: '废标条款' },
    { path: 'key_compliance_requirements.major_deviation_rules', name: '重大偏离' },
    { path: 'key_compliance_requirements.bid_restrictions', name: '投标限制' },
    { path: 'key_compliance_requirements.integrity_requirements', name: '诚信要求' },
    
    // 提取元数据
    { path: 'extraction_metadata.confidence_score', name: '置信度' },
  ];
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 判断差异类型
 */
function getDiffType(valueA: any, valueB: any): DiffType {
  const aIsNull = valueA === null || valueA === undefined || 
                  (Array.isArray(valueA) && valueA.length === 0);
  const bIsNull = valueB === null || valueB === undefined ||
                  (Array.isArray(valueB) && valueB.length === 0);

  if (aIsNull && !bIsNull) return 'added';
  if (!aIsNull && bIsNull) return 'removed';
  if (aIsNull && bIsNull) return 'unchanged';

  // 比较值
  const aStr = JSON.stringify(valueA);
  const bStr = JSON.stringify(valueB);

  if (aStr === bStr) return 'unchanged';
  return 'modified';
}

/**
 * 格式化值用于显示
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return '(空)';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(空列表)';
    if (value.length <= 3) {
      return value.map(v => formatValue(v)).join(', ');
    }
    return `${value.length} 项`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
