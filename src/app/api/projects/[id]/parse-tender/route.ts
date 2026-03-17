/**
 * 招标文件解析API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createTenderDocumentParser } from '@/lib/services/tender-parser';
import { createStorageService } from '@/lib/services/storage-service';

// POST /api/projects/[id]/parse-tender - 解析招标文件
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const content = formData.get('content') as string;

    if (!file && !content) {
      return NextResponse.json(
        { success: false, error: '请上传文件或提供文档内容' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    
    // 检查项目是否存在
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id, name')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    let documentContent = content;
    let filename = '';

    // 如果上传了文件，读取内容
    if (file) {
      filename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      documentContent = buffer.toString('utf-8');
    }

    // 解析招标文件
    const parser = createTenderDocumentParser();
    const parsedDoc = await parser.parse(documentContent, filename);

    // 保存基本信息到项目
    const { error: updateError } = await client
      .from('projects')
      .update({
        project_number: parsedDoc.info.projectNumber,
        metadata: {
          ...parsedDoc,
          parsedAt: new Date().toISOString(),
        },
      })
      .eq('id', id);

    if (updateError) {
      console.error('更新项目信息失败:', updateError);
    }

    // 保存评分项
    if (parsedDoc.scoringRequirements.length > 0) {
      // 先删除旧的评分项
      await client
        .from('scoring_items')
        .delete()
        .eq('project_id', id);

      // 插入新的评分项
      const scoringItemsData = parsedDoc.scoringRequirements.map((req, index) => ({
        project_id: id,
        item_type: req.type,
        item_name: req.name,
        max_score: req.maxScore,
        scoring_rules: req.scoringRules,
        sort_order: index,
      }));

      await client
        .from('scoring_items')
        .insert(scoringItemsData);
    }

    // 保存风险因素
    if (parsedDoc.riskFactors.length > 0) {
      // 先删除旧的风险因素
      await client
        .from('risk_factors')
        .delete()
        .eq('project_id', id);

      // 插入新的风险因素
      const risksData = parsedDoc.riskFactors.map((risk, index) => ({
        project_id: id,
        risk_type: risk.type,
        severity: risk.severity,
        risk_description: risk.description,
        source_text: risk.source,
        suggestion: risk.suggestion,
        response_status: 'pending',
      }));

      await client
        .from('risk_factors')
        .insert(risksData);
    }

    return NextResponse.json({
      success: true,
      data: {
        project: {
          id,
          name: parsedDoc.info.projectName || project.name,
          projectNumber: parsedDoc.info.projectNumber,
        },
        info: parsedDoc.info,
        scoringCount: parsedDoc.scoringRequirements.length,
        riskCount: parsedDoc.riskFactors.length,
        sections: parsedDoc.sections.length,
      },
    });
  } catch (error) {
    console.error('解析招标文件失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '解析失败' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[id]/parse-tender - 获取解析结果
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

    // 获取评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    // 获取风险因素
    const { data: riskFactors } = await client
      .from('risk_factors')
      .select('*')
      .eq('project_id', id)
      .order('severity', { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        project,
        scoringItems: scoringItems || [],
        riskFactors: riskFactors || [],
        parsedInfo: project.metadata?.info || null,
      },
    });
  } catch (error) {
    console.error('获取解析结果失败:', error);
    return NextResponse.json(
      { success: false, error: '获取解析结果失败' },
      { status: 500 }
    );
  }
}
