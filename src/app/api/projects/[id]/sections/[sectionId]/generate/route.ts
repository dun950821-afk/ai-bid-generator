/**
 * 章节内容生成API - 最优版本
 * 
 * 特点：
 * 1. 深度查询规划（15-25个查询）
 * 2. 全量混合检索（每查询100条）
 * 3. RRF融合去重
 * 4. 上下文增强
 * 5. 结构化Prompt
 * 6. 长上下文LLM生成
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  DeepQueryGenerator,
  FullRetrievalService,
  ContextEnhancementService,
  StructuredPromptBuilder,
  Section,
  ScoringItem,
  Risk,
  Citation,
  EnhancedChunkWithContext,
  FullRetrievalResult,
  DEFAULT_RETRIEVAL_CONFIG,
} from '@/lib/services/retrieval';

// =====================================================
// 主处理函数
// =====================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { id, sectionId } = await params;
    const body = await req.json();
    const { 
      knowledgeBaseIds = [], 
      customInstructions = '', 
      skipLockCheck = false,
      // 高级配置
      retrievalConfig = {},
    } = body;

    console.log(`[SectionGenerate] 开始生成章节: projectId=${id}, sectionId=${sectionId}`);

    // 合并检索配置
    const config = { ...DEFAULT_RETRIEVAL_CONFIG, ...retrievalConfig };

    // ===== Phase 1: 数据准备 =====
    console.log('[SectionGenerate] Phase 1: 数据准备...');
    const prepData = await prepareSectionData(id, sectionId, skipLockCheck);
    
    if (!prepData) {
      return NextResponse.json(
        { success: false, error: '章节不存在' },
        { status: 404 }
      );
    }

    const { section, scoringItems, risks, writingNotes, project } = prepData;

    // ===== Phase 2: 深度查询规划 =====
    console.log('[SectionGenerate] Phase 2: 深度查询规划...');
    const queryGenerator = new DeepQueryGenerator();
    const queryPlan = queryGenerator.generateQueryPlan(
      section,
      scoringItems,
      risks,
      writingNotes
    );
    console.log(`[SectionGenerate] 生成 ${queryPlan.totalQueries} 个检索查询`);

    // ===== Phase 3: 全量检索 =====
    console.log('[SectionGenerate] Phase 3: 全量检索...');
    let retrievalResult: FullRetrievalResult;
    
    if (knowledgeBaseIds.length > 0) {
      const retrievalService = new FullRetrievalService(config);
      retrievalResult = await retrievalService.executeFullRetrieval(
        queryPlan,
        knowledgeBaseIds
      );
      console.log(
        `[SectionGenerate] 检索完成: ${retrievalResult.rawResultCount} → ${retrievalResult.finalResultCount}条`
      );
    } else {
      console.log('[SectionGenerate] 未提供知识库ID，跳过检索');
      retrievalResult = {
        totalQueries: 0,
        rawResultCount: 0,
        fusedResultCount: 0,
        finalResultCount: 0,
        groupedChunks: new Map(),
        allChunks: [],
      };
    }

    // ===== Phase 4: 上下文增强 =====
    console.log('[SectionGenerate] Phase 4: 上下文增强...');
    const contextService = new ContextEnhancementService();
    const enhancedContext = await contextService.enhanceContext(
      retrievalResult.allChunks,
      queryPlan
    );
    console.log(
      `[SectionGenerate] 上下文增强完成: ${enhancedContext.totalTokens} tokens`
    );

    // ===== Phase 5: 构建Prompt =====
    console.log('[SectionGenerate] Phase 5: 构建Prompt...');
    const promptBuilder = new StructuredPromptBuilder();
    const prompt = promptBuilder.buildPrompt(
      section,
      scoringItems,
      risks,
      writingNotes,
      enhancedContext,
      customInstructions
    );

    // ===== Phase 6: LLM生成 =====
    console.log('[SectionGenerate] Phase 6: LLM生成...');
    const llmResult = await generateWithLLM(prompt, project);

    if (!llmResult.success || !llmResult.content) {
      return NextResponse.json(
        { success: false, error: llmResult.error || 'LLM生成失败' },
        { status: 500 }
      );
    }

    // ===== Phase 7: 后处理 =====
    console.log('[SectionGenerate] Phase 7: 后处理...');
    const citations = extractCitations(llmResult.content, enhancedContext.chunks);
    
    // 保存内容
    await saveGeneratedContent(id, sectionId, llmResult.content, retrievalResult);

    const elapsed = Date.now() - startTime;
    console.log(`[SectionGenerate] 完成，耗时 ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      content: llmResult.content,
      citations,
      metadata: {
        queryCount: queryPlan.totalQueries,
        retrievedChunks: retrievalResult.finalResultCount,
        contextTokens: enhancedContext.totalTokens,
        generatedTokens: llmResult.usage?.completionTokens || 0,
        elapsed,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[SectionGenerate] 生成失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成失败',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// 数据准备
// =====================================================

interface SectionPrepData {
  section: Section;
  scoringItems: ScoringItem[];
  risks: Risk[];
  writingNotes: string[];
  project: any;
}

async function prepareSectionData(
  projectId: string,
  sectionId: string,
  skipLockCheck: boolean
): Promise<SectionPrepData | null> {
  const client = getSupabaseClient();

  // 获取项目信息
  const { data: project } = await client
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (!project) {
    return null;
  }

  // 检查章节锁定状态
  if (!skipLockCheck) {
    const { data: sectionData } = await client
      .from('bid_sections')
      .select('id, is_locked, locked_by, lock_expires_at')
      .eq('project_id', projectId)
      .eq('id', sectionId)
      .single();

    if (sectionData?.is_locked) {
      if (
        sectionData.lock_expires_at &&
        new Date(sectionData.lock_expires_at) > new Date()
      ) {
        throw new Error(`章节已被 ${sectionData.locked_by} 锁定编辑中`);
      }
    }
  }

  // 获取章节信息
  const outline = project.metadata?.outline;
  const section = findSection(outline?.sections || [], sectionId);

  if (!section) {
    return null;
  }

  // 获取关联的评分项
  const scoringItemIds = section.scoringItemIds || [];
  let scoringItems: ScoringItem[] = [];

  if (scoringItemIds.length > 0) {
    const { data } = await client
      .from('scoring_items')
      .select('*')
      .in('id', scoringItemIds);
    scoringItems = (data || []).map((item) => ({
      id: item.id,
      item_name: item.item_name,
      max_score: item.max_score,
      scoring_rules: item.scoring_rules,
    }));
  }

  // 获取风险因素
  const { data: riskData } = await client
    .from('disqualification_risks')
    .select('*')
    .eq('project_id', projectId)
    .in('severity', ['critical', 'high']);

  const risks: Risk[] = (riskData || []).map((r) => ({
    id: r.id,
    severity: r.severity,
    risk_description: r.risk_description,
    keywords: r.keywords,
  }));

  // 获取编写注意点
  const writingNotes: string[] = project.metadata?.writingNotes || [];

  return {
    section,
    scoringItems,
    risks,
    writingNotes,
    project,
  };
}

/**
 * 查找章节并计算完整编号
 * 一级：中文数字（一、二、三...）
 * 二级：1.1、1.2、2.1、2.2...
 * 三级：1.1.1、1.1.2、2.1.1...
 * 四级：1.1.1.1、1.1.1.2...
 * 五级：1）、2）、3）...
 */
