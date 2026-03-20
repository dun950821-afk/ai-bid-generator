/**
 * 单项/多项分段提取后台任务API
 * 支持后台运行单项或多项分段提取，并返回进度
 * 
 * 完全参考 background-task-service.ts 中 executeExtractionTask 的成功模式
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  createBackgroundTask,
  updateTaskProgress,
  markTaskRunning,
  markTaskCompleted,
  markTaskFailed,
  getTaskStatus,
} from '@/lib/services/background-task-service';
import {
  createSegmentedExtractionService,
  EXTRACTION_SEGMENTS,
  ExtractionSegmentKey,
} from '@/lib/services/segmented-extraction';
import { getLLMFileService } from '@/lib/services/llm-file-service';
import { getLLMFileCacheService } from '@/lib/services/llm-file-cache-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/segment-task
 * 获取分段提取任务状态
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params;
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json(
      { success: false, error: '缺少taskId参数' },
      { status: 400 }
    );
  }

  try {
    const task = await getTaskStatus(taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: '任务不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        task: {
          id: task.id,
          status: task.status,
          progress: task.progress,
          stage: task.stage,
          stageDetail: task.stageDetail,
          errorMessage: task.errorMessage,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        },
      },
    });
  } catch (error) {
    console.error('[segment-task] 获取任务状态失败:', error);
    return NextResponse.json(
      { success: false, error: '获取任务状态失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/segment-task
 * 启动单项或多项分段提取任务
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { segment, segments } = body as {
    segment?: ExtractionSegmentKey;
    segments?: ExtractionSegmentKey[];
  };

  console.log(`[segment-task] 开始处理，项目ID: ${id}, segment: ${segment}, segments: ${segments?.join(',')}`);

  // 确定要提取的分段列表
  let targetSegments: ExtractionSegmentKey[] = [];
  
  if (segment) {
    targetSegments = [segment];
  } else if (segments && segments.length > 0) {
    targetSegments = segments;
  } else {
    return NextResponse.json(
      { success: false, error: '请指定要提取的分段（segment 或 segments）' },
      { status: 400 }
    );
  }

  // 验证分段是否有效
  const invalidSegments = targetSegments.filter(
    s => !EXTRACTION_SEGMENTS.find(seg => seg.key === s)
  );
  
  if (invalidSegments.length > 0) {
    return NextResponse.json(
      { 
        success: false, 
        error: `无效的分段: ${invalidSegments.join(', ')}` 
      },
      { status: 400 }
    );
  }

  try {
    const client = getSupabaseClient();

    // 获取项目信息（完整获取，包含所有 metadata）
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

    // 创建后台任务
    const segmentNames = targetSegments
      .map(s => EXTRACTION_SEGMENTS.find(seg => seg.key === s)?.name)
      .filter(Boolean)
      .join('、');
    
    const taskId = await createBackgroundTask(
      id,
      'extraction',
      `准备提取: ${segmentNames}`
    );

    // 异步执行提取任务
    executeSegmentExtractionTask(
      taskId,
      id,
      targetSegments,
      project.metadata
    ).catch(error => {
      console.error('[segment-task] 提取任务执行失败:', error);
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId,
        segments: targetSegments,
        message: '提取任务已启动',
      },
    });
  } catch (error) {
    console.error('[segment-task] 启动任务失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '启动任务失败' },
      { status: 500 }
    );
  }
}

/**
 * 执行分段提取任务（后台运行）
 * 
 * 完全参考 background-task-service.ts 中 executeExtractionTask 的成功模式
 */
