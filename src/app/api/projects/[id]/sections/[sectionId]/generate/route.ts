/**
 * 章节内容生成API - 流式输出
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { Config, HeaderUtils } from 'coze-coding-dev-sdk';

// POST /api/projects/[id]/sections/[sectionId]/generate - 流式生成章节内容
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const body = await req.json();
    const { knowledgeBaseIds = [], customInstructions = '' } = body;

    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project } = await client
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (!project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取章节信息
    const outline = project.metadata?.outline;
    const section = findSection(outline?.sections || [], sectionId);

    if (!section) {
      return NextResponse.json(
        { success: false, error: '章节不存在' },
        { status: 404 }
      );
    }

    // 获取关联的评分项
    const scoringItemIds = section.scoringItemIds || [];
    let scoringItems: any[] = [];
    
    if (scoringItemIds.length > 0) {
      const { data } = await client
        .from('scoring_items')
        .select('*')
        .in('id', scoringItemIds);
      scoringItems = data || [];
    }

    // 获取知识库上下文
    let knowledgeContext = '';
    if (knowledgeBaseIds.length > 0) {
      knowledgeContext = await retrieveKnowledgeContext(knowledgeBaseIds, section.title);
    }

    // 获取风险因素
    const { data: risks } = await client
      .from('risk_factors')
      .select('*')
      .eq('project_id', id)
      .in('severity', ['critical', 'high']);

    // 构建提示
    const prompt = buildSectionPrompt(section, scoringItems, risks || [], knowledgeContext, customInstructions);

    // 获取LLM配置
    const { data: settings } = await client
      .from('system_settings')
      .select('key, value')
      .in('key', ['llm_api_url', 'llm_api_key', 'llm_model']);

    const configMap = new Map(settings?.map(s => [s.key, s.value]));
    const apiUrl = configMap.get('llm_api_url') || process.env.LLM_API_URL;
    const apiKey = configMap.get('llm_api_key') || process.env.LLM_API_KEY;
    const model = configMap.get('llm_model') || 'qwen3-max';

    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        { success: false, error: '请先配置LLM设置' },
        { status: 400 }
      );
    }

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content: `你是一位专业的标书编写专家。请根据提供的招标要求和知识库内容，撰写投标文件的章节内容。
要求：
1. 内容专业、准确、有说服力
2. 结构清晰，逻辑严密
3. 突出公司优势和项目经验
4. 确保响应所有评分项要求
5. 适当引用知识库中的相关内容
6. 使用Markdown格式输出`,
                },
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.7,
              max_tokens: 8192,
              stream: true,
            }),
          });

          if (!response.ok) {
            throw new Error(`LLM API错误: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('无法获取响应流');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }

          controller.close();
        } catch (error) {
          console.error('流式生成错误:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : '生成失败' })}\n\n`));
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
  } catch (error) {
    console.error('生成章节内容失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}

/**
 * 查找章节
 */
function findSection(sections: any[], sectionId: string): any | null {
  for (const section of sections) {
    if (section.id === sectionId) {
      return section;
    }
    if (section.children) {
      const found = findSection(section.children, sectionId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 获取知识库上下文
 */
async function retrieveKnowledgeContext(knowledgeBaseIds: string[], query: string): Promise<string> {
  const client = getSupabaseClient();
  
  const { data: chunks } = await client
    .from('document_chunks')
    .select('content, metadata')
    .in('knowledge_base_id', knowledgeBaseIds)
    .textSearch('content', query.split(' ').slice(0, 5).join(' | '), {
      type: 'websearch',
      config: 'simple',
    })
    .limit(5);

  if (!chunks || chunks.length === 0) {
    return '';
  }

  return chunks.map((c, i) => `【参考资料${i + 1}】\n${c.content}`).join('\n\n');
}

/**
 * 构建章节生成提示
 */
function buildSectionPrompt(
  section: any,
  scoringItems: any[],
  risks: any[],
  knowledgeContext: string,
  customInstructions: string
): string {
  const scoringText = scoringItems.length > 0
    ? scoringItems.map(item => 
        `- ${item.item_name}（满分${item.max_score}分）\n  评分标准: ${item.scoring_rules?.map((r: any) => r.description).join('；') || '按招标文件要求'}`
      ).join('\n')
    : '无特定评分要求';

  const riskText = risks.length > 0
    ? risks.map(r => `- [${r.severity}] ${r.risk_description}`).join('\n')
    : '无特定风险提示';

  const contextText = knowledgeContext
    ? `\n## 参考资料库\n${knowledgeContext}\n`
    : '';

  return `请为投标文件撰写以下章节内容：

## 章节信息
标题：${section.title}
${section.description ? `说明：${section.description}` : ''}

## 评分要求（需重点响应）
${scoringText}

## 风险提示
${riskText}
${contextText}
## 自定义要求
${customInstructions || '无'}

## 输出要求
1. 内容长度适中，重点突出
2. 使用Markdown格式，包含适当的标题层级
3. 如有公司案例或数据，请用占位符标注（如：【公司案例】）
4. 确保覆盖所有评分要点
5. 如有参考资料，请适当引用并标注来源

请开始撰写章节内容：`;
}
