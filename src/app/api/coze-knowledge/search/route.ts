import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient } from 'coze-coding-dev-sdk';
import { listDatasets, listDocuments, getCozeSettings } from '@/lib/services/coze-api-client';

/**
 * Coze 向量搜索 API
 * 使用 coze-coding-dev-sdk 的 KnowledgeClient.search() 进行语义搜索
 * 底层调用 integration.coze.cn/v1/knowledge_base/recall 端点（向量检索）
 * 
 * 搜索结果中的 doc_id 属于 integration 空间的文档ID，
 * 需要通过内容匹配或映射表关联到官方 API 的 document_id
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, top_k = 10, dataset_id, min_score = 0.1 } = body;

    if (!query || !query.trim()) {
      return NextResponse.json({ success: false, error: '请输入搜索关键词' });
    }

    const settings = await getCozeSettings();
    if (!settings.apiToken || !settings.spaceId) {
      return NextResponse.json({ success: false, error: '请先在设置中配置 Space ID 和 Authorization Token' });
    }

    // Step 1: 使用 SDK recall 进行向量搜索
    const client = new KnowledgeClient();
    const searchResult = await client.search(
      query.trim(),
      undefined, // 不限制 dataset（integration 空间的 dataset 名可能与官方不一致）
      top_k,
      min_score,
    );

    const chunks = searchResult.chunks || [];

    if (chunks.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          documents: [],
          total: 0,
          search_type: 'vector',
        },
      });
    }

    // Step 2: 获取官方 API 的知识库和文档列表，构建匹配映射
    const docNameMap = new Map<string, {
      doc_id: string;        // 官方 API 的 document_id
      doc_name: string;
      dataset_id: string;
      dataset_name: string;
      char_count: number;
      size: number;
      format_type: number;
      source_type: number;
      status: number;
    }>();

    // 获取所有知识库
    let datasets: Array<{ dataset_id: string; name: string }> = [];
    try {
      const dsResult = await listDatasets();
      datasets = dsResult.datasets.map(ds => ({
        dataset_id: ds.dataset_id,
        name: ds.name,
      }));
    } catch {
      // 如果获取知识库列表失败，继续使用搜索结果
    }

    // 如果指定了 dataset_id，只获取该知识库的文档
    if (dataset_id) {
      const dsName = datasets.find(d => d.dataset_id === dataset_id)?.name || '';
      try {
        const docsResult = await listDocuments(dataset_id);
        for (const doc of docsResult.documents) {
          docNameMap.set(doc.document_id, {
            doc_id: doc.document_id,
            doc_name: doc.name,
            dataset_id: dataset_id,
            dataset_name: dsName,
            char_count: doc.char_count,
            size: doc.size,
            format_type: doc.format_type,
            source_type: doc.source_type,
            status: doc.status,
          });
        }
      } catch {
        // 忽略
      }
    } else {
      // 获取所有知识库的文档
      for (const ds of datasets) {
        try {
          const docsResult = await listDocuments(ds.dataset_id);
          for (const doc of docsResult.documents) {
            docNameMap.set(doc.document_id, {
              doc_id: doc.document_id,
              doc_name: doc.name,
              dataset_id: ds.dataset_id,
              dataset_name: ds.name,
              char_count: doc.char_count,
              size: doc.size,
              format_type: doc.format_type,
              source_type: doc.source_type,
              status: doc.status,
            });
          }
        } catch {
          // 跳过无法访问的知识库
        }
      }
    }

    // Step 3: 将向量搜索结果按文档维度聚合，并尝试匹配官方 API 文档
    const docChunksMap = new Map<string, {
      recall_doc_id: string;
      chunks: Array<{ chunk_id: string; score: number; content: string }>;
      bestScore: number;
    }>();

    for (const chunk of chunks) {
      const docId = chunk.doc_id || 'unknown';
      if (!docChunksMap.has(docId)) {
        docChunksMap.set(docId, {
          recall_doc_id: docId,
          chunks: [],
          bestScore: 0,
        });
      }
      const entry = docChunksMap.get(docId)!;
      entry.chunks.push({
        chunk_id: chunk.chunk_id || '',
        score: chunk.score,
        content: chunk.content || '',
      });
      if (chunk.score > entry.bestScore) {
        entry.bestScore = chunk.score;
      }
    }

    // Step 4: 尝试将 recall 的 doc_id 映射到官方 API 文档
    // 策略：
    // 1. 直接 ID 匹配（recall doc_id == 官方 document_id）
    // 2. 内容片段匹配（recall 的可读文本与文档名称相关性）
    // 3. 跨库搜索时按搜索相关性排序匹配
    const mappedResults: Array<{
      doc_id: string;
      doc_name: string;
      dataset_id: string;
      dataset_name: string;
      char_count: number;
      size: number;
      format_type: number;
      source_type: number;
      status: number;
      score: number;
      matched_chunks: Array<{ chunk_id: string; score: number; text: string }>;
      is_mapped: boolean;
    }> = [];

    const usedOfficialIds = new Set<string>();

    for (const [recallDocId, entry] of docChunksMap) {
      let matchedOfficialDoc = false;

      // 策略1: 直接 ID 匹配
      if (docNameMap.has(recallDocId)) {
        const officialDoc = docNameMap.get(recallDocId)!;
        if (!usedOfficialIds.has(officialDoc.doc_id)) {
          mappedResults.push({
            doc_id: officialDoc.doc_id,
            doc_name: officialDoc.doc_name,
            dataset_id: officialDoc.dataset_id,
            dataset_name: officialDoc.dataset_name,
            char_count: officialDoc.char_count,
            size: officialDoc.size,
            format_type: officialDoc.format_type,
            source_type: officialDoc.source_type,
            status: officialDoc.status,
            score: entry.bestScore,
            matched_chunks: entry.chunks.map(c => ({
              chunk_id: c.chunk_id,
              score: c.score,
              text: isEncryptedContent(c.content) ? '' : cleanContent(c.content),
            })),
            is_mapped: true,
          });
          usedOfficialIds.add(officialDoc.doc_id);
          matchedOfficialDoc = true;
        }
      }

      // 策略2: 通过可读内容中的关键词匹配官方文档
      if (!matchedOfficialDoc) {
        const readableChunks = entry.chunks.filter(c => {
          const content = c.content || '';
          return content.length > 10 && !isEncryptedContent(content);
        });

        if (readableChunks.length > 0 && docNameMap.size > 0) {
          // 提取可读内容中的关键词
          const allReadableText = readableChunks.map(c => c.content).join(' ');
          const contentKeywords = new Set(extractKeywords(allReadableText));

          let bestMatch: { docId: string; score: number; doc: typeof docNameMap extends Map<string, infer V> ? V : never } | null = null;

          for (const [officialDocId, officialDoc] of docNameMap) {
            if (usedOfficialIds.has(officialDocId)) continue;

            // 计算内容关键词与文档名称的重合度
            const docNameKw = new Set(extractKeywords(officialDoc.doc_name));
            const overlap = [...contentKeywords].filter(kw => docNameKw.has(kw)).length;
            const matchScore = docNameKw.size > 0 ? overlap / docNameKw.size : 0;

            // 也考虑查询关键词与文档名称的匹配
            const queryKw = new Set(extractKeywords(query));
            const queryOverlap = [...queryKw].filter(kw => docNameKw.has(kw)).length;
            const queryMatchScore = queryKw.size > 0 ? queryOverlap / queryKw.size : 0;

            const combinedScore = matchScore * 0.6 + queryMatchScore * 0.4;

            if (combinedScore > 0.2 && (!bestMatch || combinedScore > bestMatch.score)) {
              bestMatch = { docId: officialDocId, score: combinedScore, doc: officialDoc };
            }
          }

          if (bestMatch && bestMatch.score > 0.2) {
            const officialDoc = bestMatch.doc;
            mappedResults.push({
              doc_id: officialDoc.doc_id,
              doc_name: officialDoc.doc_name,
              dataset_id: officialDoc.dataset_id,
              dataset_name: officialDoc.dataset_name,
              char_count: officialDoc.char_count,
              size: officialDoc.size,
              format_type: officialDoc.format_type,
              source_type: officialDoc.source_type,
              status: officialDoc.status,
              score: entry.bestScore,
              matched_chunks: entry.chunks.map(c => ({
                chunk_id: c.chunk_id,
                score: c.score,
                text: isEncryptedContent(c.content) ? '' : cleanContent(c.content),
              })),
              is_mapped: true,
            });
            usedOfficialIds.add(officialDoc.doc_id);
            matchedOfficialDoc = true;
          }
        }
      }

      // 如果无法匹配到官方 API 文档，使用 recall 结果直接展示
      if (!matchedOfficialDoc) {
        mappedResults.push({
          doc_id: recallDocId,
          doc_name: `文档 ${recallDocId.slice(-8)}`,
          dataset_id: dataset_id || '',
          dataset_name: '',
          char_count: 0,
          size: 0,
          format_type: 0,
          source_type: 0,
          status: 1,
          score: entry.bestScore,
          matched_chunks: entry.chunks.map(c => ({
            chunk_id: c.chunk_id,
            score: c.score,
            text: isEncryptedContent(c.content) ? '' : cleanContent(c.content),
          })),
          is_mapped: false,
        });
      }
    }

    // 按分数排序
    mappedResults.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      data: {
        documents: mappedResults,
        total: mappedResults.length,
        search_type: 'vector',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '搜索失败';
    console.error('[Coze Vector Search] Error:', message);
    return NextResponse.json({ success: false, error: message });
  }
}

/**
 * 判断内容是否为加密/编码内容
 * 加密内容通常包含大量非 ASCII 字符或类似 base64 编码的字符串
 */