async function executeSegmentExtractionTask(
  taskId: string,
  projectId: string,
  segments: ExtractionSegmentKey[],
  projectMetadata: any
): Promise<void> {
  const client = getSupabaseClient();
  
  try {
    // 标记任务为运行中
    await markTaskRunning(taskId);
    
    // ===== 参考 background-task-service.ts 的成功模式 =====
    
    // 从 metadata 获取文档信息和缓存信息
    const uploadedDocument = projectMetadata?.uploadedDocument || {};
    const documentUrl = uploadedDocument.url;
    const documentName = uploadedDocument.name || '招标文档';
    const storedFileId = uploadedDocument.llmFileId;
    const uploadId = uploadedDocument.uploadId;
    
    console.log('[segment-task] ========== 开始获取文档内容 ==========');
    console.log('[segment-task] documentUrl:', documentUrl?.substring(0, 60));
    console.log('[segment-task] storedFileId:', storedFileId || '无');
    console.log('[segment-task] uploadId:', uploadId || '无');

    if (!documentUrl) {
      throw new Error('项目没有上传文档，请先上传招标文档');
    }

    // ===== 使用统一的 ensureValidFileId 方法获取有效的 file_id =====
    let docContent = '';
    let extractionMode = 'unknown';
    
    try {
      const cacheService = getLLMFileCacheService();
      const fileResult = await cacheService.ensureValidFileId(
        projectId,
        documentUrl,
        documentName,
        uploadId,
        storedFileId
      );
      
      console.log('[segment-task] file_id获取结果:', {
        llmFileId: fileResult.llmFileId,
        source: fileResult.source,
        fromCache: fileResult.fromCache,
        reuploaded: fileResult.reuploaded,
      });
      
      // 根据来源确定模式
      extractionMode = fileResult.source === 'cache' ? 'cache' : 
                       fileResult.source === 'stored' ? 'file_id' : 
                       fileResult.source === 'reupload' ? 'reupload' : 'new_upload';
      
      // 使用 LLM 文件服务提取文档文本
      const llmFileService = getLLMFileService();
      docContent = await llmFileService.extractDocumentText(fileResult.llmFileId);
      
      console.log(`[segment-task] ${extractionMode}模式提取文档文本成功，长度: ${docContent.length}`);
      
      // 更新项目 metadata 中的 llmFileId（如果是重新上传的）
      if (fileResult.reuploaded || fileResult.source === 'new_upload') {
        const { data: projectData } = await client
          .from('projects')
          .select('metadata')
          .eq('id', projectId)
          .single();
        
        const existingMetadata = projectData?.metadata || {};
        
        await client
          .from('projects')
          .update({
            metadata: {
              ...existingMetadata,
              uploadedDocument: {
                ...(existingMetadata.uploadedDocument || {}),
                llmFileId: fileResult.llmFileId,
                url: documentUrl,
                name: documentName,
              },
            },
          })
          .eq('id', projectId);
        
        console.log('[segment-task] 已更新项目 metadata 中的 llmFileId');
      }
    } catch (error) {
      console.error('[segment-task] file_id模式失败:', error);
      throw error;
    }

    if (!docContent || docContent.trim().length === 0) {
      throw new Error('文档内容为空，请检查文档是否有效');
    }

    console.log(`[segment-task] 文档内容长度: ${docContent.length}`);

    // ===== 执行分段提取 =====
    const extractionService = createSegmentedExtractionService();
    const results: Record<string, any> = {};
    const totalSegments = segments.length;
    
    for (let i = 0; i < segments.length; i++) {
      const segmentKey = segments[i];
      const segment = EXTRACTION_SEGMENTS.find(s => s.key === segmentKey);
      
      if (!segment) continue;
      
      const progress = Math.round(((i + 0.5) / totalSegments) * 100);
      await updateTaskProgress(taskId, progress, `提取${segment.name}`, `正在提取: ${segment.name}`);
      
      console.log(`[segment-task] 提取 ${segment.name}...`);
      
      try {
        const result = await extractionService.extractSegmentByKey(segmentKey, docContent);
        
        if (result.success) {
          results[segmentKey] = result.data;
          console.log(`[segment-task] ${segment.name} 提取成功`);
          
          // 更新数据库
          await updateSegmentData(client, projectId, segmentKey, result.data);
        } else {
          console.error(`[segment-task] ${segment.name} 提取失败:`, result.error);
          results[segmentKey] = { error: result.error };
        }
      } catch (segmentError: any) {
        console.error(`[segment-task] ${segment.name} 提取异常:`, segmentError);
        results[segmentKey] = { error: segmentError.message };
      }
      
      const completeProgress = Math.round(((i + 1) / totalSegments) * 100);
      await updateTaskProgress(taskId, completeProgress, `完成${segment.name}`, `已完成: ${segment.name}`);
    }

    // 更新项目的提取结果
    const { data: existingResult } = await client
      .from('tender_extraction_results')
      .select('*')
      .eq('project_id', projectId)
      .single();
    
    if (existingResult) {
      // 合并结果
      const fullResult = existingResult.full_extraction_result || {};
      for (const [key, value] of Object.entries(results)) {
        if (!('error' in (value as any))) {
          fullResult[key] = value;
        }
      }
      
      await client
        .from('tender_extraction_results')
        .update({
          full_extraction_result: fullResult,
          updated_at: new Date().toISOString(),
        })
        .eq('project_id', projectId);
    }

    // 标记任务完成
    const successCount = Object.values(results).filter(r => !('error' in (r as any))).length;
    await markTaskCompleted(taskId, {
      totalSegments: segments.length,
      successCount,
      results,
    });

    console.log(`[segment-task] 提取任务完成，成功 ${successCount}/${segments.length}`);
  } catch (error) {
    console.error('[segment-task] 提取任务失败:', error);
    await markTaskFailed(taskId, error instanceof Error ? error.message : '未知错误');
  }
}

