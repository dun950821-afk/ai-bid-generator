import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createDocumentParser } from '@/lib/services/document-parser';
import { createSegmentedExtractionService } from '@/lib/services/segmented-extraction';

/**
 * POST /api/projects/[id]/extract-streaming
 * 流式提取招标文档信息，支持进度回调
 */
export async function POST(
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

    const body = await req.json();
    const { documentUrl, documentName } = body;

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

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送进度更新
          const sendProgress = (stage: string, progress: number) => {
            const data = JSON.stringify({ type: 'progress', stage, progress });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          };

          // 发送日志
          const sendLog = (message: string) => {
            const data = JSON.stringify({ type: 'log', message });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          };

          sendProgress('准备中', 5);
          sendLog('开始解析文档...');

          // 解析文档
          const parser = createDocumentParser();
          const parseResult = await parser.parseFromUrl(docUrl);
          
          if (!parseResult.success || !parseResult.document) {
            throw new Error(`文档解析失败: ${parseResult.error}`);
          }

          const textContent = parseResult.document.content;
          sendProgress('文档解析完成', 10);
          sendLog(`文档内容长度: ${textContent.length} 字符`);

          // 执行分段提取
          sendLog('开始智能提取...');
          const extractionService = createSegmentedExtractionService();
          
          const result = await extractionService.extract(
            textContent,
            (stage, progress) => {
              sendProgress(stage, progress);
              sendLog(`正在${stage}...`);
            }
          );

          sendProgress('保存结果', 90);
          sendLog(`提取策略: ${result.extractionMetadata.strategy}`);
          sendLog(`提取耗时: ${result.extractionMetadata.extractionTimeMs}ms`);

          // 提取评分项
          const scoringStandard = result.scoringStandard || {};
          const techScoring = scoringStandard.techScoring || {};
          const techItems = techScoring.scoringItems || [];
          const businessScoring = scoringStandard.businessScoring || {};
          const businessItems = businessScoring.scoringItems || [];
          
          const scoringItems = [
            ...techItems.map((item: any) => ({ ...item, itemType: 'technical' })),
            ...businessItems.map((item: any) => ({ ...item, itemType: 'business' }))
          ];

          // 计算总分
          const totalScore = scoringItems.reduce((sum: number, item: any) => 
            sum + (item.maxScore || item.max_score || 0), 0);

          // 保存到数据库
          await client
            .from('tender_extraction_results')
            .delete()
            .eq('project_id', id);

          const { data: savedResult, error: saveError } = await client
            .from('tender_extraction_results')
            .insert({
              project_id: id,
              
              // 项目基本信息
              project_name: result.projectBasicInfo?.projectName || result.projectBasicInfo?.project_name,
              project_number: result.projectBasicInfo?.projectNumber || result.projectBasicInfo?.project_number,
              purchase_unit: result.projectBasicInfo?.purchaseUnit || result.projectBasicInfo?.purchase_unit,
              purchase_unit_contact: result.projectBasicInfo?.purchaseUnitContact || result.projectBasicInfo?.purchase_unit_contact,
              purchase_unit_phone: result.projectBasicInfo?.purchaseUnitPhone || result.projectBasicInfo?.purchase_unit_phone,
              purchase_unit_email: result.projectBasicInfo?.purchaseUnitEmail || result.projectBasicInfo?.purchase_unit_email,
              purchase_unit_address: result.projectBasicInfo?.purchaseUnitAddress || result.projectBasicInfo?.purchase_unit_address,
              project_type: result.projectBasicInfo?.projectType || result.projectBasicInfo?.project_type,
              procurement_method: result.projectBasicInfo?.procurementMethod || result.projectBasicInfo?.procurement_method,
              project_budget: result.projectBasicInfo?.projectBudget || result.projectBasicInfo?.project_budget,
              budget_source: result.projectBasicInfo?.budgetSource || result.projectBasicInfo?.budget_source,
              project_cycle: result.projectBasicInfo?.projectCycle || result.projectBasicInfo?.project_cycle,
              delivery_period: result.projectBasicInfo?.deliveryPeriod || result.projectBasicInfo?.delivery_period,
              warranty_period: result.projectBasicInfo?.warrantyPeriod || result.projectBasicInfo?.warranty_period,
              
              // 时间节点
              bid_publish_date: result.timeSchedule?.bidPublishDate || result.timeSchedule?.bid_publish_date,
              bid_document_sale_start: result.timeSchedule?.bidDocumentSaleStart || result.timeSchedule?.bid_document_sale_start,
              bid_document_sale_end: result.timeSchedule?.bidDocumentSaleEnd || result.timeSchedule?.bid_document_sale_end,
              question_deadline: result.timeSchedule?.questionDeadline || result.timeSchedule?.question_deadline,
              answer_publish_date: result.timeSchedule?.answerPublishDate || result.timeSchedule?.answer_publish_date,
              site_visit_date: result.timeSchedule?.siteVisitDate || result.timeSchedule?.site_visit_date,
              bid_submission_deadline: result.timeSchedule?.bidSubmissionDeadline || result.timeSchedule?.bid_submission_deadline,
              bid_opening_date: result.timeSchedule?.bidOpeningDate || result.timeSchedule?.bid_opening_date,
              bid_opening_location: result.timeSchedule?.bidOpeningLocation || result.timeSchedule?.bid_opening_location,
              
              // JSON字段
              core_tech_demand: result.coreTechDemand,
              business_requirements: result.businessRequirements,
              scoring_standard: result.scoringStandard,
              bidding_document_requirements: result.biddingDocumentRequirements,
              project_background: result.projectBackground,
              other_important_info: result.otherImportantInfo,
              full_extraction_result: {
                projectBasicInfo: result.projectBasicInfo,
                timeSchedule: result.timeSchedule,
                coreTechDemand: result.coreTechDemand,
                businessRequirements: result.businessRequirements,
                scoringStandard: result.scoringStandard,
                biddingDocumentRequirements: result.biddingDocumentRequirements,
                projectBackground: result.projectBackground,
                otherImportantInfo: result.otherImportantInfo,
                disqualificationRisks: result.disqualificationRisks,
              },
              
              // 摘要
              total_score: totalScore,
              item_count: scoringItems.length,
              risk_count: result.disqualificationRisks?.length || 0,
              
              // 元数据
              extraction_model: 'qwen3.5-plus',
              confidence_score: 0.9,
              extraction_time_ms: result.extractionMetadata.extractionTimeMs,
              document_name: docName,
              status: 'completed',
            })
            .select()
            .single();

          if (saveError) {
            sendLog(`保存失败: ${saveError.message}`);
            throw saveError;
          }

          // 保存到旧表（兼容性）
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

          for (const risk of (result.disqualificationRisks || [])) {
            await client.from('disqualification_risks').insert({
              project_id: id,
              risk_type: risk.riskType || risk.risk_type || 'other',
              risk_description: risk.description || risk.riskDescription || risk.risk_description,
              severity: risk.severity || 'high',
              source_text: risk.sourceText || risk.source_text,
              response_status: 'unresponded',
            });
          }

          sendProgress('完成', 100);
          sendLog('提取完成！');

          // 发送最终结果
          const finalData = JSON.stringify({
            type: 'complete',
            result: savedResult,
            extractionMetadata: result.extractionMetadata,
          });
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));

          controller.close();
        } catch (error: any) {
          const errorData = JSON.stringify({
            type: 'error',
            message: error.message,
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[extract-streaming] 失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '提取失败' },
      { status: 500 }
    );
  }
}
