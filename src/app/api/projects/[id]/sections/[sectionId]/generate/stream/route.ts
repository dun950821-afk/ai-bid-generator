/**
 * 章节内容流式生成API
 * @description 支持SSE流式输出，实时显示生成进度和内容
 */

import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  DeepQueryGenerator,
  FullRetrievalService,
  FullRetrievalResult,
  ContextEnhancementService,
  StructuredPromptBuilder,
  Section,
  ScoringItem,
  Risk,
  DEFAULT_RETRIEVAL_CONFIG,
} from '@/lib/services/retrieval';

// =====================================================
// 辅助函数：发送SSE事件
// =====================================================

function createSSEEncoder() {
  const encoder = new TextEncoder();
  return {
    send: (type: string, data: Record<string, unknown>) => {
      return encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    },
  };
}

// =====================================================
// 数据准备（复用主生成API逻辑）
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
  sectionId: string
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

function findSection(sections: any[], sectionId: string): Section | null {
  for (const section of sections) {
    if (section.id === sectionId) {
      return {
        id: section.id,
        title: section.title,
        scoringItemIds: section.scoringItemIds,
        children: section.children,
      };
    }
    if (section.children) {
      const found = findSection(section.children, sectionId);
      if (found) return found;
    }
  }
  return null;
}

// =====================================================
// 流式LLM生成
// =====================================================

