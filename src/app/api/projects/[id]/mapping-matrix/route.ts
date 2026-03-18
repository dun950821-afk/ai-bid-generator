/**
 * 映射矩阵管理API
 * 实现招标要素到标书章节的结构化映射
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 映射项接口
interface MappingItem {
  id: string;
  tenderElement: {
    id: string;
    type: 'scoring' | 'requirement' | 'compliance';
    name: string;
    description: string;
    score?: number;
    weight?: number;
  };
  bidSection: {
    chapterNumber: string;
    chapterTitle: string;
    parentChapter?: string;
  };
  contentRequirements: {
    mustRespond: boolean;
    responseRatio: number;
    wordCountRatio: number;
    style: 'professional' | 'concise' | 'detailed';
  };
  supportingMaterials: {
    type: 'case' | 'certificate' | 'technical_solution' | 'team' | 'quote';
    required: boolean;
    keywords: string[];
  }[];
  validationRules: {
    checkCompliance: boolean;
    checkScoreCoverage: boolean;
    checkLogicConsistency: boolean;
    customRules: string[];
  };
}

// 行业模板配置
const INDUSTRY_TEMPLATES: Record<string, Partial<MappingItem>[]> = {
  finance: [
    {
      tenderElement: { id: 'fin-1', type: 'compliance', name: '金融监管合规', description: '符合银保监会信息科技外包监管要求' },
      bidSection: { chapterNumber: '6', chapterTitle: '合规性说明' },
      validationRules: { checkCompliance: true, checkScoreCoverage: true, checkLogicConsistency: true, customRules: ['符合银保监要求'] }
    }
  ],
  government: [
    {
      tenderElement: { id: 'gov-1', type: 'compliance', name: '等保要求', description: '符合等保2.0要求' },
      bidSection: { chapterNumber: '5', chapterTitle: '安全方案' },
      validationRules: { checkCompliance: true, checkScoreCoverage: true, checkLogicConsistency: true, customRules: ['符合等保2.0'] }
    }
  ],
  energy: [
    {
      tenderElement: { id: 'ene-1', type: 'compliance', name: '能源行业规范', description: '符合能源行业安全生产规范' },
      bidSection: { chapterNumber: '7', chapterTitle: '安全生产方案' },
      validationRules: { checkCompliance: true, checkScoreCoverage: true, checkLogicConsistency: true, customRules: ['符合能源规范'] }
    }
  ],
  infrastructure: [
    {
      tenderElement: { id: 'inf-1', type: 'compliance', name: '施工规范', description: '符合基建施工安全规范' },
      bidSection: { chapterNumber: '8', chapterTitle: '施工组织方案' },
      validationRules: { checkCompliance: true, checkScoreCoverage: true, checkLogicConsistency: true, customRules: ['符合施工规范'] }
    }
  ],
};

// GET /api/projects/[id]/mapping-matrix - 获取映射矩阵
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取当前映射矩阵
    const { data: matrix, error } = await client
      .from('mapping_matrices')
      .select('*')
      .eq('project_id', id)
      .eq('is_current', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // 如果没有映射矩阵，尝试自动生成
    if (!matrix) {
      const generatedMatrix = await generateMappingMatrix(client, id);
      return NextResponse.json({
        success: true,
        data: generatedMatrix,
        generated: true,
      });
    }

    return NextResponse.json({
      success: true,
      data: matrix,
      generated: false,
    });
  } catch (error) {
    console.error('获取映射矩阵失败:', error);
    return NextResponse.json(
      { success: false, error: '获取映射矩阵失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/mapping-matrix - 创建或更新映射矩阵
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { industry, customMappings, autoGenerate = false } = body;

    const client = getSupabaseClient();

    let mappingItems: MappingItem[] = [];

    if (autoGenerate) {
      // 自动生成映射矩阵
      const generated = await generateMappingMatrix(client, id);
      mappingItems = generated.mappingItems;
    } else if (customMappings && customMappings.length > 0) {
      mappingItems = customMappings;
    } else {
      // 基于评分项和风险因素生成
      const generated = await generateMappingMatrix(client, id);
      mappingItems = generated.mappingItems;
    }

    // 应用行业模板
    if (industry && INDUSTRY_TEMPLATES[industry]) {
      const templateItems = INDUSTRY_TEMPLATES[industry].map((item, idx) => ({
        ...item,
        id: `${industry}-${idx}`,
      })) as MappingItem[];
      mappingItems = [...mappingItems, ...templateItems];
    }

    // 设置旧版本为非当前版本
    await client
      .from('mapping_matrices')
      .update({ is_current: false })
      .eq('project_id', id);

    // 插入新版本
    const { data: newMatrix, error: insertError } = await client
      .from('mapping_matrices')
      .insert({
        project_id: id,
        mapping_items: mappingItems,
        industry: industry || null,
        industry_config: industry ? { industry, pluginPrompts: [], specialRequirements: [] } : {},
        is_current: true,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      data: newMatrix,
    });
  } catch (error) {
    console.error('创建映射矩阵失败:', error);
    return NextResponse.json(
      { success: false, error: '创建映射矩阵失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/mapping-matrix - 更新映射项
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { itemId, updates } = body;

    const client = getSupabaseClient();

    // 获取当前映射矩阵
    const { data: matrix } = await client
      .from('mapping_matrices')
      .select('*')
      .eq('project_id', id)
      .eq('is_current', true)
      .single();

    if (!matrix) {
      return NextResponse.json(
        { success: false, error: '映射矩阵不存在' },
        { status: 404 }
      );
    }

    // 更新映射项
    const mappingItems = matrix.mapping_items as MappingItem[];
    const itemIndex = mappingItems.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      return NextResponse.json(
        { success: false, error: '映射项不存在' },
        { status: 404 }
      );
    }

    mappingItems[itemIndex] = {
      ...mappingItems[itemIndex],
      ...updates,
    };

    // 保存更新
    const { error: updateError } = await client
      .from('mapping_matrices')
      .update({
        mapping_items: mappingItems,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matrix.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: { itemId, updates },
    });
  } catch (error) {
    console.error('更新映射项失败:', error);
    return NextResponse.json(
      { success: false, error: '更新映射项失败' },
      { status: 500 }
    );
  }
}

/**
 * 自动生成映射矩阵
 */
