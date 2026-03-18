import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { SCORING_EXTRACTION_PROMPT } from '@/lib/prompts/scoring-extraction';
import { loadModel } from '@/lib/llm';
import { createDocumentParser } from '@/lib/services/document-parser';

/**
 * 从LLM响应中提取JSON内容
 * 处理思考过程和其他非JSON内容
 */
function extractJSONFromResponse(response: string): string {
  // 1. 尝试直接匹配JSON对象
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  // 2. 尝试匹配代码块中的JSON
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.startsWith('{')) {
      return content;
    }
  }
  
  // 3. 查找第一个 { 和最后一个 }
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return response.substring(firstBrace, lastBrace + 1);
  }
  
  return response;
}

/**
 * 尝试修复不完整的JSON
 */
function repairIncompleteJSON(jsonStr: string): any {
  // 先清理可能的前后空白和特殊字符
  jsonStr = jsonStr.trim();
  
  // 尝试直接解析
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.log('[extract] JSON解析失败，尝试修复...');
  }

  // 尝试找到截断位置并修复
  let fixed = jsonStr;
  
  // 统计未闭合的括号
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
  }
  
  // 如果在字符串中截断，先闭合字符串
  if (inString) {
    fixed += '"';
  }
  
  // 闭合未闭合的数组和对象
  while (bracketCount > 0) {
    fixed += ']';
    bracketCount--;
  }
  while (braceCount > 0) {
    fixed += '}';
    braceCount--;
  }
  
  console.log('[extract] 修复后的JSON长度:', fixed.length);
  
  try {
    return JSON.parse(fixed);
  } catch (e) {
    // 最后尝试：提取已有的完整项
    console.log('[extract] 修复后仍无法解析，尝试提取部分数据');
    
    // 尝试提取 scoringItems - 使用更宽松的匹配
    const result: any = {
      scoringItems: [],
      disqualificationRisks: [],
      summary: { totalScore: 0, itemCount: 0, riskCount: 0 }
    };
    
    // 匹配 scoringItems 数组
    const scoringMatch = fixed.match(/"scoringItems"\s*:\s*\[([\s\S]*?)(?:\]|\Z)/);
    if (scoringMatch && scoringMatch[1]) {
      try {
        // 尝试逐个提取对象
        const itemsStr = '[' + scoringMatch[1];
        // 尝试闭合数组
        const itemsMatch = itemsStr.match(/\[[\s\S]*?\]/);
        if (itemsMatch) {
          const items = JSON.parse(itemsMatch[0]);
          result.scoringItems = items;
          result.summary.itemCount = items.length;
          result.summary.totalScore = items.reduce((sum: number, item: any) => sum + (item.maxScore || item.max_score || 0), 0);
          console.log('[extract] 成功提取 scoringItems:', items.length, '项');
        }
      } catch (e) {
        console.log('[extract] 无法提取scoringItems:', e);
        // 尝试提取单个对象
        const itemMatches = fixed.matchAll(/\{\s*"itemName"\s*:\s*"[^"]*"[^}]*\}/g);
        const items = [];
        for (const match of itemMatches) {
          try {
            items.push(JSON.parse(match[0]));
          } catch (e2) {
            // 忽略单个解析错误
          }
        }
        if (items.length > 0) {
          result.scoringItems = items;
          result.summary.itemCount = items.length;
          console.log('[extract] 通过逐个对象提取到 scoringItems:', items.length, '项');
        }
      }
    }
    
    // 匹配 disqualificationRisks 数组
    const risksMatch = fixed.match(/"disqualificationRisks"\s*:\s*\[([\s\S]*?)(?:\]|\Z)/);
    if (risksMatch && risksMatch[1]) {
      try {
        const risksStr = '[' + risksMatch[1];
        const risksMatchArr = risksStr.match(/\[[\s\S]*?\]/);
        if (risksMatchArr) {
          const risks = JSON.parse(risksMatchArr[0]);
          result.disqualificationRisks = risks;
          result.summary.riskCount = risks.length;
          console.log('[extract] 成功提取 risks:', risks.length, '项');
        }
      } catch (e) {
        console.log('[extract] 无法提取risks:', e);
        // 尝试提取单个风险对象
        const riskMatches = fixed.matchAll(/\{\s*"riskType"\s*:\s*"[^"]*"[^}]*\}/g);
        const risks = [];
        for (const match of riskMatches) {
          try {
            risks.push(JSON.parse(match[0]));
          } catch (e2) {
            // 忽略单个解析错误
          }
        }
        if (risks.length > 0) {
          result.disqualificationRisks = risks;
          result.summary.riskCount = risks.length;
          console.log('[extract] 通过逐个对象提取到 risks:', risks.length, '项');
        }
      }
    }
    
    return result;
  }
}

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

    // 调用LLM提取 - 禁用思考模式以确保返回纯JSON
    const model = loadModel({ enableThinking: false });
    const response = await model.invoke(prompt);
    
    console.log('[extract] LLM响应长度:', response?.length || 0);
    console.log('[extract] LLM响应前500字符:', response?.substring(0, 500));

    // 解析响应 - 先提取JSON内容
    let extractedData;
    try {
      // 使用新的提取函数处理思考过程等非JSON内容
      const jsonStr = extractJSONFromResponse(response);
      console.log('[extract] 提取的JSON长度:', jsonStr.length);
      console.log('[extract] 提取的JSON前200字符:', jsonStr.substring(0, 200));
      
      extractedData = repairIncompleteJSON(jsonStr);
      console.log('[extract] 解析后的数据 keys:', Object.keys(extractedData || {}));
      console.log('[extract] scoringItems数量:', extractedData?.scoringItems?.length || 0);
      console.log('[extract] risks数量:', extractedData?.disqualificationRisks?.length || extractedData?.risks?.length || 0);
      
      if (!extractedData.scoringItems?.length && !extractedData.disqualificationRisks?.length) {
        console.warn('[extract] 警告: 未提取到任何评分项或风险项');
      }
    } catch (e) {
      console.error('解析响应失败:', e);
      console.error('[extract] 原始响应:', response?.substring(0, 2000));
      return NextResponse.json(
        { success: false, error: '解析提取结果失败: ' + (e instanceof Error ? e.message : '未知错误') },
        { status: 500 }
      );
    }

    const scoringItems: any[] = [];
    const risks: any[] = [];

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