async function* streamGenerateWithLLM(
  prompt: ReturnType<StructuredPromptBuilder['buildPrompt']>,
  project: any
): AsyncGenerator<{ type: string; content?: string; error?: string; usage?: any }> {
  const client = getSupabaseClient();

  // 获取LLM配置
  const { data: settings } = await client
    .from('system_settings')
    .select('key, value')
    .eq('category', 'llm');

  const configMap = new Map(settings?.map((s) => [s.key, s.value]));
  const apiUrl = configMap.get('api_url') || process.env.LLM_API_URL;
  const apiKey = configMap.get('api_key') || process.env.LLM_API_KEY;
  const model = configMap.get('doc_extract_model') || configMap.get('model') || 'qwen-long';

  if (!apiUrl || !apiKey) {
    yield { type: 'error', error: '请先配置LLM设置' };
    return;
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
        stream: true, // 启用流式输出
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: 'error', error: `LLM请求失败: ${response.status} ${errorText}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: '无法读取LLM响应流' };
      return;
    }

    const decoder = new TextDecoder();
    let totalContent = '';
    let usage: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              totalContent += content;
              yield { type: 'chunk', content };
            }

            // 捕获usage信息
            if (parsed.usage) {
              usage = parsed.usage;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    yield { type: 'complete', usage };
  } catch (error) {
    yield { type: 'error', error: error instanceof Error ? error.message : 'LLM生成失败' };
  }
}

// =====================================================
// 保存生成内容
// =====================================================

async function saveGeneratedContent(
  projectId: string,
  sectionId: string,
  content: string,
  metadata: any
) {
  const client = getSupabaseClient();

  // 更新 bid_sections 表
  await client
    .from('bid_sections')
    .upsert({
      project_id: projectId,
      id: sectionId,
      content,
      status: 'completed',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  // 更新项目的 outline metadata
  const { data: project } = await client
    .from('projects')
    .select('metadata')
    .eq('id', projectId)
    .single();

  if (project?.metadata?.outline) {
    const outline = project.metadata.outline;
    updateSectionContent(outline.sections, sectionId, content);
    
    await client
      .from('projects')
      .update({
        metadata: {
          ...project.metadata,
          outline,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);
  }
}

function updateSectionContent(sections: any[], sectionId: string, content: string): boolean {
  for (const section of sections) {
    if (section.id === sectionId) {
      section.content = content;
      section.status = 'completed';
      return true;
    }
    if (section.children) {
      if (updateSectionContent(section.children, sectionId, content)) {
        return true;
      }
    }
  }
  return false;
}

// =====================================================
// 主处理函数
// =====================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const { id: projectId, sectionId } = await params;
  const body = await req.json();
  const { knowledgeBaseIds = [] } = body;

  const encoder = createSSEEncoder();
  const startTime = Date.now();

  // 创建流式响应
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown> = {}) => {
        controller.enqueue(encoder.send(type, data));
      };

      try {
        // Phase 1: 数据准备
        send('phase', { phase: 'prepare', message: '准备章节数据...' });
        
        const prepData = await prepareSectionData(projectId, sectionId);
        
        if (!prepData) {
          send('error', { error: '章节不存在' });
          controller.close();
          return;
        }

        const { section, scoringItems, risks, writingNotes, project } = prepData;

        // Phase 2: 深度查询规划
        send('phase', { phase: 'query_plan', message: '生成检索查询计划...' });
        
        const queryGenerator = new DeepQueryGenerator();
        const queryPlan = queryGenerator.generateQueryPlan(
          section,
          scoringItems,
          risks,
          writingNotes
        );
        
        send('phase', { 
          phase: 'query_plan_done', 
          queryCount: queryPlan.totalQueries,
          message: `生成 ${queryPlan.totalQueries} 个检索查询`
        });

        // Phase 3: 全量检索
        let retrievalResult: FullRetrievalResult = {
          totalQueries: 0,
          rawResultCount: 0,
          fusedResultCount: 0,
          finalResultCount: 0,
          groupedChunks: new Map(),
          allChunks: [],
        };

        if (knowledgeBaseIds.length > 0) {
          send('phase', { phase: 'retrieval', message: '检索知识库...' });
          
          const config = { ...DEFAULT_RETRIEVAL_CONFIG };
          const retrievalService = new FullRetrievalService(config);
          retrievalResult = await retrievalService.executeFullRetrieval(
            queryPlan,
            knowledgeBaseIds
          );
          
          send('phase', {
            phase: 'retrieval_done',
            rawCount: retrievalResult.rawResultCount,
            finalCount: retrievalResult.finalResultCount,
            message: `检索完成: ${retrievalResult.finalResultCount} 条文档`
          });
        } else {
          send('phase', { phase: 'skip_retrieval', message: '未提供知识库，跳过检索' });
        }

        // Phase 4: 上下文增强
        send('phase', { phase: 'context', message: '构建上下文...' });
        
        const contextService = new ContextEnhancementService();
        const enhancedContext = await contextService.enhanceContext(
          retrievalResult.allChunks,
          queryPlan
        );
        
        send('phase', {
          phase: 'context_done',
          tokens: enhancedContext.totalTokens,
          message: `上下文构建完成: ${enhancedContext.totalTokens} tokens`
        });

        // Phase 5: 构建Prompt
        send('phase', { phase: 'prompt', message: '构建生成提示...' });
        
        const promptBuilder = new StructuredPromptBuilder();
        const prompt = promptBuilder.buildPrompt(
          section,
          scoringItems,
          risks,
          writingNotes,
          enhancedContext,
          ''
        );

        // Phase 6: 流式生成
        send('phase', { phase: 'generate', message: '开始生成内容...' });

        let fullContent = '';
        let usage: any = null;

        for await (const event of streamGenerateWithLLM(prompt, project)) {
          if (event.type === 'chunk') {
            fullContent += event.content;
            send('chunk', { content: event.content });
          } else if (event.type === 'complete') {
            usage = event.usage;
          } else if (event.type === 'error') {
            send('error', { error: event.error });
            controller.close();
            return;
          }
        }

        // Phase 7: 保存
        send('phase', { phase: 'save', message: '保存生成内容...' });
        
        const elapsed = Date.now() - startTime;
        const metadata = {
          queryCount: queryPlan.totalQueries,
          retrievedChunks: retrievalResult.finalResultCount,
          contextTokens: enhancedContext.totalTokens,
          elapsed,
        };

        await saveGeneratedContent(projectId, sectionId, fullContent, metadata);

        // 完成
        send('done', {
          wordCount: fullContent.length,
          metadata,
          usage,
        });

        controller.close();
      } catch (error) {
        console.error('[StreamGenerate] 生成失败:', error);
        send('error', { error: error instanceof Error ? error.message : '生成失败' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
