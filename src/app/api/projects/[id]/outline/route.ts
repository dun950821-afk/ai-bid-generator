/**
 * 标书大纲生成API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createModel } from '@/lib/llm';

// GET /api/projects/[id]/outline - 获取标书大纲
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data: project, error } = await client
      .from('projects')
      .select('id, name, metadata')
      .eq('id', id)
      .single();

    if (error || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        outline: project.metadata?.outline || null,
      },
    });
  } catch (error) {
    console.error('获取大纲失败:', error);
    return NextResponse.json(
      { success: false, error: '获取大纲失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/outline - 生成标书大纲
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { regenerate = false, customInstructions = '' } = body;

    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    if (!scoringItems || scoringItems.length === 0) {
      return NextResponse.json(
        { success: false, error: '请先解析招标文件获取评分项' },
        { status: 400 }
      );
    }

    // 获取风险因素
    const { data: riskFactors } = await client
      .from('risk_factors')
      .select('*')
      .eq('project_id', id);

    // 构建大纲生成提示
    const prompt = buildOutlinePrompt(project, scoringItems || [], riskFactors || [], customInstructions);

    // 调用LLM生成大纲
    const outline = await generateOutlineWithLLM(prompt, req.headers);

    // 保存大纲
    const { error: updateError } = await client
      .from('projects')
      .update({
        metadata: {
          ...project.metadata,
          outline,
          outlineGeneratedAt: new Date().toISOString(),
        },
      })
      .eq('id', id);

    if (updateError) {
      console.error('保存大纲失败:', updateError);
    }

    return NextResponse.json({
      success: true,
      data: {
        outline,
        sectionCount: outline.sections?.length || 0,
        coverageScore: calculateCoverageScore(outline, scoringItems),
      },
    });
  } catch (error) {
    console.error('生成大纲失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '生成大纲失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/outline - 更新标书大纲
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { outline } = await req.json();

    if (!outline) {
      return NextResponse.json(
        { success: false, error: '请提供大纲内容' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 获取当前项目元数据
    const { data: project } = await client
      .from('projects')
      .select('metadata')
      .eq('id', id)
      .single();

    // 更新大纲
    const { error } = await client
      .from('projects')
      .update({
        metadata: {
          ...project?.metadata,
          outline,
          outlineUpdatedAt: new Date().toISOString(),
        },
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '大纲已更新',
    });
  } catch (error) {
    console.error('更新大纲失败:', error);
    return NextResponse.json(
      { success: false, error: '更新大纲失败' },
      { status: 500 }
    );
  }
}

/**
 * 构建大纲生成提示
 */
function buildOutlinePrompt(
  project: any,
  scoringItems: any[],
  riskFactors: any[],
  customInstructions: string
): string {
  const scoringText = scoringItems.map(item => 
    `- ${item.item_name}（${item.item_type}，满分${item.max_score}分）`
  ).join('\n');

  const riskText = riskFactors?.slice(0, 10).map(risk =>
    `- [${risk.severity}] ${risk.risk_description}`
  ).join('\n') || '无';

  return `你是一位专业的标书编写专家。请根据以下招标文件信息，生成一份完整的投标文件大纲。

项目名称：${project.name}

## 评分项目（需全部覆盖）
${scoringText}

## 重要风险提示
${riskText}

## 自定义要求
${customInstructions || '无'}

## 要求
1. 大纲结构要清晰，层次分明
2. 确保每个评分项都有对应章节覆盖
3. 将风险因素纳入相应章节进行响应
4. 章节编号规范，便于阅读
5. 每个章节需要标注关联的评分项ID

请以JSON格式返回大纲，格式如下：
{
  "sections": [
    {
      "id": "section-1",
      "title": "章节标题",
      "level": 1,
      "isRequired": true,
      "scoringItemIds": ["score-1", "score-2"],
      "description": "章节内容说明",
      "children": []
    }
  ]
}`;
}

/**
 * 使用LLM生成大纲
 * 使用LLMService确保正确的配置和错误处理
 */
