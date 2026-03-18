import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { SCORING_EXTRACTION_PROMPT } from '@/lib/prompts/scoring-extraction';
import { loadModel } from '@/lib/llm';
import { createDocumentParser } from '@/lib/services/document-parser';
import { createSegmentedExtractionService } from '@/lib/services/segmented-extraction';

/**
 * 从LLM响应中提取JSON内容
 */
function extractJSONFromResponse(response: string): string {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.startsWith('{')) {
      return content;
    }
  }
  
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return response.substring(firstBrace, lastBrace + 1);
  }
  
  return response;
}

/**
 * 修复不完整的JSON
 */
function repairIncompleteJSON(jsonStr: string): any {
  jsonStr = jsonStr.trim();
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.log('[extract-tender] JSON解析失败，尝试修复...');
  }

  let fixed = jsonStr;
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
  
  if (inString) {
    fixed += '"';
  }
  
  while (bracketCount > 0) {
    fixed += ']';
    bracketCount--;
  }
  while (braceCount > 0) {
    fixed += '}';
    braceCount--;
  }
  
  try {
    return JSON.parse(fixed);
  } catch (e) {
    console.log('[extract-tender] 修复后仍无法解析，尝试提取部分数据');
    console.log('[extract-tender] 错误:', e instanceof Error ? e.message : '未知错误');
    
    // 尝试使用正则表达式提取关键数据
    const result: any = {};
    
    // 定义需要提取的所有字段
    const fields = [
      'projectBasicInfo', 'timeSchedule', 'coreTechDemand', 
      'businessRequirements', 'scoringStandard', 'disqualificationRisks',
      'biddingDocumentRequirements', 'projectBackground', 'otherImportantInfo'
    ];
    
    // 逐个字段提取
    for (const field of fields) {
      const pattern = new RegExp(`"${field}"\\s*:\\s*(\\{|\\[)`, 'g');
      const match = pattern.exec(fixed);
      
      if (match) {
        const startIdx = match.index + match[0].length - 1;
        
        try {
          // 尝试找到匹配的结束符
          let depth = 1;
          let endIdx = startIdx + 1;
          
          while (depth > 0 && endIdx < fixed.length) {
            const char = fixed[endIdx];
            if (char === '{' || char === '[') depth++;
            if (char === '}' || char === ']') depth--;
            endIdx++;
          }
          
          const fieldContent = fixed.substring(startIdx, endIdx);
          result[field] = JSON.parse(fieldContent);
          console.log(`[extract-tender] 成功提取 ${field}`);
        } catch (e2) {
          // 尝试修复后提取
          try {
            const startIdx = match.index + match[0].length - 1;
            let content = fixed.substring(startIdx);
            
            let braceCount2 = 0;
            let bracketCount2 = 0;
            let inString2 = false;
            let escape2 = false;
            
            for (let i = 0; i < content.length; i++) {
              const char = content[i];
              if (escape2) { escape2 = false; continue; }
              if (char === '\\') { escape2 = true; continue; }
              if (char === '"') { inString2 = !inString2; continue; }
              if (inString2) continue;
              if (char === '{') braceCount2++;
              if (char === '}') braceCount2--;
              if (char === '[') bracketCount2++;
              if (char === ']') bracketCount2--;
              
              if (braceCount2 === 0 && bracketCount2 === 0 && i > 0) {
                content = content.substring(0, i + 1);
                break;
              }
            }
            
            if (inString2) content += '"';
            while (bracketCount2 > 0) { content += ']'; bracketCount2--; }
            while (braceCount2 > 0) { content += '}'; braceCount2--; }
            
            result[field] = JSON.parse(content);
            console.log(`[extract-tender] 通过修复成功提取 ${field}`);
          } catch (e3) {
            console.log(`[extract-tender] 提取 ${field} 失败`);
            if (field === 'scoringStandard') {
              result[field] = { techScoring: { scoringItems: [] }, businessScoring: { scoringItems: [] }, priceScoring: {} };
            } else if (field === 'disqualificationRisks') {
              result[field] = [];
            } else {
              result[field] = {};
            }
          }
        }
      }
    }
    
    return result;
  }
}

