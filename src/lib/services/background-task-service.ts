/**
 * 后台任务管理服务
 * 用于管理长时间运行的后台任务，支持进度追踪
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createSegmentedExtractionService } from './segmented-extraction';
import { createDocumentParser } from './document-parser';
import { createFileIdExtractionService, FileIdExtractionResult } from './file-id-extraction-service';
import { getLLMFileService } from './llm-file-service';

export type TaskType = 'extraction' | 'outline_generation' | 'content_generation';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BackgroundTask {
  id: string;
  projectId: string;
  taskType: TaskType;
  status: TaskStatus;
  progress: number;
  stage: string;
  stageDetail?: string;
  errorMessage?: string;
  result?: any;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 内存中的任务存储（用于快速访问）
const runningTasks = new Map<string, NodeJS.Timeout>();

/**
 * 保存评分标准到新表结构
 */
async function saveEvaluationCriteria(
  client: any,
  projectId: string,
  scoringStandard: any
): Promise<void> {
  console.log('[BackgroundTask] 开始保存评分标准, scoringStandard keys:', Object.keys(scoringStandard || {}));
  
  // 删除旧的评分标准
  const { error: deleteError } = await client.from('evaluation_criteria').delete().eq('project_id', projectId);
  if (deleteError) {
    console.error('[BackgroundTask] 删除旧评分标准失败:', deleteError);
  }

  // 解析评分标准数据
  // 支持两种格式：
  // 1. 新格式：evaluationCriteria 数组
  // 2. 旧格式：techScoring/businessScoring 对象
  
  let criteriaList: any[] = [];
  
  if (scoringStandard.evaluationCriteria && Array.isArray(scoringStandard.evaluationCriteria)) {
    // 新格式
    console.log('[BackgroundTask] 使用新格式 evaluationCriteria, 数量:', scoringStandard.evaluationCriteria.length);
    criteriaList = scoringStandard.evaluationCriteria;
  } else {
    // 旧格式转换
    console.log('[BackgroundTask] 使用旧格式转换');
    const techScoring = scoringStandard.techScoring || scoringStandard.tech_scoring || {};
    const businessScoring = scoringStandard.businessScoring || scoringStandard.business_scoring || {};
    const priceScoring = scoringStandard.priceScoring || scoringStandard.price_scoring || {};

    // 转换技术评分
    if (techScoring.scoringItems || techScoring.scoring_items) {
      const items = techScoring.scoringItems || techScoring.scoring_items || [];
      criteriaList.push({
        seq: 1,
        category: '技术评分',
        totalScore: techScoring.totalScore || techScoring.total_score || items.reduce((sum: number, item: any) => sum + (item.maxScore || item.max_score || 0), 0),
        categoryType: 'technical',
        items: items.map((item: any) => ({
          subItem: item.itemName || item.item_name || '',
          itemScore: item.maxScore || item.max_score || 0,
          rule: (item.scoreDetails || item.score_details || item.scoringRules || []).join('\n') || '',
          basis: '',
          techDocRef: null,
        })),
      });
    }

    // 转换商务评分
    if (businessScoring.scoringItems || businessScoring.scoring_items) {
      const items = businessScoring.scoringItems || businessScoring.scoring_items || [];
      criteriaList.push({
        seq: criteriaList.length + 1,
        category: '商务评分',
        totalScore: businessScoring.totalScore || businessScoring.total_score || items.reduce((sum: number, item: any) => sum + (item.maxScore || item.max_score || 0), 0),
        categoryType: 'business',
        items: items.map((item: any) => ({
          subItem: item.itemName || item.item_name || '',
          itemScore: item.maxScore || item.max_score || 0,
          rule: (item.scoreDetails || item.score_details || item.scoringRules || []).join('\n') || '',
          basis: '',
          techDocRef: null,
        })),
      });
    }

    // 转换价格评分
    if (priceScoring.totalScore || priceScoring.total_score || priceScoring.scoringMethod || priceScoring.scoring_method) {
      criteriaList.push({
        seq: criteriaList.length + 1,
        category: '价格评分',
        totalScore: priceScoring.totalScore || priceScoring.total_score || 0,
        categoryType: 'price',
        items: [{
          subItem: '价格得分',
          itemScore: priceScoring.totalScore || priceScoring.total_score || 0,
          rule: priceScoring.scoringMethod || priceScoring.scoring_method || '',
          basis: '',
          techDocRef: null,
        }],
      });
    }
  }

  // 保存到数据库
  let savedCount = 0;
  let savedItemCount = 0;
  
  for (const criteria of criteriaList) {
    const insertData = {
      project_id: projectId,
      seq: criteria.seq || 1,
      category: criteria.category || '未命名评分项',
      total_score: criteria.totalScore || criteria.total_score || 0,
      category_type: criteria.categoryType || criteria.category_type || 'technical',
    };
    
    console.log('[BackgroundTask] 插入评分大类:', insertData);
    
    const { data: savedCriteria, error: criteriaError } = await client
      .from('evaluation_criteria')
      .insert(insertData)
      .select('id')
      .single();

    if (criteriaError || !savedCriteria) {
      console.error('[BackgroundTask] 保存评分大类失败:', criteriaError);
      continue;
    }
    
    savedCount++;
    console.log('[BackgroundTask] 评分大类保存成功, id:', savedCriteria.id);

    // 保存评分细项
    const items = criteria.items || [];
    console.log('[BackgroundTask] 细项数量:', items.length);
    
    for (const item of items) {
      // 过滤掉无效的细项
      if (!item.subItem && !item.sub_item) continue;
      
      const itemInsertData = {
        criteria_id: savedCriteria.id,
        sub_item: item.subItem || item.sub_item || '',
        item_score: item.itemScore || item.item_score || 0,
        rule: item.rule || '',
        basis: item.basis || '',
        tech_doc_ref: item.techDocRef || item.tech_doc_ref || null,
      };
      
      const { error: itemError } = await client
        .from('evaluation_items')
        .insert(itemInsertData);

      if (itemError) {
        console.error('[BackgroundTask] 保存评分细项失败:', itemError, itemInsertData);
      } else {
        savedItemCount++;
      }
    }
  }

  console.log(`[BackgroundTask] 评分标准保存完成，共 ${criteriaList.length} 个评分大类，成功保存 ${savedCount} 个，${savedItemCount} 个细项`);
}

