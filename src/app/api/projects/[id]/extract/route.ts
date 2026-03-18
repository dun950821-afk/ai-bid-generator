import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { SCORING_EXTRACTION_PROMPT } from '@/lib/prompts/scoring-extraction';
import { loadModel } from '@/lib/llm';
import { createDocumentParser } from '@/lib/services/document-parser';

// POST /api/projects/[id]/extract - 提取评分项和废标风险
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { documentText, documentName, documentUrl } = body;

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

    // 获取文档内容
    let textContent = documentText;
    
    // 如果提供了文档URL，使用文档解析服务解析
    if (!textContent && documentUrl) {
      console.log('[extract] 使用文档解析服务解析URL:', documentUrl);
      const parser = createDocumentParser();
      const parseResult = await parser.parseFromUrl(documentUrl);
      
      if (parseResult.success && parseResult.document) {
        textContent = parseResult.document.content;
        console.log('[extract] 文档解析成功，内容长度:', textContent.length);
      } else {
        console.error('[extract] 文档解析失败:', parseResult.error);
        return NextResponse.json(
          { success: false, error: `文档解析失败: ${parseResult.error}` },
          { status: 400 }
        );
      }
    }

    if (!textContent) {
      return NextResponse.json(
        { success: false, error: '文档内容不能为空' },
        { status: 400 }
      );
    }

    // 构建Prompt
    const prompt = SCORING_EXTRACTION_PROMPT.replace('{documentContent}', textContent);

    // 调用LLM提取
    const model = loadModel();
    const response = await model.invoke(prompt);
    
    console.log('[extract] LLM响应长度:', response?.length || 0);

    // 解析响应
    let extractedData;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
        console.log('[extract] 解析后的数据:', JSON.stringify(extractedData, null, 2).substring(0, 1000));
      } else {
        throw new Error('无法解析LLM响应');
      }
    } catch (e) {
      console.error('解析响应失败:', e);
      console.error('[extract] 原始响应:', response?.substring(0, 1000));
      return NextResponse.json(
        { success: false, error: '解析提取结果失败' },
        { status: 500 }
      );
    }

    const scoringItems: any[] = [];
    const risks: any[] = [];

    console.log('[extract] extractedData keys:', Object.keys(extractedData || {}));
    console.log('[extract] extractedData.scoringItems:', extractedData?.scoringItems);
    console.log('[extract] extractedData.disqualificationRisks:', extractedData?.disqualificationRisks);
    console.log('[extract] extractedData.risks:', extractedData?.risks);

    // 保存评分项 - 支持多种字段名
    const items = extractedData.scoringItems || extractedData.scoring_items || [];
    console.log('[extract] 找到评分项数量:', items.length);
    
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        const { data, error } = await client
          .from('scoring_items')
          .insert({
            project_id: id,
            item_name: item.itemName || item.item_name,
            item_type: item.itemType || item.item_type,
            max_score: item.maxScore || item.max_score || 0,
            scoring_rules: item.scoringRules || item.scoring_rules || [],
            sort_order: i,
            response_status: 'pending',
          })
          .select()
          .single();

        if (error) {
          console.error('[extract] 保存评分项失败:', error.message);
        } else if (data) {
          scoringItems.push(data);
        }
      }
    }

    // 保存废标风险 - 支持多种字段名
    const riskItems = extractedData.disqualificationRisks || extractedData.risks || extractedData.disqualification_risks || [];
    console.log('[extract] 找到风险项数量:', riskItems.length);
    
    if (riskItems && riskItems.length > 0) {
      for (const risk of riskItems) {
        const { data, error } = await client
          .from('disqualification_risks')
          .insert({
            project_id: id,
            risk_type: risk.riskType || risk.risk_type || 'other',
            risk_description: risk.description || risk.riskDescription || risk.risk_description,
            severity: risk.severity || 'medium',
            source_text: risk.sourceText || risk.source_text,
            mitigation_suggestion: risk.mitigationSuggestion || risk.mitigation_suggestion,
            response_status: 'unresponded',
          })
          .select()
          .single();

        if (error) {
          console.error('[extract] 保存风险项失败:', error);
        } else if (data) {
          risks.push(data);
        }
      }
    }

    // 更新项目状态和文档信息
    const currentMetadata = project.metadata || {};
    await client
      .from('projects')
      .update({
        status: 'processing',
        description: project.description + `\n\n## 文档来源\n${documentName}`,
        metadata: {
          ...currentMetadata,
          uploadedDocument: {
            name: documentName,
            url: documentUrl,
            extracted: true,
            uploadedAt: new Date().toISOString(),
          },
        },
      })
      .eq('id', id);

    return NextResponse.json({
      success: true,
      data: {
        scoringItems,
        risks,
        summary: {
          totalScore: scoringItems.reduce((sum, item) => sum + item.max_score, 0),
          itemCount: scoringItems.length,
          riskCount: risks.length,
        },
      },
    });
  } catch (error) {
    console.error('提取失败:', error);
    const errorMsg = error instanceof Error ? error.message : '提取失败';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[extract] 错误详情:', errorMsg, errorStack);
    return NextResponse.json(
      { success: false, error: errorMsg, stack: process.env.NODE_ENV === 'development' ? errorStack : undefined },
      { status: 500 }
    );
  }
}