/**
 * GET /api/projects/[id]/extract-tender
 * 获取招标文档提取结果
 */
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

    // 获取提取结果
    const { data: extractionResult, error: extractionError } = await client
      .from('tender_extraction_results')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (extractionError && extractionError.code !== 'PGRST116') {
      console.error('[extract-tender] 查询失败:', extractionError);
    }

    const hasResult = !!extractionResult;

    return NextResponse.json({
      success: true,
      data: {
        hasResult,
        extractionResult: extractionResult || null,
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          metadata: project.metadata,
        },
      },
    });
  } catch (error) {
    console.error('[extract-tender] 获取失败:', error);
    return NextResponse.json(
      { success: false, error: '获取提取结果失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/extract-tender
 * 执行招标文档提取
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { id } = await params;
    const body = await req.json();
    const { documentUrl, documentName } = body;

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

    // 获取文档URL
    let docUrl = documentUrl;
    let docName = documentName;
    
    if (!docUrl && project.metadata?.uploadedDocument?.url) {
      docUrl = project.metadata.uploadedDocument.url;
      docName = project.metadata.uploadedDocument.name;
    }

    if (!docUrl) {
      return NextResponse.json(
        { success: false, error: '请先上传招标文档' },
        { status: 400 }
      );
    }

    // 解析文档
    console.log('[extract-tender] 解析文档:', docUrl);
    const parser = createDocumentParser();
    const parseResult = await parser.parseFromUrl(docUrl);
    
    if (!parseResult.success || !parseResult.document) {
      return NextResponse.json(
        { success: false, error: `文档解析失败: ${parseResult.error}` },
        { status: 400 }
      );
    }

    const textContent = parseResult.document.content;
    console.log('[extract-tender] 文档内容长度:', textContent.length);

    // 使用分段提取服务
    const extractionService = createSegmentedExtractionService();
    const extractionResult = await extractionService.extract(textContent);
    
    console.log('[extract-tender] 提取策略:', extractionResult.extractionMetadata.strategy);
    console.log('[extract-tender] 提取耗时:', extractionResult.extractionMetadata.extractionTimeMs, 'ms');

    // 直接使用分段提取的结果
    const projectInfo = extractionResult.projectBasicInfo || {};
    const timeline = extractionResult.timeSchedule || {};
    const coreTechDemand = extractionResult.coreTechDemand || {};
    const businessRequirements = extractionResult.businessRequirements || {};
    const scoringStandard = extractionResult.scoringStandard || {};
    const biddingDocumentRequirements = extractionResult.biddingDocumentRequirements || {};
    const projectBackground = extractionResult.projectBackground || {};
    const otherImportantInfo = extractionResult.otherImportantInfo || {};
    const disqualificationRisks = extractionResult.disqualificationRisks || [];
    
    // 构建完整的提取数据（用于保存）
    const extractedData = {
      projectBasicInfo: projectInfo,
      timeSchedule: timeline,
      coreTechDemand,
      businessRequirements,
      scoringStandard,
      biddingDocumentRequirements,
      projectBackground,
      otherImportantInfo,
      disqualificationRisks,
    };

    // 提取评分项
    let scoringItems: any[] = [];
    const techScoring = scoringStandard.techScoring || scoringStandard.tech_scoring || {};
    const techItems = techScoring.scoringItems || techScoring.scoring_items || [];
    const businessScoring = scoringStandard.businessScoring || scoringStandard.business_scoring || {};
    const businessItems = businessScoring.scoringItems || businessScoring.scoring_items || [];
    
    scoringItems = [
      ...techItems.map((item: any) => ({ ...item, itemType: 'technical' })),
      ...businessItems.map((item: any) => ({ ...item, itemType: 'business' }))
    ];
    
    if (scoringItems.length === 0) {
      const directItems = scoringStandard.scoringItems || scoringStandard.scoring_items || [];
      scoringItems = directItems;
    }

    // 计算总分
    const totalScore = scoringItems.reduce((sum: number, item: any) => 
      sum + (item.maxScore || item.max_score || 0), 0);

    const extractionTimeMs = Date.now() - startTime;

    // 删除旧记录
    await client
      .from('tender_extraction_results')
      .delete()
      .eq('project_id', id);

    // 保存新记录 - 保存LLM返回的完整原始数据
    const { data: savedResult, error: saveError } = await client
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
        
        // JSON字段 - 保存原始数据
        core_tech_demand: coreTechDemand,
        business_requirements: businessRequirements,
        scoring_standard: scoringStandard,
        bidding_document_requirements: biddingDocumentRequirements,
        project_background: projectBackground,
        other_important_info: otherImportantInfo,
        
        // 完整的LLM返回结果
        full_extraction_result: extractedData,
        
        // 摘要
        total_score: totalScore,
        item_count: scoringItems.length,
        risk_count: disqualificationRisks.length,
        
        // 元数据
        extraction_model: 'qwen3.5-plus',
        confidence_score: 0.9,
        extraction_time_ms: extractionTimeMs,
        document_name: docName,
        status: 'completed',
      })
      .select()
      .single();

    if (saveError) {
      console.error('[extract-tender] 保存失败:', saveError);
      return NextResponse.json(
        { success: false, error: '保存提取结果失败: ' + saveError.message },
        { status: 500 }
      );
    }

    // 同时保存到旧表（兼容性）
    await client.from('scoring_items').delete().eq('project_id', id);
    await client.from('disqualification_risks').delete().eq('project_id', id);

    for (let i = 0; i < scoringItems.length; i++) {
      const item = scoringItems[i];
      await client.from('scoring_items').insert({
        project_id: id,
        item_name: item.itemName || item.item_name,
        item_type: item.itemType || item.item_type || 'technical',
        max_score: item.maxScore || item.max_score || 0,
        scoring_rules: item.scoreDetails || item.score_details || item.scoringRules || [],
        sort_order: i,
        response_status: 'pending',
      });
    }

    // 保存风险项 - 过滤掉无效数据
    const validRisks = (disqualificationRisks || []).filter((risk: any) => {
      const description = risk.description || risk.riskDescription || risk.risk_description;
      return description && description.trim().length > 0;
    });
    
    for (const risk of validRisks) {
      const description = risk.description || risk.riskDescription || risk.risk_description || '未提供描述';
      await client.from('disqualification_risks').insert({
        project_id: id,
        risk_type: risk.riskType || risk.risk_type || 'other',
        risk_description: description,
        severity: risk.severity || 'high',
        source_text: risk.sourceText || risk.source_text,
        response_status: 'unresponded',
      });
    }

    // 直接返回LLM的原始数据和数据库记录
    return NextResponse.json({
      success: true,
      data: {
        savedResult,
        llmRawData: extractedData,
      },
    });
  } catch (error) {
    console.error('[extract-tender] 提取失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '提取失败' },
      { status: 500 }
    );
  }
}
