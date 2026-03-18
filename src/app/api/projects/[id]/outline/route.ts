/**
 * 标书大纲生成API
 * 支持 file_id 模式：引用原始招标文档，获取编写注意事项、投标格式等
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createModel } from '@/lib/llm';
import { getLLMFileService } from '@/lib/services/llm-file-service';
import { parseJSON } from '@/lib/utils/json-parser';

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
  const requestId = Date.now().toString(36);
  console.log(`[${requestId}] [大纲生成] 开始处理请求`);
  
  try {
    const { id } = await params;
    const body = await req.json();
    const { regenerate = false, customInstructions = '' } = body;
    console.log(`[${requestId}] [大纲生成] 项目ID: ${id}, regenerate: ${regenerate}`);

    const client = getSupabaseClient();

    // 获取项目信息
    console.log(`[${requestId}] [大纲生成] 获取项目信息...`);
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      console.error(`[${requestId}] [大纲生成] 项目不存在:`, projectError);
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取评分项
    console.log(`[${requestId}] [大纲生成] 获取评分项...`);
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    if (!scoringItems || scoringItems.length === 0) {
      console.error(`[${requestId}] [大纲生成] 评分项为空`);
      return NextResponse.json(
        { success: false, error: '请先解析招标文件获取评分项' },
        { status: 400 }
      );
    }
    console.log(`[${requestId}] [大纲生成] 获取到 ${scoringItems.length} 个评分项`);

    // 获取风险因素
    const { data: riskFactors } = await client
      .from('risk_factors')
      .select('*')
      .eq('project_id', id);
    console.log(`[${requestId}] [大纲生成] 获取到 ${riskFactors?.length || 0} 个风险因素`);

    // 检查是否有 file_id（引用原始招标文档）
    const llmFileId = project.metadata?.uploadedDocument?.llmFileId;
    let useFileIdMode = false;

    if (llmFileId) {
      console.log(`[${requestId}] [大纲生成] 检查 file_id: ${llmFileId}`);
      const llmFileService = getLLMFileService();
      try {
        useFileIdMode = await llmFileService.checkFileAvailable(llmFileId);
        console.log(`[${requestId}] [大纲生成] file_id模式: ${useFileIdMode}`);
      } catch (checkError) {
        console.error(`[${requestId}] [大纲生成] 检查 file_id 失败:`, checkError);
        useFileIdMode = false;
      }
    }

    let outline: any;

    if (useFileIdMode && llmFileId) {
      // ===== file_id 模式（推荐）=====
      console.log(`[${requestId}] [大纲生成] 使用 file_id 模式`);
      outline = await generateOutlineWithFileId(
        llmFileId,
        project,
        scoringItems || [],
        riskFactors || [],
        customInstructions,
        requestId
      );
    } else {
      // ===== 文本模式（回退）=====
      console.log(`[${requestId}] [大纲生成] 使用文本模式`);
      const prompt = buildOutlinePrompt(project, scoringItems || [], riskFactors || [], customInstructions);
      outline = await generateOutlineWithLLM(prompt, req.headers, requestId);
    }

    // 验证大纲格式
    if (!outline || !outline.sections || !Array.isArray(outline.sections)) {
      console.error(`[${requestId}] [大纲生成] 大纲格式无效，使用默认大纲`);
      outline = generateDefaultOutline();
    }
    console.log(`[${requestId}] [大纲生成] 大纲生成完成，共 ${outline.sections?.length || 0} 个章节`);

    // 保存大纲
    console.log(`[${requestId}] [大纲生成] 保存大纲到数据库...`);
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
      console.error(`[${requestId}] [大纲生成] 保存大纲失败:`, updateError);
    } else {
      console.log(`[${requestId}] [大纲生成] 大纲保存成功`);
    }

    console.log(`[${requestId}] [大纲生成] 请求处理完成`);
    return NextResponse.json({
      success: true,
      data: {
        outline,
        sectionCount: outline.sections?.length || 0,
        coverageScore: calculateCoverageScore(outline, scoringItems),
        generatedWithFileId: useFileIdMode,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] [大纲生成] 未捕获的异常:`, error);
    // 确保始终返回有效的JSON响应
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '生成大纲失败',
        requestId: requestId
      },
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
 * 构建大纲生成提示（文本模式）
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
 * 构建大纲生成提示（file_id模式）
 * 用于配合百炼平台的 file_id 功能，让LLM直接读取招标文档
 */
