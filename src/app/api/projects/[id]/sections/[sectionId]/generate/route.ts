/**
 * 章节内容生成API - 支持file_id引用招标文档
 * 功能：
 * 1. 生成章节内容
 * 2. 记录引用来源（citations）
 * 3. 章节锁定检查
 * 4. 使用file_id引用原始招标文档（节省token，提高准确性）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getLLMFileService } from '@/lib/services/llm-file-service';
import { getRetrievalService } from '@/lib/services/retrieval';

// 引用信息接口
interface Citation {
  id: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  citedText: string;
  sourceText: string;
  relevanceScore: number;
  startOffset?: number;
  endOffset?: number;
}

// 知识库检索结果
interface RetrievedChunk {
  id: string;
  content: string;
  documentId: string;
  documentName: string;
  knowledgeBaseId: string;
  score: number;
}

// POST /api/projects/[id]/sections/[sectionId]/generate - 生成章节内容
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const body = await req.json();
    const { knowledgeBaseIds = [], customInstructions = '', skipLockCheck = false } = body;

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

    // 检查章节锁定状态
    const { data: sectionData } = await client
      .from('bid_sections')
      .select('id, is_locked, locked_by, lock_expires_at')
      .eq('project_id', id)
      .eq('id', sectionId)
      .single();

    if (sectionData?.is_locked && !skipLockCheck) {
      // 检查锁是否过期
      if (sectionData.lock_expires_at && new Date(sectionData.lock_expires_at) > new Date()) {
        return NextResponse.json(
          { 
            success: false, 
            error: `章节已被 ${sectionData.locked_by} 锁定编辑中，请稍后再试`,
            code: 'SECTION_LOCKED'
          },
          { status: 423 }
        );
      }
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

    // 获取知识库上下文并保存检索结果
    let retrievedChunks: RetrievedChunk[] = [];
    let knowledgeContext = '';
    
    if (knowledgeBaseIds.length > 0) {
      const result = await retrieveKnowledgeContextWithCitations(knowledgeBaseIds, section.title);
      retrievedChunks = result.chunks;
      knowledgeContext = result.context;
    }

    // 获取风险因素
    const { data: risks } = await client
      .from('risk_factors')
      .select('*')
      .eq('project_id', id)
      .in('severity', ['critical', 'high']);

    // 获取项目中存储的file_id（用于引用原始招标文档）
    const llmFileId = project.metadata?.uploadedDocument?.llmFileId;
    let useFileIdMode = false;

    if (llmFileId) {
      const llmFileService = getLLMFileService();
      useFileIdMode = await llmFileService.checkFileAvailable(llmFileId);
      console.log(`[SectionGenerate] file_id模式: ${useFileIdMode}, fileId: ${llmFileId}`);
    }

    // 构建提示（文本模式的prompt）
    const prompt = buildSectionPrompt(section, scoringItems, risks || [], knowledgeContext, customInstructions);

    // 获取LLM配置（注意：数据库中key是api_url/api_key/model）
    const { data: settings } = await client
      .from('system_settings')
      .select('key, value')
      .eq('category', 'llm');

    const configMap = new Map(settings?.map(s => [s.key, s.value]));
    const apiUrl = configMap.get('api_url') || process.env.LLM_API_URL;
    const apiKey = configMap.get('api_key') || process.env.LLM_API_KEY;
    const model = configMap.get('model') || 'qwen3-max';

    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        { success: false, error: '请先配置LLM设置' },
        { status: 400 }
      );
    }

    // 生成内容（非流式）
    let fullContent = '';
    
    try {
      // 构建请求体
      let requestBody: any;
      
      if (useFileIdMode && llmFileId) {
        // ===== file_id 模式（推荐）=====
        console.log('[SectionGenerate] 使用 file_id 模式');
        
        const fileIdPrompt = buildFileIdPrompt(section, scoringItems, risks || [], knowledgeContext, customInstructions);
        
        requestBody = {
          model,
          messages: [
            {
              role: 'system',
              content: `你是一位专业的标书编写专家。请根据招标文档内容和提供的素材，撰写投标文件的章节内容。

要求：
1. 优先基于招标文档原文内容进行响应
2. 内容专业、准确、有说服力
3. 结构清晰，逻辑严密
4. 确保完整响应所有评分项要求
5. 使用Markdown格式输出
6. 直接输出章节内容，不要包含额外的说明`,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: fileIdPrompt },
                { type: 'file', file_id: llmFileId }  // 使用 file_id 引用招标文档
              ]
            }
          ],
          temperature: 0.7,
          max_tokens: 8192,
          stream: false,  // 非流式
        };
      } else {
        // ===== 文本模式（回退）=====
        console.log('[SectionGenerate] 使用文本模式');
        
        requestBody = {
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
6. 使用Markdown格式输出
7. 引用参考资料时，请使用格式【引用:资料编号】，例如【引用:1】表示引用第一个参考资料`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 8192,
          stream: false,  // 非流式
        };
      }

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SectionGenerate] LLM API错误:', response.status, errorText);
        throw new Error(`LLM API错误: ${response.status}`);
      }

      const data = await response.json();
      fullContent = data.choices?.[0]?.message?.content || '';
      
      if (!fullContent) {
        throw new Error('LLM返回空内容');
      }

      // 提取并保存引用信息
      const citations = await extractAndSaveCitations(
        client,
        id,
        sectionId,
        fullContent,
        retrievedChunks
      );

      // 保存生成的内容
      await saveGeneratedContent(client, id, sectionId, fullContent, retrievedChunks);

      return NextResponse.json({
        success: true,
        content: fullContent,
        citations,
      });
    } catch (error) {
      console.error('[SectionGenerate] 生成错误:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : '生成失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[SectionGenerate] 生成章节内容失败:', error);
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
 * 获取知识库上下文并返回检索结果
 * 使用百炼检索API
 */