function isEncryptedContent(content: string): boolean {
  if (!content || content.length < 10) return true;

  // HTML 内容是可读的
  if (content.trim().startsWith('<!doctype') || content.trim().startsWith('<html')) return false;
  if (content.trim().startsWith('<p>') || content.trim().startsWith('<div>')) return false;

  // 中文内容是可读的
  const chineseRatio = (content.match(/[\u4e00-\u9fff]/g) || []).length / content.length;
  if (chineseRatio > 0.1) return false;

  // 检查是否像 base64 编码（大量 +/ = 字符，无空格）
  const base64Like = /^[A-Za-z0-9+/=\s]+$/;
  if (base64Like.test(content) && content.length > 30) return true;

  // 检查是否是 PDF 元数据（>> %%EOF 等标记）
  if (content.includes('%%EOF') || content.includes('>>stream')) return true;
  if (/^(>>\s*)+$/.test(content.trim())) return true;

  // 检查可打印字符比例
  const printableRatio = (content.match(/[\x20-\x7E\n\r\t]/g) || []).length / content.length;
  if (printableRatio < 0.5) return true;

  return false;
}

/**
 * 清理内容：去除 HTML 标签，截取合理长度
 */
function cleanContent(content: string): string {
  if (!content) return '';

  let text = content;
  // 如果是 HTML，提取纯文本
  if (text.includes('<') && text.includes('>')) {
    text = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 截取最大 300 字符
  const maxLen = 300;
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

/**
 * 从文本中提取关键词
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fffa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
}