function buildFileIdOutlinePrompt(
  project: any,
  scoringItems: any[],
  riskFactors: any[],
  customInstructions: string
): string {
  const scoringText = scoringItems.map((item, idx) => 
    `${idx + 1}. ${item.item_name}（${item.item_type}，满分${item.max_score}分）`
  ).join('\n');

  const riskText = riskFactors?.slice(0, 10).map(risk =>
    `- [${risk.severity}] ${risk.risk_description}`
  ).join('\n') || '无';

  return `请基于招标文档内容，设计一份完整的投标文件大纲。

## 项目信息
项目名称：${project.name}

## 任务要求

请仔细阅读招标文档，特别关注以下内容：
1. **投标文件格式要求**：文档中规定的投标文件结构、章节顺序
2. **编写注意事项**：文档中的编写要求、格式规范
3. **评分标准**：如何组织内容以响应评分要求
4. **废标条款**：需要规避的风险

## 评分项目（共${scoringItems.length}项，需全部覆盖）

${scoringText}

## 重要风险提示

${riskText}

## 自定义要求
${customInstructions || '无'}

## 输出要求

请以JSON格式返回大纲，确保：
1. 符合招标文档规定的投标文件格式
2. 每个评分项都有对应章节覆盖
3. 章节结构清晰，层次分明
4. 包含招标文档要求的所有必要章节

输出格式：
{
  "sections": [
    {
      "id": "section-1",
      "title": "章节标题",
      "level": 1,
      "isRequired": true,
      "scoringItemIds": ["评分项名称或ID"],
      "description": "章节内容说明",
      "children": [
        {
          "id": "section-1-1",
          "title": "子章节标题",
          "level": 2,
          "isRequired": true,
          "scoringItemIds": [],
          "description": "子章节说明"
        }
      ]
    }
  ],
  "outlineNotes": "基于招标文档的特殊要求说明"
}

请直接输出JSON，不要包含其他内容：`;
}

/**
 * 使用 file_id 模式生成大纲
 * 通过百炼平台的 file_id 直接引用原始招标文档
 */
async function generateOutlineWithFileId(
  fileId: string,
  project: any,
  scoringItems: any[],
  riskFactors: any[],
  customInstructions: string,
  requestId: string = 'unknown'
): Promise<any> {
  try {
    const llmFileService = getLLMFileService();
    
    console.log(`[${requestId}] [大纲生成] 使用 file_id 调用 LLM, fileId: ${fileId}`);
    
    const task = buildFileIdOutlinePrompt(project, scoringItems, riskFactors, customInstructions);
    
    const result = await llmFileService.analyzeWithFileId(fileId, task);
    
    console.log(`[${requestId}] [大纲生成] file_id 模式生成完成`);
    
    // 验证结果
    if (result && typeof result === 'object') {
      if (result.sections && Array.isArray(result.sections)) {
        return result;
      }
      
      // 如果返回的是其他格式，尝试提取
      if (result.outline?.sections) {
        return result.outline;
      }
    }
    
    console.log(`[${requestId}] [大纲生成] 返回格式不正确，使用默认大纲`);
    return generateDefaultOutline();
  } catch (error) {
    console.error(`[${requestId}] [大纲生成] file_id 模式失败:`, error);
    // 回退到默认大纲
    return generateDefaultOutline();
  }
}

/**
 * 使用LLM生成大纲
 * 使用LLMService确保正确的配置和错误处理
 */
async function generateOutlineWithLLM(prompt: string, headers: Headers, requestId: string = 'unknown'): Promise<any> {
  try {
    // 创建LLM实例，显式禁用思考模式，确保返回纯JSON
    const llm = createModel({
      enableThinking: false,
      temperature: 0.7,
      maxTokens: 32768, // 使用32K输出，足够生成完整大纲
    });

    console.log(`[${requestId}] [大纲生成] 开始调用LLM...`);
    
    // 使用流式调用避免超时
    const response = await llm.invokeStreaming(prompt, '你是一位专业的标书编写专家，擅长根据招标文件要求设计投标文件结构。请直接返回JSON格式的大纲，不要包含任何其他内容。');

    console.log(`[${requestId}] [大纲生成] LLM响应长度: ${response.length}`);

    // 使用增强型JSON解析器
    const result = parseJSON(response, { allowTruncated: true, verbose: true });
    
    if (result.success) {
      console.log(`[${requestId}] [大纲生成] JSON解析成功${result.repaired ? '(已自动修复)' : ''}`);
      
      // 验证返回的数据格式
      if (result.data && result.data.sections && Array.isArray(result.data.sections)) {
        return result.data;
      }
      
      // 如果返回的是嵌套格式，尝试提取
      if (result.data?.outline?.sections) {
        return result.data.outline;
      }
      
      console.log(`[${requestId}] [大纲生成] 返回数据格式不正确，使用默认大纲`);
      return generateDefaultOutline();
    }

    console.error(`[${requestId}] [大纲生成] JSON解析失败:`, result.error);
    if (result.repairDetails) {
      result.repairDetails.forEach(detail => console.error(`  - ${detail}`));
    }
    console.log(`[${requestId}] [大纲生成] 响应内容前500字符: ${response.substring(0, 500)}`);
    console.log(`[${requestId}] [大纲生成] 使用默认大纲`);
    return generateDefaultOutline();
  } catch (error) {
    console.error(`[${requestId}] [大纲生成] LLM调用失败:`, error);
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