async function generateMappingMatrix(client: any, projectId: string): Promise<{
  mappingItems: MappingItem[];
  industry?: string;
}> {
  const mappingItems: MappingItem[] = [];
  let chapterNumber = 1;

  // 获取评分项
  const { data: scoringItems } = await client
    .from('scoring_items')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  // 获取风险因素
  const { data: riskFactors } = await client
    .from('risk_factors')
    .select('*')
    .eq('project_id', projectId);

  // 获取提取结果
  const { data: project } = await client
    .from('projects')
    .select('metadata')
    .eq('id', projectId)
    .single();

  const extractionResult = project?.metadata?.tender_extraction;

  // 映射评分项
  if (scoringItems && scoringItems.length > 0) {
    // 技术评分项
    const techItems = scoringItems.filter((item: any) => item.item_type === 'technical');
    if (techItems.length > 0) {
      mappingItems.push({
        id: `section-${chapterNumber}`,
        tenderElement: {
          id: 'tech-scoring',
          type: 'scoring',
          name: '技术评分项',
          description: '技术评分项综合响应',
          score: techItems.reduce((sum: number, item: any) => sum + (item.max_score || 0), 0),
          weight: 0,
        },
        bidSection: {
          chapterNumber: `${chapterNumber}`,
          chapterTitle: '技术方案',
        },
        contentRequirements: {
          mustRespond: true,
          responseRatio: 100,
          wordCountRatio: 40,
          style: 'detailed',
        },
        supportingMaterials: [
          { type: 'case', required: true, keywords: ['技术方案', '实施案例'] },
          { type: 'technical_solution', required: true, keywords: ['方案设计', '技术架构'] },
        ],
        validationRules: {
          checkCompliance: true,
          checkScoreCoverage: true,
          checkLogicConsistency: true,
          customRules: [],
        },
      });

      // 为每个技术评分项创建子章节
      techItems.forEach((item: any, idx: number) => {
        mappingItems.push({
          id: `section-${chapterNumber}-${idx + 1}`,
          tenderElement: {
            id: item.id,
            type: 'scoring',
            name: item.item_name,
            description: item.item_name,
            score: item.max_score,
            weight: item.weight,
          },
          bidSection: {
            chapterNumber: `${chapterNumber}.${idx + 1}`,
            chapterTitle: item.item_name,
            parentChapter: `${chapterNumber}`,
          },
          contentRequirements: {
            mustRespond: true,
            responseRatio: 100,
            wordCountRatio: (item.max_score || 0) / 100 * 40,
            style: 'detailed',
          },
          supportingMaterials: [
            { type: 'case', required: item.max_score >= 10, keywords: [] },
          ],
          validationRules: {
            checkCompliance: false,
            checkScoreCoverage: true,
            checkLogicConsistency: false,
            customRules: item.scoring_rules || [],
          },
        });
      });

      chapterNumber++;
    }

    // 商务评分项
    const bizItems = scoringItems.filter((item: any) => item.item_type === 'business');
    if (bizItems.length > 0) {
      mappingItems.push({
        id: `section-${chapterNumber}`,
        tenderElement: {
          id: 'biz-scoring',
          type: 'scoring',
          name: '商务评分项',
          description: '商务评分项综合响应',
          score: bizItems.reduce((sum: number, item: any) => sum + (item.max_score || 0), 0),
          weight: 0,
        },
        bidSection: {
          chapterNumber: `${chapterNumber}`,
          chapterTitle: '商务部分',
        },
        contentRequirements: {
          mustRespond: true,
          responseRatio: 100,
          wordCountRatio: 30,
          style: 'professional',
        },
        supportingMaterials: [
          { type: 'certificate', required: true, keywords: ['资质证书', '营业执照'] },
          { type: 'case', required: true, keywords: ['业绩案例', '项目经验'] },
          { type: 'team', required: true, keywords: ['项目团队', '人员配置'] },
        ],
        validationRules: {
          checkCompliance: true,
          checkScoreCoverage: true,
          checkLogicConsistency: true,
          customRules: [],
        },
      });
      chapterNumber++;
    }

    // 价格评分项
    const priceItems = scoringItems.filter((item: any) => item.item_type === 'price');
    if (priceItems.length > 0) {
      mappingItems.push({
        id: `section-${chapterNumber}`,
        tenderElement: {
          id: 'price-scoring',
          type: 'scoring',
          name: '价格评分项',
          description: '价格报价',
          score: priceItems.reduce((sum: number, item: any) => sum + (item.max_score || 0), 0),
          weight: 0,
        },
        bidSection: {
          chapterNumber: `${chapterNumber}`,
          chapterTitle: '报价部分',
        },
        contentRequirements: {
          mustRespond: true,
          responseRatio: 100,
          wordCountRatio: 10,
          style: 'concise',
        },
        supportingMaterials: [
          { type: 'quote', required: true, keywords: ['报价明细', '费用清单'] },
        ],
        validationRules: {
          checkCompliance: true,
          checkScoreCoverage: true,
          checkLogicConsistency: true,
          customRules: [],
        },
      });
      chapterNumber++;
    }
  }

  // 映射风险因素（废标条款）
  const criticalRisks = riskFactors?.filter((r: any) => r.severity === 'high' || r.severity === 'critical');
  if (criticalRisks && criticalRisks.length > 0) {
    mappingItems.push({
      id: `section-${chapterNumber}`,
      tenderElement: {
        id: 'compliance-risks',
        type: 'compliance',
        name: '废标风险响应',
        description: '对废标条款的响应',
      },
      bidSection: {
        chapterNumber: `${chapterNumber}`,
        chapterTitle: '合规响应',
      },
      contentRequirements: {
        mustRespond: true,
        responseRatio: 100,
        wordCountRatio: 15,
        style: 'professional',
      },
      supportingMaterials: [
        { type: 'certificate', required: true, keywords: ['资质证明', '承诺函'] },
      ],
      validationRules: {
        checkCompliance: true,
        checkScoreCoverage: false,
        checkLogicConsistency: false,
        customRules: criticalRisks.map((r: any) => r.risk_description),
      },
    });
  }

  // 添加必需章节
  const requiredSections = [
    { chapterNumber: '0', title: '投标函', wordRatio: 5 },
    { chapterNumber: '0.1', title: '法定代表人授权书', wordRatio: 2 },
  ];

  for (const section of requiredSections) {
    mappingItems.unshift({
      id: `section-${section.chapterNumber}`,
      tenderElement: {
        id: `required-${section.chapterNumber}`,
        type: 'requirement',
        name: section.title,
        description: '招标文件要求的必需章节',
      },
      bidSection: {
        chapterNumber: section.chapterNumber,
        chapterTitle: section.title,
      },
      contentRequirements: {
        mustRespond: true,
        responseRatio: 100,
        wordCountRatio: section.wordRatio,
        style: 'professional',
      },
      supportingMaterials: [],
      validationRules: {
        checkCompliance: true,
        checkScoreCoverage: false,
        checkLogicConsistency: false,
        customRules: [],
      },
    });
  }

  return { mappingItems };
}
