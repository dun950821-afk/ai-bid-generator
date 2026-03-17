/**
 * 招标文档提取API
 * POST: 从招标文档中提取评分项和废标风险
 */

import { NextRequest, NextResponse } from 'next/server';
import { createScoringExtractionService } from '@/lib/services/scoring-extraction';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { HeaderUtils } from 'coze-coding-dev-sdk';

/**
 * 从招标文档提取评分项和废标风险
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { documentText, documentName, extractionType = 'full' } = body;

    if (!documentText) {
      return NextResponse.json(
        { success: false, error: '缺少documentText参数' },
        { status: 400 }
      );
    }

    if (!documentName) {
      return NextResponse.json(
        { success: false, error: '缺少documentName参数' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查项目是否存在
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 创建提取服务
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const extractionService = createScoringExtractionService(customHeaders);

    let result: any;

    // 根据提取类型执行不同的提取逻辑
    switch (extractionType) {
      case 'scoring':
        result = await extractionService.extractScoringItems(
          documentText,
          documentName
        );
        break;

      case 'risks':
        result = await extractionService.extractDisqualificationRisks(
          documentText,
          documentName
        );
        break;

      case 'full':
      default:
        result = await extractionService.extractFullInfo(documentText, documentName);
        break;
    }

    // 保存评分项到数据库
    if (result.scoringItems && result.scoringItems.length > 0) {
      const scoringItemsToInsert = result.scoringItems.map((item: any) => ({
        project_id: projectId,
        item_name: item.itemName,
        item_code: item.itemCode,
        item_type: item.itemType,
        parent_item_id: item.parentItemId,
        max_score: item.maxScore,
        weight: item.weight,
        scoring_rules: item.scoringRules || [],
        extracted_from: item.extractedFrom,
        confidence_score: item.confidenceScore ? Math.round(item.confidenceScore * 100) : null,
        response_status: 'pending',
      }));

      const { error: scoringError } = await client
        .from('scoring_items')
        .insert(scoringItemsToInsert);

      if (scoringError) {
        console.error('保存评分项失败:', scoringError);
      }
    }

    // 保存废标风险到数据库
    if (result.risks && result.risks.length > 0) {
      const risksToInsert = result.risks.map((risk: any) => ({
        project_id: projectId,
        risk_type: risk.riskType,
        risk_description: risk.riskDescription,
        source_text: risk.sourceText,
        source_location: risk.sourceLocation,
        severity: risk.severity || 'high',
        extracted_from: risk.extractedFrom,
        confidence_score: risk.confidenceScore ? Math.round(risk.confidenceScore * 100) : null,
        response_status: 'unresponded',
      }));

      const { error: risksError } = await client
        .from('disqualification_risks')
        .insert(risksToInsert);

      if (risksError) {
        console.error('保存废标风险失败:', risksError);
      }
    }

    // 更新项目状态
    await client
      .from('projects')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('招标文档提取失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '招标文档提取失败',
      },
      { status: 500 }
    );
  }
}
