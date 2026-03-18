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
 * 构建评分驱动的章节生成提示
 * 严格按照 AI-Bid-OPTIMIZATION-ANALYSIS.md 规范实现
 */
function buildSectionPrompt(
  section: any,
  scoringItems: any[],
  risks: any[],
  knowledgeContext: string,
  customInstructions: string
): string {
  // 计算评分项总分和权重
  const totalScore = scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
  const maxItem = scoringItems.reduce((max, item) => 
    (item.max_score || 0) > (max.max_score || 0) ? item : max, 
    { max_score: 0 }
  );

  // 估算字数（基于分值权重）
  const estimatedWords = Math.max(1000, totalScore * 50);

  // 构建评分项详细说明
  const scoringItemsText = scoringItems.length > 0
    ? scoringItems.map((item, idx) => {
        const weight = totalScore > 0 ? ((item.max_score / totalScore) * 100).toFixed(1) : 0;
        const rules = item.scoring_rules || [];
        const rulesText = rules.length > 0 
          ? rules.map((r: any, i: number) => `${i + 1}. ${typeof r === 'string' ? r : r.description || r}`).join('\n   ')
          : '按招标文件要求执行';
        
        return `
### 评分项 ${idx + 1}：${item.item_name}
- **分值**：${item.max_score || 0}分（权重${weight}%）
- **评分细则**：
   ${rulesText}
`;
      }).join('\n')
    : '本章节无直接对应的评分项';

  // 构建风险提示
  const riskText = risks.length > 0
    ? risks.slice(0, 5).map(r => 
        `- ⚠️ [${r.severity.toUpperCase()}] ${r.risk_description}`
      ).join('\n')
    : '无特定风险提示';

  // 构建知识库上下文
  const contextText = knowledgeContext
    ? `## 相关参考资料

${knowledgeContext}

**引用要求**：
- 引用格式：【引用：来源名称】
- 引用时需说明与当前内容的关联性
- 不得过度引用，保持内容原创性

`
    : '';

  return `你是一位专业的标书编写专家，正在为项目撰写第${section.title}章节。

## 核心任务

本章对应评分项总分为 **${totalScore}分**，其中最高分项为 **"${maxItem.item_name || '无'}"(${maxItem.max_score || 0}分)**。

## 评分项详情（必须完整响应）

${scoringItemsText}

## 废标风险提示

${riskText}

${contextText}
## 内容要求

1. **字数要求**：约${estimatedWords}字（根据分值权重估算）
2. **风格要求**：专业严谨，数据支撑，避免空话套话
3. **结构要求**：层次分明，每个评分细则独立成段落
4. **量化要求**：每项承诺需有明确指标（如"响应时间≤30秒"、"团队配备5人以上"）

## 响应格式要求

请按以下结构组织内容：

\`\`\`
### [评分项名称]

我方具备完善的XX能力，具体体现在：

1. **[评分细则1]**
   - 实施方案：...
   - 量化指标：...
   - 支撑材料：【引用：案例/资质】

2. **[评分细则2]**
   ...
\`\`\`

## 自定义要求
${customInstructions || '无额外要求'}

## 禁止事项

1. ❌ 不得使用"具备丰富经验"等模糊表述，需量化
2. ❌ 不得偏离招标文件核心需求
3. ❌ 不得编造案例或资质信息
4. ❌ 不得遗漏任何评分细则

请开始撰写章节内容：`;
}