/**
 * 创建后台任务
 */
export async function createBackgroundTask(
  projectId: string,
  taskType: TaskType,
  initialStage: string = '初始化'
): Promise<string> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('background_tasks')
    .insert({
      project_id: projectId,
      task_type: taskType,
      status: 'pending',
      progress: 0,
      stage: initialStage,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[BackgroundTask] 创建任务失败:', error);
    throw new Error('创建后台任务失败');
  }

  console.log('[BackgroundTask] 创建任务成功:', data.id);
  return data.id;
}

/**
 * 更新任务状态
 */
export async function updateTaskProgress(
  taskId: string,
  progress: number,
  stage: string,
  stageDetail?: string
): Promise<void> {
  const client = getSupabaseClient();
  
  const updateData: any = {
    progress: Math.min(100, Math.max(0, progress)),
    stage,
    updated_at: new Date().toISOString(),
  };
  
  if (stageDetail) {
    updateData.stage_detail = stageDetail;
  }

  const { error } = await client
    .from('background_tasks')
    .update(updateData)
    .eq('id', taskId);

  if (error) {
    console.error('[BackgroundTask] 更新进度失败:', error);
  }
}

/**
 * 标记任务为运行中
 */
export async function markTaskRunning(taskId: string): Promise<void> {
  const client = getSupabaseClient();
  
  await client
    .from('background_tasks')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

/**
 * 标记任务完成
 */
export async function markTaskCompleted(taskId: string, result?: any): Promise<void> {
  const client = getSupabaseClient();
  
  await client
    .from('background_tasks')
    .update({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: result || null,
    })
    .eq('id', taskId);
}

/**
 * 标记任务失败
 */
export async function markTaskFailed(taskId: string, errorMessage: string): Promise<void> {
  const client = getSupabaseClient();
  
  await client
    .from('background_tasks')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

/**
 * 获取任务状态
 */
export async function getTaskStatus(taskId: string): Promise<BackgroundTask | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('background_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error) {
    console.error('[BackgroundTask] 获取任务状态失败:', error);
    return null;
  }

  return {
    id: data.id,
    projectId: data.project_id,
    taskType: data.task_type,
    status: data.status,
    progress: data.progress,
    stage: data.stage,
    stageDetail: data.stage_detail,
    errorMessage: data.error_message,
    result: data.result,
    startedAt: data.started_at ? new Date(data.started_at) : undefined,
    completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * 获取项目的最新任务
 */
export async function getLatestTaskForProject(
  projectId: string,
  taskType?: TaskType
): Promise<BackgroundTask | null> {
  const client = getSupabaseClient();
  
  let query = client
    .from('background_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (taskType) {
    query = query.eq('task_type', taskType);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // 没有找到任务
    }
    console.error('[BackgroundTask] 获取任务失败:', error);
    return null;
  }

  return {
    id: data.id,
    projectId: data.project_id,
    taskType: data.task_type,
    status: data.status,
    progress: data.progress,
    stage: data.stage,
    stageDetail: data.stage_detail,
    errorMessage: data.error_message,
    result: data.result,
    startedAt: data.started_at ? new Date(data.started_at) : undefined,
    completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * 启动文档提取后台任务
 * @param projectId 项目ID
 * @param documentUrl 文档URL
 * @param documentName 文档名
 * @param llmFileId 百炼文件ID（可选，如果已上传）
 * @returns 任务ID
 */
export async function startExtractionTask(
  projectId: string,
  documentUrl: string,
  documentName: string,
  llmFileId?: string
): Promise<string> {
  const client = getSupabaseClient();
  
  // 如果提供了 llmFileId，保存到项目元数据
  if (llmFileId) {
    const { data: project } = await client
      .from('projects')
      .select('metadata')
      .eq('id', projectId)
      .single();
    
    if (project) {
      await client
        .from('projects')
        .update({
          metadata: {
            ...project.metadata,
            uploadedDocument: {
              ...project.metadata?.uploadedDocument,
              llmFileId: llmFileId,
              llmFileUploadedAt: new Date().toISOString(),
            },
          },
        })
        .eq('id', projectId);
      
      console.log('[BackgroundTask] 已保存 llmFileId:', llmFileId);
    }
  }
  
  // 创建任务记录
  const taskId = await createBackgroundTask(projectId, 'extraction', '准备解析文档');
  
  // 异步执行提取任务
  executeExtractionTask(taskId, projectId, documentUrl, documentName).catch(error => {
    console.error('[BackgroundTask] 提取任务执行失败:', error);
  });

  return taskId;
}

/**
 * 上传文件到百炼平台并启动提取任务
 * 推荐使用此函数，可以节省大量token
 * @param projectId 项目ID
 * @param documentUrl 文档URL
 * @param documentName 文档名
 * @returns 任务ID和file_id
 */
export async function uploadToLLMAndStartExtraction(
  projectId: string,
  documentUrl: string,
  documentName: string
): Promise<{ taskId: string; fileId: string }> {
  const client = getSupabaseClient();
  
  try {
    // 1. 检查是否已有有效的 file_id
    const { data: project } = await client
      .from('projects')
      .select('metadata')
      .eq('id', projectId)
      .single();
    
    const existingFileId = project?.metadata?.uploadedDocument?.llmFileId;
    let fileId = existingFileId;
    
    if (existingFileId) {
      // 检查文件是否可用
      const llmFileService = getLLMFileService();
      const available = await llmFileService.checkFileAvailable(existingFileId);
      
      if (!available) {
        console.log('[BackgroundTask] 现有 file_id 不可用，重新上传...');
        fileId = null;
      }
    }
    
    // 2. 需要上传文件
    if (!fileId) {
      console.log('[BackgroundTask] 上传文件到百炼平台...');
      const llmFileService = getLLMFileService();
      const fileInfo = await llmFileService.uploadFile(documentUrl, documentName);
      fileId = fileInfo.id;
      
      console.log('[BackgroundTask] 文件上传成功，file_id:', fileId);
      
      // 保存 file_id 到项目元数据
      await client
        .from('projects')
        .update({
          metadata: {
            ...project?.metadata,
            uploadedDocument: {
              ...project?.metadata?.uploadedDocument,
              name: documentName,
              url: documentUrl,
              llmFileId: fileId,
              llmFileUploadedAt: new Date().toISOString(),
            },
          },
        })
        .eq('id', projectId);
    }
    
    // 3. 启动提取任务
    const taskId = await startExtractionTask(projectId, documentUrl, documentName, fileId);
    
    return { taskId, fileId };
  } catch (error) {
    console.error('[BackgroundTask] 上传文件失败，回退到文本模式:', error);
    // 回退：直接启动提取任务（使用文本模式）
    const taskId = await startExtractionTask(projectId, documentUrl, documentName);
    return { taskId, fileId: '' };
  }
}

/**
 * 执行文档提取任务（后台运行）
 * 支持两种模式：
 * 1. file_id模式（推荐）：使用百炼平台的file_id，节省token
 * 2. 文本模式（回退）：将文档内容作为文本传递给LLM
 */
async function executeExtractionTask(
  taskId: string,
  projectId: string,
  documentUrl: string,
  documentName: string
): Promise<void> {
  const client = getSupabaseClient();
  
  try {
    // 标记任务为运行中
    await markTaskRunning(taskId);
    
    // 进度回调函数
    const onProgress = async (stage: string, progress: number) => {
      await updateTaskProgress(taskId, progress, stage);
    };

    // 获取项目中存储的 file_id
    const { data: project } = await client
      .from('projects')
      .select('metadata')
      .eq('id', projectId)
      .single();
    
    const storedFileId = project?.metadata?.uploadedDocument?.llmFileId;
    let extractionResult: any;
    let useFileIdMode = !!storedFileId;
    
    console.log('[BackgroundTask] 存储的 file_id:', storedFileId || '无');
    console.log('[BackgroundTask] 使用模式:', useFileIdMode ? 'file_id模式' : '文本模式');

    if (useFileIdMode) {
      // ===== file_id 模式（推荐）=====
      // 检查文件是否可用
      const llmFileService = getLLMFileService();
      const fileAvailable = await llmFileService.checkFileAvailable(storedFileId);
      
      if (!fileAvailable) {
        console.log('[BackgroundTask] file_id 不可用，切换到文本模式');
        useFileIdMode = false;
      } else {
        // 使用 file_id 模式提取
        const fileIdExtractionService = createFileIdExtractionService();
        extractionResult = await fileIdExtractionService.extract(
          projectId,
          storedFileId,
          documentUrl,
          documentName,
          onProgress
        );
        
        console.log('[BackgroundTask] file_id 模式提取完成');
      }
    }
    
    if (!useFileIdMode) {
      // ===== 文本模式（回退）=====
      // 阶段1: 解析文档 (0-10%)
      await updateTaskProgress(taskId, 5, '解析文档', '正在下载和解析文档...');
      const parser = createDocumentParser();
      const parseResult = await parser.parseFromUrl(documentUrl);
      
      if (!parseResult.success || !parseResult.document) {
        throw new Error(`文档解析失败: ${parseResult.error}`);
      }
      
      const textContent = parseResult.document.content;
      
      console.log('[BackgroundTask] 文档解析成功');
      console.log('[BackgroundTask] textContent长度:', textContent?.length || 0);
      
      if (!textContent || textContent.trim().length === 0) {
        throw new Error('文档解析结果为空，请检查文档内容');
      }
      
      await updateTaskProgress(taskId, 10, '文档解析完成', `文档长度: ${textContent.length} 字符`);

      // 阶段2-90: LLM提取（文本模式）
      const segmentedExtractionService = createSegmentedExtractionService();
      extractionResult = await segmentedExtractionService.extract(textContent, async (stage, progress) => {
        const mappedProgress = 10 + Math.round(progress * 0.8);
        await updateTaskProgress(taskId, mappedProgress, stage, `正在提取: ${stage}`);
      });
      
      console.log('[BackgroundTask] 文本模式提取完成');
    }

    // 阶段90-100: 保存结果
    await updateTaskProgress(taskId, 90, '保存提取结果', '正在保存到数据库...');

    // 保存提取结果到数据库
    const projectInfo = extractionResult.projectBasicInfo || {};
    const timeline = extractionResult.timeSchedule || {};
    const coreTechDemand = extractionResult.coreTechDemand || {};
    const businessRequirements = extractionResult.businessRequirements || {};
    const scoringStandard = extractionResult.scoringStandard || {};
    const biddingDocumentRequirements = extractionResult.biddingDocumentRequirements || {};
    const projectBackground = extractionResult.projectBackground || {};
    const otherImportantInfo = extractionResult.otherImportantInfo || {};
    const disqualificationRisks = extractionResult.disqualificationRisks || [];

    // 提取评分项 - 优先使用新格式 evaluationCriteria
    let scoringItems: any[] = [];
    
    // 新格式：evaluationCriteria 数组
    if (scoringStandard.evaluationCriteria && Array.isArray(scoringStandard.evaluationCriteria)) {
      for (const criteria of scoringStandard.evaluationCriteria) {
        const items = criteria.items || [];
        for (const item of items) {
          scoringItems.push({
            itemName: item.subItem || item.sub_item || '',
            itemType: criteria.categoryType || criteria.category_type || 'technical',
            maxScore: item.itemScore || item.item_score || 0,
            scoreDetails: item.rule ? [item.rule] : [],
          });
        }
      }
    } else {
      // 旧格式：techScoring/businessScoring
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
    }

    const totalScore = scoringItems.reduce((sum: number, item: any) => 
      sum + (item.maxScore || item.max_score || 0), 0);

    // 删除旧的提取结果
    await client.from('tender_extraction_results').delete().eq('project_id', projectId);
    await client.from('scoring_items').delete().eq('project_id', projectId);
    await client.from('disqualification_risks').delete().eq('project_id', projectId);

    // 保存新结果
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

    await client.from('tender_extraction_results').insert({
      project_id: projectId,
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
      
      bid_publish_date: timeline.bidPublishDate || timeline.bid_publish_date,
      bid_document_sale_start: timeline.bidDocumentSaleStart || timeline.bid_document_sale_start,
      bid_document_sale_end: timeline.bidDocumentSaleEnd || timeline.bid_document_sale_end,
      question_deadline: timeline.questionDeadline || timeline.question_deadline,
      answer_publish_date: timeline.answerPublishDate || timeline.answer_publish_date,
      site_visit_date: timeline.siteVisitDate || timeline.site_visit_date,
      bid_submission_deadline: timeline.bidSubmissionDeadline || timeline.bid_submission_deadline,
      bid_opening_date: timeline.bidOpeningDate || timeline.bid_opening_date,
      bid_opening_location: timeline.bidOpeningLocation || timeline.bid_opening_location,
      
      core_tech_demand: coreTechDemand,
      business_requirements: businessRequirements,
      scoring_standard: scoringStandard,
      bidding_document_requirements: biddingDocumentRequirements,
      project_background: projectBackground,
      other_important_info: otherImportantInfo,
      full_extraction_result: extractedData,
      
      total_score: totalScore,
      item_count: scoringItems.length,
      risk_count: disqualificationRisks.length,
      
      extraction_model: 'qwen3.5-plus',
      confidence_score: 0.9,
      document_name: documentName,
      status: 'completed',
    });

    // 保存评分项到旧表（兼容性）
    for (let i = 0; i < scoringItems.length; i++) {
      const item = scoringItems[i];
      await client.from('scoring_items').insert({
        project_id: projectId,
        item_name: item.itemName || item.item_name,
        item_type: item.itemType || item.item_type || 'technical',
        max_score: item.maxScore || item.max_score || 0,
        scoring_rules: item.scoreDetails || item.score_details || item.scoringRules || [],
        sort_order: i,
        response_status: 'pending',
      });
    }

    // 保存评分标准到新表结构（evaluation_criteria + evaluation_items）
    await saveEvaluationCriteria(client, projectId, scoringStandard);

    // 保存风险项 - 过滤掉无效数据
    const validRisks = (disqualificationRisks || []).filter((risk: any) => {
      const description = risk.description || risk.riskDescription || risk.risk_description;
      return description && description.trim().length > 0;
    });
    
    for (const risk of validRisks) {
      const description = risk.description || risk.riskDescription || risk.risk_description || '未提供描述';
      await client.from('disqualification_risks').insert({
        project_id: projectId,
        risk_type: risk.riskType || risk.risk_type || 'other',
        risk_description: description,
        severity: risk.severity || 'high',
        source_text: risk.sourceText || risk.source_text,
        response_status: 'unresponded',
      });
    }

    // 更新项目状态
    const { data: projectData } = await client.from('projects').select('metadata').eq('id', projectId).single();
    await client.from('projects').update({
      status: 'processing',
      metadata: {
        ...(projectData?.metadata || {}),
        uploadedDocument: {
          name: documentName,
          url: documentUrl,
          extracted: true,
          extractedAt: new Date().toISOString(),
        },
      },
    }).eq('id', projectId);

    // 标记任务完成
    await markTaskCompleted(taskId, {
      totalScore,
      itemCount: scoringItems.length,
      riskCount: disqualificationRisks.length,
    });

    console.log('[BackgroundTask] 提取任务完成:', taskId);
  } catch (error) {
    console.error('[BackgroundTask] 提取任务失败:', error);
    await markTaskFailed(taskId, error instanceof Error ? error.message : '未知错误');
  }
}

/**
 * 清理过期任务（超过24小时的任务）
 */
export async function cleanupOldTasks(): Promise<void> {
  const client = getSupabaseClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  await client
    .from('background_tasks')
    .delete()
    .lt('created_at', oneDayAgo)
    .in('status', ['completed', 'failed']);
}