async function retrieveKnowledgeContextWithCitations(
  knowledgeBaseIds: string[], 
  query: string
): Promise<{ chunks: RetrievedChunk[]; context: string }> {
  const retrievalService = getRetrievalService();
  
  const result = await retrievalService.retrieve(query, {
    knowledgeBaseIds,
    topK: 10,
    minScore: 0.01,
  });

  if (!result.success || result.documents.length === 0) {
    return { chunks: [], context: '' };
  }

  // 转换为 RetrievedChunk 格式
  const retrievedChunks: RetrievedChunk[] = result.documents.map((doc, idx) => ({
    id: doc.id || `chunk-${idx}`,
    content: doc.content,
    documentId: doc.id,
    documentName: doc.documentName,
    knowledgeBaseId: knowledgeBaseIds[0],
    score: doc.score,
  }));

  // 构建上下文文本
  const context = retrievedChunks.map((c, i) => 
    `【参考资料${i + 1}】(来源: ${c.documentName})\n${c.content}`
  ).join('\n\n');

  return { chunks: retrievedChunks, context };
}

/**
 * 提取并保存引用信息
 */
async function extractAndSaveCitations(
  client: any,
  projectId: string,
  sectionId: string,
  content: string,
  retrievedChunks: RetrievedChunk[]
): Promise<Citation[]> {
  const citations: Citation[] = [];
  
  // 匹配引用标记 【引用:数字】
  const citationRegex = /【引用[:：]\s*(\d+)】/g;
  let match;
  
  while ((match = citationRegex.exec(content)) !== null) {
    const refIndex = parseInt(match[1]) - 1;
    if (refIndex >= 0 && refIndex < retrievedChunks.length) {
      const chunk = retrievedChunks[refIndex];
      
      // 查找引用周围的内容作为 citedText
      const start = Math.max(0, match.index - 100);
      const end = Math.min(content.length, match.index + match[0].length + 100);
      const citedText = content.substring(start, end);
      
      const citation: Citation = {
        id: `citation-${Date.now()}-${refIndex}`,
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        citedText,
        sourceText: chunk.content,
        relevanceScore: chunk.score,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      };
      
      citations.push(citation);
    }
  }
  
  // 保存引用到数据库
  if (citations.length > 0) {
    for (const citation of citations) {
      try {
        await client
          .from('content_citations')
          .insert({
            project_id: projectId,
            section_id: sectionId,
            chunk_id: citation.chunkId,
            document_id: citation.documentId,
            cited_text: citation.citedText,
            source_text: citation.sourceText,
            source_document_name: citation.documentName,
            relevance_score: citation.relevanceScore,
            start_offset: citation.startOffset,
            end_offset: citation.endOffset,
          });
      } catch (e) {
        console.error('保存引用失败:', e);
      }
    }
  }
  
  return citations;
}

/**
 * 保存生成的内容
 */