async function generateOutlineWithLLM(prompt: string, headers: Headers): Promise<any> {
  try {
    // 创建LLM实例，显式禁用思考模式，确保返回纯JSON
    const llm = createModel({
      enableThinking: false,
      temperature: 0.7,
      maxTokens: 16384, // 足够生成完整大纲
    });

    console.log('[大纲生成] 开始调用LLM...');
    
    // 使用流式调用避免超时
    const response = await llm.invokeStreaming(prompt, '你是一位专业的标书编写专家，擅长根据招标文件要求设计投标文件结构。请直接返回JSON格式的大纲，不要包含任何其他内容。');

    console.log('[大纲生成] LLM响应长度:', response.length);

    // 尝试解析JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[大纲生成] JSON解析成功');
        return parsed;
      } catch (parseError) {
        console.error('[大纲生成] JSON解析失败:', parseError);
        console.log('[大纲生成] 响应内容前500字符:', response.substring(0, 500));
      }
    }

    console.log('[大纲生成] 未找到有效JSON，使用默认大纲');
    return generateDefaultOutline();
  } catch (error) {
    console.error('[大纲生成] LLM调用失败:', error);
    return generateDefaultOutline();
  }
}

/**
 * 生成默认大纲结构
 */
function generateDefaultOutline(): any {
  return {
    sections: [
      {
        id: 'section-1',
        title: '投标函',
        level: 1,
        isRequired: true,
        scoringItemIds: [],
        description: '正式投标声明',
        children: [
          { id: 'section-1-1', title: '投标函', level: 2, isRequired: true, scoringItemIds: [] },
          { id: 'section-1-2', title: '投标函附录', level: 2, isRequired: false, scoringItemIds: [] },
        ],
      },
      {
        id: 'section-2',
        title: '法定代表人授权书',
        level: 1,
        isRequired: true,
        scoringItemIds: [],
        description: '授权代表签字文件',
        children: [],
      },
      {
        id: 'section-3',
        title: '技术方案',
        level: 1,
        isRequired: true,
        scoringItemIds: [],
        description: '技术响应和实施方案',
        children: [
          { id: 'section-3-1', title: '项目理解', level: 2, isRequired: true, scoringItemIds: [] },
          { id: 'section-3-2', title: '技术方案', level: 2, isRequired: true, scoringItemIds: [] },
          { id: 'section-3-3', title: '实施方案', level: 2, isRequired: true, scoringItemIds: [] },
          { id: 'section-3-4', title: '质量保证', level: 2, isRequired: true, scoringItemIds: [] },
        ],
      },
      {
        id: 'section-4',
        title: '商务部分',
        level: 1,
        isRequired: true,
        scoringItemIds: [],
        description: '商务资质和报价',
        children: [
          { id: 'section-4-1', title: '公司资质', level: 2, isRequired: true, scoringItemIds: [] },
          { id: 'section-4-2', title: '业绩案例', level: 2, isRequired: true, scoringItemIds: [] },
          { id: 'section-4-3', title: '项目团队', level: 2, isRequired: true, scoringItemIds: [] },
        ],
      },
      {
        id: 'section-5',
        title: '报价部分',
        level: 1,
        isRequired: true,
        scoringItemIds: [],
        description: '报价明细',
        children: [
          { id: 'section-5-1', title: '报价汇总表', level: 2, isRequired: true, scoringItemIds: [] },
          { id: 'section-5-2', title: '报价明细表', level: 2, isRequired: true, scoringItemIds: [] },
        ],
      },
    ],
  };
}

/**
 * 计算评分项覆盖率
 */
function calculateCoverageScore(outline: any, scoringItems: any[]): number {
  if (!outline?.sections || scoringItems.length === 0) return 0;

  const coveredIds = new Set<string>();
  
  function collectIds(sections: any[]) {
    for (const section of sections) {
      if (section.scoringItemIds) {
        section.scoringItemIds.forEach((id: string) => coveredIds.add(id));
      }
      if (section.children) {
        collectIds(section.children);
      }
    }
  }

  collectIds(outline.sections);

  return Math.round((coveredIds.size / scoringItems.length) * 100);
}