function findSection(sections: any[], sectionId: string): Section | null {
  const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];

  function findWithNumber(
    sectionList: any[],
    targetId: string,
    path: number[] = [] // 记录从根到当前的order路径
  ): { section: any; fullNumber: string } | null {
    for (let i = 0; i < sectionList.length; i++) {
      const section = sectionList[i];
      const currentOrder = i + 1;
      const currentPath = [...path, currentOrder];
      const level = currentPath.length;
      
      let fullNumber = '';
      
      // 根据层级计算编号格式
      if (level === 1) {
        // 一级：中文数字（一、二、三...）
        fullNumber = `${chineseNumbers[i] || (i + 1)}、`;
      } else if (level === 2) {
        // 二级：1.1、1.2、2.1、2.2...
        fullNumber = `${path[0]}.${currentOrder}`;
      } else if (level === 3) {
        // 三级：1.1.1、1.1.2、2.1.1...
        fullNumber = `${path[0]}.${path[1]}.${currentOrder}`;
      } else if (level === 4) {
        // 四级：1.1.1.1、1.1.1.2...
        fullNumber = `${path[0]}.${path[1]}.${path[2]}.${currentOrder}`;
      } else if (level >= 5) {
        // 五级及以上：1）、2）、3）...
        fullNumber = `${currentOrder}）`;
      }

      if (section.id === targetId) {
        return { section, fullNumber };
      }

      if (section.children) {
        const found = findWithNumber(section.children, targetId, currentPath);
        if (found) return found;
      }
    }
    return null;
  }

  const result = findWithNumber(sections, sectionId);
  
  if (!result) return null;
  
  const { section, fullNumber } = result;

  return {
    id: section.id,
    title: section.title,
    level: section.level,
    order: section.order,
    fullNumber,
    scoringItemIds: section.scoringItemIds || section.scoring_item_ids,
    contentGuide: section.contentGuide ? {
      mainPoints: section.contentGuide.mainPoints || [],
      materialSuggestions: section.contentGuide.materialSuggestions || [],
      knowledgeBaseQueries: section.contentGuide.knowledgeBaseQueries || [],
    } : undefined,
    children: section.children,
  };
}