async function saveGeneratedContent(
  client: any,
  projectId: string,
  sectionId: string,
  content: string,
  retrievedChunks: RetrievedChunk[]
): Promise<void> {
  // 更新或创建章节内容
  const { data: existingSection } = await client
    .from('bid_sections')
    .select('id')
    .eq('project_id', projectId)
    .eq('id', sectionId)
    .single();

  const chunkIds = retrievedChunks.map(c => c.id);

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
    await client
      .from('bid_sections')
      .insert({
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

/**
 * 构建评分驱动的章节生成提示
 */
function buildSectionPrompt(
  section: any,
  scoringItems: any[],
  risks: any[],
  knowledgeContext: string,
  customInstructions: string
): string {
  const totalScore = scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
  const maxItem = scoringItems.reduce((max, item) => 
    (item.max_score || 0) > (max.max_score || 0) ? item : max, 
    { max_score: 0, item_name: '无' }
  );

  const estimatedWords = Math.max(1000, totalScore * 50);

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

  const riskText = risks.length > 0
    ? risks.slice(0, 5).map(r => 
        `- ⚠️ [${r.severity.toUpperCase()}] ${r.risk_description}`
      ).join('\n')
    : '无特定风险提示';

  const contextText = knowledgeContext
    ? `## 相关参考资料（请使用【引用:编号】格式引用）

${knowledgeContext}

`
    : '';

  return `你是一位专业的标书编写专家，正在为项目撰写"${section.title}"章节。

## 核心任务

本章对应评分项总分为 **${totalScore}分**，其中最高分项为 **"${maxItem.item_name}"(${maxItem.max_score || 0}分)**。

## 评分项详情（必须完整响应）

${scoringItemsText}

## 废标风险提示

${riskText}

${contextText}
## 内容要求

1. **字数要求**：约${estimatedWords}字（根据分值权重估算）
2. **风格要求**：专业严谨，数据支撑，避免空话套话
3. **结构要求**：层次分明，每个评分细则独立成段落
4. **量化要求**：每项承诺需有明确指标
5. **引用要求**：参考上面的资料时，使用【引用:编号】格式标注来源

## 响应格式

使用Markdown格式输出，结构清晰。

## 自定义要求
${customInstructions || '无额外要求'}

请开始撰写章节内容：`;
}

/**
 * 构建 file_id 模式的章节生成提示
 * 用于配合百炼平台的 file_id 功能
 */
function buildFileIdPrompt(
  section: any,
  scoringItems: any[],
  risks: any[],
  knowledgeContext: string,
  customInstructions: string
): string {
  const totalScore = scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0);

  const scoringItemsText = scoringItems.length > 0
    ? scoringItems.map((item, idx) => {
        const weight = totalScore > 0 ? ((item.max_score / totalScore) * 100).toFixed(1) : 0;
        const rules = item.scoring_rules || [];
        const rulesText = rules.length > 0
          ? rules.map((r: any, i: number) => `${i + 1}. ${typeof r === 'string' ? r : r.description || r}`).join('\n   ')
          : '详见招标文档要求';

        return `
### 评分项 ${idx + 1}：${item.item_name}
- **分值**：${item.max_score || 0}分（权重${weight}%）
- **评分细则**：
   ${rulesText}
`;
      }).join('\n')
    : '请参考招标文档中的相关要求';

  const riskText = risks.length > 0
    ? risks.slice(0, 5).map(r =>
        `- ⚠️ [${r.severity.toUpperCase()}] ${r.risk_description}`
      ).join('\n')
    : '无特定风险提示';

  const contextText = knowledgeContext
    ? `## 企业素材参考（可选择性使用）

${knowledgeContext}

`
    : '';

  const estimatedWords = Math.max(1000, totalScore * 50);

  return `请基于已上传的招标文档，撰写"${section.title}"章节内容。

## 核心任务

本章对应评分项总分为 **${totalScore}分**。

## 评分项详情（必须完整响应，确保获得满分）

${scoringItemsText}

## 废标风险提示（注意规避）

${riskText}
${contextText}
## 内容要求

1. **字数要求**：约${estimatedWords}字
2. **风格要求**：专业严谨，数据支撑，避免空话套话
3. **结构要求**：层次分明，每个评分细则独立成段落
4. **量化要求**：每项承诺需有明确指标
5. **响应要求**：确保完整响应招标文档中的相关要求

## 自定义要求
${customInstructions || '无额外要求'}

请开始撰写章节内容（使用Markdown格式）：`;
}
