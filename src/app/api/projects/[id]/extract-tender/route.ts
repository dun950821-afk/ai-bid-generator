/**
 * 招标文档提取API
 * 使用LLM按照Schema提取招标文档信息
 * 支持流式和完整提取
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createTenderDocumentExtractor } from '@/lib/services/tender-extractor';
import { createDocumentParser } from '@/lib/services/document-parser';
import {
  TenderDocumentExtractionResult,
  createEmptyExtractionResult,
} from '@/types/tender-extraction';

// POST /api/projects/[id]/extract-tender - 提取招标文档信息（流式）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { documentId, useStreaming = true } = body;

    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id, name, tender_document_id')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取招标文档
    const docId = documentId || project.tender_document_id;
    if (!docId) {
      return NextResponse.json(
        { success: false, error: '未找到招标文档' },
        { status: 400 }
      );
    }

    const { data: document, error: docError } = await client
      .from('documents')
      .select('*')
      .eq('id', docId)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { success: false, error: '招标文档不存在' },
        { status: 404 }
      );
    }

    // 创建提取器
    const extractor = createTenderDocumentExtractor({ useStreaming });

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送开始消息
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'start', data: { documentName: document.filename } })}\n\n`)
          );

          // 读取文档内容
          let documentText = '';
          
          if (document.content) {
            documentText = document.content;
          } else if (document.storage_path) {
            // 从存储服务读取文档
            const parser = createDocumentParser();
            const result = await parser.parseFromUrl(document.storage_path);
            if (result.success && result.document) {
              documentText = result.document.content;
            }
          }

          if (!documentText) {
            throw new Error('文档内容为空');
          }

          // 执行流式提取
          for await (const chunk of extractor.extractStreaming(
            documentText,
            document.filename,
            document.page_count || 0
          )) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }

          // 完整提取结果
          const fullResult = await extractor.extract(
            documentText,
            document.filename,
            document.page_count || 0
          );

          // 保存提取结果到数据库
          await saveExtractionResult(client, id, docId, fullResult);

          // 发送完成消息
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'complete', data: fullResult })}\n\n`)
          );

          controller.close();
        } catch (error) {
          console.error('提取失败:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : '提取失败' })}\n\n`)
          );
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
    console.error('招标文档提取失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '提取失败' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[id]/extract-tender - 获取提取结果
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // 从metadata中获取提取结果
    const extractionResult = project.metadata?.tender_extraction as TenderDocumentExtractionResult | undefined;

    if (!extractionResult) {
      return NextResponse.json({
        success: true,
        data: {
          hasResult: false,
          message: '尚未提取招标文档信息',
        },
      });
    }

    // 获取评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    // 获取风险因素
    const { data: riskFactors } = await client
      .from('risk_factors')
      .select('*')
      .eq('project_id', id)
      .order('severity', { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        hasResult: true,
        extractionResult,
        scoringItems: scoringItems || [],
        riskFactors: riskFactors || [],
      },
    });
  } catch (error) {
    console.error('获取提取结果失败:', error);
    return NextResponse.json(
      { success: false, error: '获取提取结果失败' },
      { status: 500 }
    );
  }
}

/**
 * 保存提取结果到数据库
 */
async function saveExtractionResult(
  client: ReturnType<typeof getSupabaseClient>,
  projectId: string,
  documentId: string,
  result: TenderDocumentExtractionResult
): Promise<void> {
  try {
    // 1. 更新项目基本信息
    await client
      .from('projects')
      .update({
        project_number: result.project_basic_info.project_number,
        metadata: {
          ...result,
          tender_extraction: result,
        },
      })
      .eq('id', projectId);

    // 2. 保存评分项
    const allScoringItems = [
      ...result.scoring_standard.tech_scoring.scoring_items.map(item => ({
        project_id: projectId,
        item_type: 'technical',
        item_name: item.item_name,
        item_code: item.item_code,
        max_score: item.max_score,
        weight: item.weight,
        scoring_rules: item.score_details,
        scoring_method: item.scoring_method,
      })),
      ...result.scoring_standard.business_scoring.scoring_items.map(item => ({
        project_id: projectId,
        item_type: 'business',
        item_name: item.item_name,
        item_code: item.item_code,
        max_score: item.max_score,
        weight: item.weight,
        scoring_rules: item.score_details,
        scoring_method: item.scoring_method,
      })),
      {
        project_id: projectId,
        item_type: 'price',
        item_name: '价格评分',
        max_score: result.scoring_standard.price_scoring.total_score,
        scoring_method: result.scoring_standard.price_scoring.scoring_method,
        scoring_rules: result.scoring_standard.price_scoring.formula ? [result.scoring_standard.price_scoring.formula] : [],
      },
    ];

    if (allScoringItems.length > 0) {
      // 删除旧的评分项
      await client
        .from('scoring_items')
        .delete()
        .eq('project_id', projectId);

      // 插入新的评分项
      await client
        .from('scoring_items')
        .insert(allScoringItems);
    }

    // 3. 保存风险因素（从废标条款转换）
    const riskFactors = [
      ...result.key_compliance_requirements.disqualification_rules.map(rule => ({
        project_id: projectId,
        risk_type: 'disqualification',
        severity: 'high',
        risk_description: rule,
        source_text: rule,
        suggestion: '严格遵守此项要求，避免废标',
        response_status: 'pending',
      })),
      ...result.key_compliance_requirements.major_deviation_rules.map(rule => ({
        project_id: projectId,
        risk_type: 'major_deviation',
        severity: 'medium',
        risk_description: rule,
        source_text: rule,
        suggestion: '确保响应不偏离此项要求',
        response_status: 'pending',
      })),
      ...result.key_compliance_requirements.bid_restrictions.map(rule => ({
        project_id: projectId,
        risk_type: 'restriction',
        severity: 'medium',
        risk_description: rule,
        source_text: rule,
        suggestion: '注意遵守此项限制',
        response_status: 'pending',
      })),
    ];

    if (riskFactors.length > 0) {
      // 删除旧的风险因素
      await client
        .from('risk_factors')
        .delete()
        .eq('project_id', projectId);

      // 插入新的风险因素
      await client
        .from('risk_factors')
        .insert(riskFactors);
    }

    // 4. 更新文档状态
    await client
      .from('documents')
      .update({
        status: 'extracted',
        metadata: {
          extraction_time: result.extraction_metadata.extraction_time,
          confidence_score: result.extraction_metadata.confidence_score,
        },
      })
      .eq('id', documentId);

  } catch (error) {
    console.error('保存提取结果失败:', error);
    throw error;
  }
}

/**
 * 创建提取任务
 */
async function createExtractionTask(
  client: ReturnType<typeof getSupabaseClient>,
  projectId: string,
  documentId: string
): Promise<string> {
  const { data, error } = await client
    .from('extraction_tasks')
    .insert({
      project_id: projectId,
      document_id: documentId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}
