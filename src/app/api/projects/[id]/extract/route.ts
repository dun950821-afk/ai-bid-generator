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
    console.log('[extract] 错误:', e instanceof Error ? e.message : '未知错误');
    
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
      // 匹配 "fieldName": { 或 "fieldName": [
      const pattern = new RegExp(`"${field}"\\s*:\\s*(\\{|\\[)`, 'g');
      const match = pattern.exec(fixed);
      
      if (match) {
        const startIdx = match.index + match[0].length - 1; // 指向 { 或 [
        const isOpenBrace = match[1] === '{';
        
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
          console.log(`[extract] 成功提取 ${field}`);
        } catch (e2) {
          // 如果完整提取失败，尝试修复后提取
          try {
            const startIdx = match.index + match[0].length - 1;
            let content = fixed.substring(startIdx);
            
            // 统计括号并闭合
            let braceCount = 0;
            let bracketCount = 0;
            let inString = false;
            let escape = false;
            
            for (let i = 0; i < content.length; i++) {
              const char = content[i];
              if (escape) { escape = false; continue; }
              if (char === '\\') { escape = true; continue; }
              if (char === '"') { inString = !inString; continue; }
              if (inString) continue;
              if (char === '{') braceCount++;
              if (char === '}') braceCount--;
              if (char === '[') bracketCount++;
              if (char === ']') bracketCount--;
              
              // 当括号平衡时，可能是完整对象
              if (braceCount === 0 && bracketCount === 0 && i > 0) {
                content = content.substring(0, i + 1);
                break;
              }
            }
            
            // 如果还不平衡，强制闭合
            if (inString) content += '"';
            while (bracketCount > 0) { content += ']'; bracketCount--; }
            while (braceCount > 0) { content += '}'; braceCount--; }
            
            result[field] = JSON.parse(content);
            console.log(`[extract] 通过修复成功提取 ${field}`);
          } catch (e3) {
            console.log(`[extract] 提取 ${field} 失败:`, e3 instanceof Error ? e3.message : '未知错误');
            // 设置默认值
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

    // 提取各部分数据 - 支持多种字段名格式
    // projectBasicInfo 或 projectInfo 或 project_info
    const projectInfo = extractedData.projectBasicInfo || extractedData.projectInfo || extractedData.project_info || extractedData.project_basic_info || {};
    
    // timeSchedule 或 timeline 或 time_schedule
    const timeline = extractedData.timeSchedule || extractedData.timeline || extractedData.time_schedule || {};
    
    // coreTechDemand 或 core_tech_demand
    const coreTechDemand = extractedData.coreTechDemand || extractedData.core_tech_demand || {};
    
    // businessRequirements 或 business_requirements
    const businessRequirements = extractedData.businessRequirements || extractedData.business_requirements || {};
    
    // scoringStandard 或 scoring_standard
    const scoringStandard = extractedData.scoringStandard || extractedData.scoring_standard || {};
    
    // biddingDocumentRequirements 或 bidding_document_requirements
    const biddingDocumentRequirements = extractedData.biddingDocumentRequirements || extractedData.bidding_document_requirements || {};
    
    // projectBackground 或 project_background
    const projectBackground = extractedData.projectBackground || extractedData.project_background || {};
    
    // otherImportantInfo 或 other_important_info
    const otherImportantInfo = extractedData.otherImportantInfo || extractedData.other_important_info || {};

    // 从评分标准中提取评分项 - 支持嵌套结构
    // 新格式：scoringStandard.techScoring.scoringItems + scoringStandard.businessScoring.scoringItems
    // 旧格式：scoringStandard.scoringItems
    let scoringItems: any[] = [];
    
    // 技术评分项
    const techScoring = scoringStandard.techScoring || scoringStandard.tech_scoring || {};
    const techItems = techScoring.scoringItems || techScoring.scoring_items || [];
    
    // 商务评分项
    const businessScoring = scoringStandard.businessScoring || scoringStandard.business_scoring || {};
    const businessItems = businessScoring.scoringItems || businessScoring.scoring_items || [];
    
    // 价格评分
    const priceScoring = scoringStandard.priceScoring || scoringStandard.price_scoring || {};
    
    // 合并技术评分项和商务评分项
    scoringItems = [
      ...techItems.map((item: any) => ({ ...item, itemType: 'technical' })),
      ...businessItems.map((item: any) => ({ ...item, itemType: 'business' }))
    ];
    
    // 如果没有嵌套结构，尝试直接获取
    if (scoringItems.length === 0) {
      const directItems = scoringStandard.scoringItems || scoringStandard.scoring_items || [];
      scoringItems = directItems;
    }

    // 废标风险 - 直接在根级别或 scoringStandard 中
    const disqualificationRisks = extractedData.disqualificationRisks || 
                                   extractedData.disqualification_risks || 
                                   extractedData.risks ||
                                   scoringStandard.disqualificationRisks ||
                                   scoringStandard.disqualification_risks || [];

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