/**
 * 根据分段类型更新数据库
 */
async function updateSegmentData(
  client: ReturnType<typeof getSupabaseClient>,
  projectId: string,
  segment: string,
  data: any
): Promise<void> {
  switch (segment) {
    case 'scoringStandard':
      // 更新评分标准
      const evaluationCriteria = data?.evaluationCriteria || [];
      
      // 删除旧的评分标准
      await client
        .from('evaluation_criteria')
        .delete()
        .eq('project_id', projectId);
      
      // 插入新的评分标准
      if (evaluationCriteria.length > 0) {
        for (let i = 0; i < evaluationCriteria.length; i++) {
          const category = evaluationCriteria[i];
          
          const { data: savedCategory, error: categoryError } = await client
            .from('evaluation_criteria')
            .insert({
              project_id: projectId,
              seq: category.seq || i + 1,
              category: category.category || '未命名',
              total_score: category.totalScore || 0,
              category_type: category.categoryType || 'technical',
            })
            .select('id')
            .single();
          
          if (categoryError || !savedCategory) {
            console.error('[segment-task] 保存评分大类失败:', categoryError);
            continue;
          }
          
          // 保存评分细项
          const items = category.items || [];
          for (const item of items) {
            if (!item.subItem && !item.sub_item) continue;
            
            await client
              .from('evaluation_items')
              .insert({
                criteria_id: savedCategory.id,
                sub_item: item.subItem || item.sub_item || '',
                item_score: item.itemScore || item.item_score || 0,
                rule: item.rule || '',
                basis: item.basis || '',
                tech_doc_ref: item.techDocRef || item.tech_doc_ref || null,
              });
          }
        }
      }
      break;

    case 'disqualificationRisks':
      // 更新废标风险
      const risks = Array.isArray(data) ? data : [];
      
      // 删除旧的风险
      await client
        .from('disqualification_risks')
        .delete()
        .eq('project_id', projectId);
      
      // 插入新的风险
      const validRisks = risks.filter((risk: any) => {
        const description = risk.description || risk.riskDescription || risk.risk_description;
        return description && description.trim().length > 0;
      });
      
      for (const risk of validRisks) {
        await client
          .from('disqualification_risks')
          .insert({
            project_id: projectId,
            risk_type: risk.riskType || risk.risk_type || 'other',
            risk_description: risk.description || risk.riskDescription || risk.risk_description || '',
            severity: risk.severity || 'high',
            source_text: risk.sourceText || risk.source_text,
            response_status: 'unresponded',
          });
      }
      break;

    default:
      // 其他分段：更新到 tender_extraction_results 表
      console.log(`[segment-task] 更新分段 ${segment} 到 tender_extraction_results`);
      break;
  }
}
