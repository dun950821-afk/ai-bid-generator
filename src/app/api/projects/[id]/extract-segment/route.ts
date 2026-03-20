/**
 * 单项提取API
 * 支持单独重新提取某一个分段的数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { 
  createSegmentedExtractionService, 
  EXTRACTION_SEGMENTS,
  ExtractionSegmentKey 
} from '@/lib/services/segmented-extraction';
import { getLLMFileService } from '@/lib/services/llm-file-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/extract-segment
 * 单独提取某一个分段
 * 
 * Request Body:
 * {
 *   segment: 'scoringStandard' | 'projectBasicInfo' | ... ,
 *   documentId?: string  // 可选，指定文档ID
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { segment, documentId } = body as { 
    segment?: ExtractionSegmentKey; 
    documentId?: string;
  };

  console.log(`[extract-segment] 开始处理，项目ID: ${id}, 分段: ${segment}`);

  // 验证参数
  if (!segment) {
    return NextResponse.json(
      { success: false, error: '缺少segment参数' },
      { status: 400 }
    );
  }

  // 验证segment是否有效
  const validSegment = EXTRACTION_SEGMENTS.find(s => s.key === segment);
  if (!validSegment) {
    return NextResponse.json(
      { 
        success: false, 
        error: `无效的分段: ${segment}，有效值为: ${EXTRACTION_SEGMENTS.map(s => s.key).join(', ')}` 
      },
      { status: 400 }
    );
  }

  try {
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
    let documentContent = '';
    
    // 优先使用指定的文档ID
    if (documentId) {
      console.log(`[extract-segment] 使用指定文档ID: ${documentId}`);
      const { data: doc, error: docError } = await client
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .eq('project_id', id)
        .single();
      
      if (docError || !doc) {
        return NextResponse.json(
          { success: false, error: '指定的文档不存在' },
          { status: 404 }
        );
      }
      
      documentContent = doc.content || doc.parsed_content || '';
    } else {
      // 从项目metadata中获取文档信息
      const uploadedDoc = project.metadata?.uploadedDocument;
      
      if (uploadedDoc?.llmFileId) {
        // 使用LLM文件服务提取内容
        console.log(`[extract-segment] 从LLM文件提取内容, fileId: ${uploadedDoc.llmFileId}`);
        try {
          const llmFileService = getLLMFileService();
          documentContent = await llmFileService.extractDocumentText(uploadedDoc.llmFileId);
          console.log(`[extract-segment] 文档文本提取成功，长度: ${documentContent.length}`);
        } catch (extractError) {
          console.error('[extract-segment] LLM文件提取失败:', extractError);
        }
      }
      
      // 如果仍然没有，尝试从documents表获取
      if (!documentContent) {
        const { data: documents } = await client
          .from('documents')
          .select('*')
          .eq('project_id', id)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (documents && documents.length > 0) {
          documentContent = documents[0].content || documents[0].parsed_content || '';
        }
      }
    }

    if (!documentContent || documentContent.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '文档内容为空，请先上传招标文档' },
        { status: 400 }
      );
    }

    console.log(`[extract-segment] 文档内容长度: ${documentContent.length}`);

    // 执行单项提取
    const extractionService = createSegmentedExtractionService();
    const result = await extractionService.extractSegmentByKey(segment, documentContent);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || '提取失败',
        segment: result.key,
        name: result.name
      });
    }

    // 更新数据库
    // 根据分段类型更新对应的表
    await updateSegmentData(client, id, segment, result.data);

    console.log(`[extract-segment] ${result.name} 提取成功`);

    return NextResponse.json({
      success: true,
      segment: result.key,
      name: result.name,
      data: result.data
    });

  } catch (error: any) {
    console.error('[extract-segment] 处理失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || '处理失败' },
      { status: 500 }
    );
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
  const now = new Date().toISOString();

  switch (segment) {
    case 'scoringStandard':
      // 更新评分项
      const evaluationCriteria = data?.evaluationCriteria || [];
      
      // 先删除旧的评分项
      await client
        .from('scoring_items')
        .delete()
        .eq('project_id', projectId);
      
      // 插入新的评分项
      if (evaluationCriteria.length > 0) {
        const scoringItems = [];
        let sortOrder = 0;
        
        for (const category of evaluationCriteria) {
          const items = category.items || [];
          for (const item of items) {
            scoringItems.push({
              project_id: projectId,
              category: category.category,
              category_type: category.categoryType || 'technical',
              sub_item: item.subItem || item.sub_item || '',
              item_score: item.itemScore || item.item_score || 0,
              rule: item.rule || '',
              basis: item.basis || '',
              tech_doc_ref: item.techDocRef || item.tech_doc_ref || null,
              sort_order: sortOrder++,
              created_at: now,
              updated_at: now,
            });
          }
        }
        
        if (scoringItems.length > 0) {
          const { error } = await client
            .from('scoring_items')
            .insert(scoringItems);
          
          if (error) {
            console.error('[extract-segment] 插入评分项失败:', error);
            throw error;
          }
          console.log(`[extract-segment] 插入 ${scoringItems.length} 个评分项`);
        }
      }
      break;

    case 'disqualificationRisks':
      // 更新风险因素
      const risks = Array.isArray(data) ? data : [];
      
      // 先删除旧的风险因素
      await client
        .from('risk_factors')
        .delete()
        .eq('project_id', projectId);
      
      // 插入新的风险因素
      if (risks.length > 0) {
        const riskItems = risks.map((risk: any, index: number) => ({
          project_id: projectId,
          risk_type: risk.riskType || risk.risk_type || '',
          severity: risk.severity || 'medium',
          description: risk.description || '',
          suggestion: risk.suggestion || '',
          sort_order: index,
          created_at: now,
          updated_at: now,
        }));
        
        const { error } = await client
          .from('risk_factors')
          .insert(riskItems);
        
        if (error) {
          console.error('[extract-segment] 插入风险因素失败:', error);
          throw error;
        }
        console.log(`[extract-segment] 插入 ${riskItems.length} 个风险因素`);
      }
      break;

    case 'projectBasicInfo':
    case 'projectBackground':
    case 'timeSchedule':
    case 'coreTechDemand':
    case 'businessRequirements':
    case 'biddingDocumentRequirements':
    case 'otherImportantInfo':
      // 更新项目的extraction_result字段
      const { data: project, error: fetchError } = await client
        .from('projects')
        .select('extraction_result')
        .eq('id', projectId)
        .single();
      
      if (fetchError) {
        console.error('[extract-segment] 获取项目提取结果失败:', fetchError);
        throw fetchError;
      }
      
      const existingResult = project?.extraction_result || {};
      existingResult[segment] = data;
      
      const { error: updateError } = await client
        .from('projects')
        .update({ 
          extraction_result: existingResult,
          updated_at: now 
        })
        .eq('id', projectId);
      
      if (updateError) {
        console.error('[extract-segment] 更新项目提取结果失败:', updateError);
        throw updateError;
      }
      break;

    default:
      console.warn(`[extract-segment] 未知的分段类型: ${segment}`);
  }
}

/**
 * GET /api/projects/[id]/extract-segment
 * 获取可提取的分段列表
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  return NextResponse.json({
    success: true,
    segments: EXTRACTION_SEGMENTS.map(s => ({
      key: s.key,
      name: s.name,
      isScoring: s.isScoring || false,
      isArray: s.isArray || false
    }))
  });
}
