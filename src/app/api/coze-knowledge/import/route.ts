import { NextRequest, NextResponse } from 'next/server';
import {
  createDocumentByText,
  createDocumentByUrl,
} from '@/lib/services/coze-api-client';
import { KnowledgeClient } from 'coze-coding-dev-sdk';

export const maxDuration = 300;

/**
 * 导入文档到扣子知识库（双写机制）
 * 
 * 1. 通过官方 Coze Open API (api.coze.cn) 导入文档 → 用于文档管理和预览
 * 2. 通过 SDK batch_import (integration.coze.cn) 导入文档 → 用于向量搜索
 * 
 * 这样确保文档在两个空间都存在：
 * - 官方空间：支持文档列表、预览、删除等管理操作
 * - Integration 空间：支持向量语义搜索（recall API）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, url, source_type = 'text', dataset_id, chunk_strategy } = body;

    if (!dataset_id) {
      return NextResponse.json(
        { success: false, error: '必须提供 dataset_id（知识库 ID）' },
        { status: 400 }
      );
    }

    let officialResult: Array<{ id: string; name: string }>;
    let sdkDocIds: string[] = [];
    let sdkImportMsg = '';

    if (source_type === 'url') {
      // URL 导入
      if (!url) {
        return NextResponse.json(
          { success: false, error: 'URL 不能为空' },
          { status: 400 }
        );
      }
      const docTitle = title || new URL(url).hostname;
      
      // Step 1: 官方 API 导入
      officialResult = await createDocumentByUrl(dataset_id, docTitle, url, chunk_strategy);
      
      // Step 2: SDK batch_import 导入（用于向量搜索）
      try {
        const sdkResult = await sdkImportUrl(dataset_id, docTitle, url);
        sdkDocIds = sdkResult.doc_ids || [];
        sdkImportMsg = sdkDocIds.length > 0 ? `，已同步到搜索空间(${sdkDocIds.length}篇)` : '';
      } catch (sdkErr) {
        console.warn('[Coze Import] SDK 导入失败（不影响官方API导入）:', sdkErr);
        sdkImportMsg = '，搜索空间同步失败';
      }

      return NextResponse.json({
        success: true,
        data: {
          official: officialResult,
          sdk_doc_ids: sdkDocIds,
        },
        message: `URL「${url}」已提交，正在后台处理${sdkImportMsg}`,
      });
    } else {
      // 文本内容导入
      if (!content) {
        return NextResponse.json(
          { success: false, error: '文本内容不能为空' },
          { status: 400 }
        );
      }
      const docTitle = title || `文本文档 ${new Date().toLocaleString('zh-CN')}`;
      
      // Step 1: 官方 API 导入
      officialResult = await createDocumentByText(dataset_id, docTitle, content, chunk_strategy);
      
      // Step 2: SDK batch_import 导入（用于向量搜索）
      try {
        const sdkResult = await sdkImportText(dataset_id, docTitle, content);
        sdkDocIds = sdkResult.doc_ids || [];
        sdkImportMsg = sdkDocIds.length > 0 ? `，已同步到搜索空间(${sdkDocIds.length}篇)` : '';
      } catch (sdkErr) {
        console.warn('[Coze Import] SDK 导入失败（不影响官方API导入）:', sdkErr);
        sdkImportMsg = '，搜索空间同步失败';
      }

      return NextResponse.json({
        success: true,
        data: {
          official: officialResult,
          sdk_doc_ids: sdkDocIds,
        },
        message: `文档「${docTitle}」已提交，提取文本 ${content.length} 字符${sdkImportMsg}`,
      });
    }
  } catch (error) {
    console.error('[Coze Knowledge] 导入文档失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

/**
 * 通过 SDK batch_import 导入文本内容到 integration 空间
 * 使用 dataset_id 作为表名（因为中文 dataset 名会导致 batch_import 失败）
 */
async function sdkImportText(
  datasetId: string,
  name: string,
  content: string,
): Promise<{ doc_ids: string[]; code: number; msg: string }> {
  const client = new KnowledgeClient();
  const result = await client.addDocuments(
    [{ source: 0, raw_data: content }],  // DataSourceType.TEXT = 0
    datasetId,  // 使用 dataset_id 作为表名
    { separator: '\n', max_tokens: 800 },
  );
  console.log(`[Coze Import] SDK batch_import 文本成功: doc_ids=${result.doc_ids}`);
  return { doc_ids: result.doc_ids || [], code: result.code ?? 0, msg: result.msg || '' };
}

/**
 * 通过 SDK batch_import 导入 URL 到 integration 空间
 */
async function sdkImportUrl(
  datasetId: string,
  name: string,
  url: string,
): Promise<{ doc_ids: string[]; code: number; msg: string }> {
  const client = new KnowledgeClient();
  const result = await client.addDocuments(
    [{ source: 1, url }],  // DataSourceType.URL = 1
    datasetId,  // 使用 dataset_id 作为表名
    { separator: '\n', max_tokens: 800 },
  );
  console.log(`[Coze Import] SDK batch_import URL成功: doc_ids=${result.doc_ids}`);
  return { doc_ids: result.doc_ids || [], code: result.code ?? 0, msg: result.msg || '' };
}
