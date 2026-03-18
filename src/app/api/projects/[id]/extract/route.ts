import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { SCORING_EXTRACTION_PROMPT } from '@/lib/prompts/scoring-extraction';
import { loadModel } from '@/lib/llm';

// POST /api/projects/[id]/extract - 提取评分项和废标风险
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { documentText, documentName } = body;

    if (!documentText) {
      return NextResponse.json(
        { success: false, error: '文档内容不能为空' },
        { status: 400 }
      );
    }

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

    // 构建Prompt
    const prompt = SCORING_EXTRACTION_PROMPT.replace('{documentContent}', documentText);

    // 调用LLM提取
    const model = loadModel();
    const response = await model.invoke(prompt);

    // 解析响应
    let extractedData;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析LLM响应');
      }
    } catch (e) {
      console.error('解析响应失败:', e);
      return NextResponse.json(
        { success: false, error: '解析提取结果失败' },
        { status: 500 }
      );
    }

    const scoringItems: any[] = [];
    const risks: any[] = [];

    // 保存评分项
    if (extractedData.scoringItems && extractedData.scoringItems.length > 0) {
      for (let i = 0; i < extractedData.scoringItems.length; i++) {
        const item = extractedData.scoringItems[i];
        const { data, error } = await client
          .from('scoring_items')
          .insert({
            project_id: id,
            item_name: item.itemName,
            item_type: item.itemType,
            max_score: item.maxScore || 0,
            scoring_rules: item.scoringRules || [],
            reference_text: item.referenceText,
            order_index: i,
            response_status: 'unresponded',
          })
          .select()
          .single();

        if (!error && data) {
          scoringItems.push(data);
        }
      }
    }

    // 保存废标风险
    if (extractedData.disqualificationRisks && extractedData.disqualificationRisks.length > 0) {
      for (const risk of extractedData.disqualificationRisks) {
        const { data, error } = await client
          .from('disqualification_risks')
          .insert({
            project_id: id,
            risk_type: risk.riskType,
            risk_description: risk.description,
            severity: risk.severity || 'medium',
            source_text: risk.sourceText,
            mitigation_suggestion: risk.mitigationSuggestion,
            response_status: 'unresponded',
          })
          .select()
          .single();

        if (!error && data) {
          risks.push(data);
        }
      }
    }

    // 更新项目状态
    await client
      .from('projects')
      .update({
        status: 'processing',
        description: project.description + `\n\n## 文档来源\n${documentName}`,
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