// =====================================================
// LLM生成
// =====================================================

interface LLMResult {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

async function generateWithLLM(
  prompt: ReturnType<StructuredPromptBuilder['buildPrompt']>,
  project: any
): Promise<LLMResult> {
  const client = getSupabaseClient();

  // 获取LLM配置
  const { data: settings } = await client
    .from('system_settings')
    .select('key, value')
    .eq('category', 'llm');

  const configMap = new Map(settings?.map((s) => [s.key, s.value]));
  const apiUrl = configMap.get('api_url') || process.env.LLM_API_URL;
  const apiKey = configMap.get('api_key') || process.env.LLM_API_KEY;
  // 使用长上下文模型
  const model = configMap.get('doc_extract_model') || configMap.get('model') || 'qwen-long';

  if (!apiUrl || !apiKey) {
    return { success: false, error: '请先配置LLM设置' };
  }

  // 构建消息
  const messages = [
    { role: 'system' as const, content: prompt.systemMessage },
    { role: 'user' as const, content: prompt.contextMessage },
    { role: 'user' as const, content: prompt.requirementsMessage },
    { role: 'user' as const, content: prompt.userMessage },
  ];

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 16000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SectionGenerate] LLM API错误:', response.status, errorText);
      return { success: false, error: `LLM API错误: ${response.status}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      return { success: false, error: 'LLM返回空内容' };
    }

    return {
      success: true,
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    console.error('[SectionGenerate] LLM调用失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'LLM调用失败',
    };
  }
}

// =====================================================
// 引用提取与保存
// =====================================================

function extractCitations(
  content: string,
  chunks: EnhancedChunkWithContext[]
): Citation[] {
  const citations: Citation[] = [];
  const citationMap = new Map<string, EnhancedChunkWithContext>();

  // 建立引用ID到chunk的映射
  for (const chunk of chunks) {
    citationMap.set(chunk.citationId, chunk);
  }

  // 匹配引用标记 [S1-1], [G1], [R1] 等
  const citationRegex = /\[(S\d+-\d+|G\d+|R\d+|L\d+)\]/g;
  let match;
  const seen = new Set<string>();

  while ((match = citationRegex.exec(content)) !== null) {
    const citationId = match[1];

    if (seen.has(citationId)) continue;
    seen.add(citationId);

    const chunk = citationMap.get(`[${citationId}]`);
    if (chunk) {
      // 查找引用周围的内容
      const start = Math.max(0, match.index - 100);
      const end = Math.min(content.length, match.index + match[0].length + 100);
      const citedText = content.substring(start, end);

      citations.push({
        id: `citation-${Date.now()}-${citations.length}`,
        citationId: `[${citationId}]`,
        chunkId: chunk.chunkId || '',
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        citedText,
        sourceText: chunk.originalContent,
        relevanceScore: chunk.maxScore,
        pageNumber: chunk.metadata.pageNumber,
        hierTitle: chunk.metadata.hierTitle,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      });
    }
  }

  return citations;
}

async function saveGeneratedContent(
  projectId: string,
  sectionId: string,
  content: string,
  retrievalResult: { allChunks: any[] }
): Promise<void> {
  const client = getSupabaseClient();

  // 更新或创建章节内容
  const { data: existingSection } = await client
    .from('bid_sections')
    .select('id')
    .eq('project_id', projectId)
    .eq('id', sectionId)
    .single();

  const chunkIds = retrievalResult.allChunks.map((c) => c.chunkId || c.documentId);

  if (existingSection) {
    await client
      .from('bid_sections')
      .update({
        content,
        status: 'generated',
        metadata: {
          generatedAt: new Date().toISOString(),
          sourceChunks: chunkIds,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', sectionId);
  } else {
    await client.from('bid_sections').insert({
      id: sectionId,
      project_id: projectId,
      title: sectionId,
      content,
      status: 'generated',
      metadata: {
        generatedAt: new Date().toISOString(),
        sourceChunks: chunkIds,
      },
    });
  }
}
