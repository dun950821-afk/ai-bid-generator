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
    console.log('[extract] 修复后仍无法解析，尝试提取部分数据');
    // 返回一个空对象而不是抛出错误，让后续逻辑处理
    return {
      projectInfo: {},
      timeline: {},
      coreTechDemand: { techRequirements: [], functionalRequirements: [], deliverables: [] },
      businessRequirements: { qualificationRequirements: [], teamRequirements: [], serviceRequirements: [] },
      scoringStandard: { scoringItems: [], disqualificationRisks: [] },
      biddingDocumentRequirements: { technicalDocuments: [], businessDocuments: [], formatRequirements: [] },
      projectBackground: {},
      otherImportantInfo: {}
    };
  }
}

/**
 * 驼峰转下划线命名
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * 将对象键转换为下划线命名
 */
function keysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => keysToSnakeCase(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[camelToSnake(key)] = keysToSnakeCase(value);
    }
    return result;
  }
  return obj;
}

// POST /api/projects/[id]/extract - 提取招标文档信息
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
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
    } catch (e) {
      console.error('解析响应失败:', e);
      console.error('[extract] 原始响应:', response?.substring(0, 2000));
      return NextResponse.json(
        { success: false, error: '解析提取结果失败: ' + (e instanceof Error ? e.message : '未知错误') },
        { status: 500 }
      );
    }

    // 提取各部分数据
    const projectInfo = extractedData.projectInfo || extractedData.project_info || {};
    const timeline = extractedData.timeline || {};
    const coreTechDemand = extractedData.coreTechDemand || extractedData.core_tech_demand || {};
    const businessRequirements = extractedData.businessRequirements || extractedData.business_requirements || {};
    const scoringStandard = extractedData.scoringStandard || extractedData.scoring_standard || {};
    const biddingDocumentRequirements = extractedData.biddingDocumentRequirements || extractedData.bidding_document_requirements || {};
    const projectBackground = extractedData.projectBackground || extractedData.project_background || {};
    const otherImportantInfo = extractedData.otherImportantInfo || extractedData.other_important_info || {};

    // 从评分标准中提取评分项和废标风险
    const scoringItems = scoringStandard.scoringItems || scoringStandard.scoring_items || [];
    const disqualificationRisks = scoringStandard.disqualificationRisks || scoringStandard.disqualification_risks || [];

    console.log('[extract] 找到评分项数量:', scoringItems.length);
    console.log('[extract] 找到风险项数量:', disqualificationRisks.length);

    // 计算总分
    const totalScore = scoringItems.reduce((sum: number, item: any) => 
      sum + (item.maxScore || item.max_score || 0), 0);

    // 删除旧的提取结果
    await client
      .from('tender_extraction_results')
      .delete()
      .eq('project_id', id);

    // 保存完整的提取结果
    const extractionTimeMs = Date.now() - startTime;
    const { error: extractionError } = await client
      .from('tender_extraction_results')
      .insert({
        project_id: id,
        
        // 项目基本信息
        project_name: projectInfo.projectName || projectInfo.project_name,
        project_number: projectInfo.projectNumber || projectInfo.project_number,
        purchase_unit: projectInfo.purchaseUnit || projectInfo.purchase_unit,
        purchase_unit_contact: projectInfo.purchaseUnitContact || projectInfo.purchase_unit_contact,
        purchase_unit_phone: projectInfo.purchaseUnitPhone || projectInfo.purchase_unit_phone,
        purchase_unit_email: projectInfo.purchaseUnitEmail || projectInfo.purchase_unit_email,
        purchase_unit_address: projectInfo.purchaseUnitAddress || projectInfo.purchase_unit_address,
        project_type: projectInfo.projectType || projectInfo.project_type,
        procurement_method: projectInfo.procurementMethod || projectInfo.procurement_method,
        project_budget: projectInfo.projectBudget || projectInfo.project_budget,
        budget_source: projectInfo.budgetSource || projectInfo.budget_source,
        project_cycle: projectInfo.projectCycle || projectInfo.project_cycle,
        delivery_period: projectInfo.deliveryPeriod || projectInfo.delivery_period,
        warranty_period: projectInfo.warrantyPeriod || projectInfo.warranty_period,
        
        // 时间节点
        bid_publish_date: timeline.bidPublishDate || timeline.bid_publish_date,
        bid_document_sale_start: timeline.bidDocumentSaleStart || timeline.bid_document_sale_start,
        bid_document_sale_end: timeline.bidDocumentSaleEnd || timeline.bid_document_sale_end,
        question_deadline: timeline.questionDeadline || timeline.question_deadline,
        answer_publish_date: timeline.answerPublishDate || timeline.answer_publish_date,
        site_visit_date: timeline.siteVisitDate || timeline.site_visit_date,
        bid_submission_deadline: timeline.bidSubmissionDeadline || timeline.bid_submission_deadline,
        bid_opening_date: timeline.bidOpeningDate || timeline.bid_opening_date,
        bid_opening_location: timeline.bidOpeningLocation || timeline.bid_opening_location,
        
        // JSON字段
        core_tech_demand: keysToSnakeCase(coreTechDemand),
        business_requirements: keysToSnakeCase(businessRequirements),
        scoring_standard: keysToSnakeCase(scoringStandard),
        bidding_document_requirements: keysToSnakeCase(biddingDocumentRequirements),
        project_background: keysToSnakeCase(projectBackground),
        other_important_info: keysToSnakeCase(otherImportantInfo),
        
        // 摘要
        total_score: totalScore,
        item_count: scoringItems.length,
        risk_count: disqualificationRisks.length,
        
        // 完整结果
        full_extraction_result: keysToSnakeCase(extractedData),
        
        // 元数据
        extraction_model: 'doubao-seed-1-6',
        confidence_score: 0.9,
        extraction_time_ms: extractionTimeMs,
        document_name: documentName,
        status: 'completed',
      });

    if (extractionError) {
      console.error('[extract] 保存提取结果失败:', extractionError);
      // 继续执行，尝试保存到旧表
    }

    // 删除旧的评分项和风险项
    await client.from('scoring_items').delete().eq('project_id', id);
    await client.from('disqualification_risks').delete().eq('project_id', id);

    // 保存评分项到 scoring_items 表（保持兼容性）
    const savedScoringItems: any[] = [];
    for (let i = 0; i < scoringItems.length; i++) {
      const item = scoringItems[i];
      
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
        savedScoringItems.push(data);
      }
    }

    // 保存废标风险到 disqualification_risks 表（保持兼容性）
    const savedRisks: any[] = [];
    for (const risk of disqualificationRisks) {
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
        savedRisks.push(data);
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
        projectInfo,
        timeline,
        coreTechDemand,
        businessRequirements,
        scoringStandard,
        biddingDocumentRequirements,
        projectBackground,
        otherImportantInfo,
        // 兼容旧接口
        scoringItems: savedScoringItems,
        risks: savedRisks,
        summary: {
          totalScore,
          itemCount: scoringItems.length,
          riskCount: disqualificationRisks.length,
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
