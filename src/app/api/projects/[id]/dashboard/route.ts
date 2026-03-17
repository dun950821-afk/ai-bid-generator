/**
 * 项目关键要素看板API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/projects/[id]/dashboard - 获取项目看板数据
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取项目基本信息
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

    // 获取评分项统计
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('id, item_type, max_score')
      .eq('project_id', id);

    const scoringStats = {
      total: scoringItems?.length || 0,
      totalScore: scoringItems?.reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      technical: {
        count: scoringItems?.filter(i => i.item_type === 'technical').length || 0,
        score: scoringItems?.filter(i => i.item_type === 'technical')
          .reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      },
      business: {
        count: scoringItems?.filter(i => i.item_type === 'business').length || 0,
        score: scoringItems?.filter(i => i.item_type === 'business')
          .reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      },
      price: {
        count: scoringItems?.filter(i => i.item_type === 'price').length || 0,
        score: scoringItems?.filter(i => i.item_type === 'price')
          .reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      },
    };

    // 获取风险因素统计
    const { data: riskFactors } = await client
      .from('risk_factors')
      .select('id, severity, response_status')
      .eq('project_id', id);

    const riskStats = {
      total: riskFactors?.length || 0,
      critical: riskFactors?.filter(r => r.severity === 'critical').length || 0,
      high: riskFactors?.filter(r => r.severity === 'high').length || 0,
      medium: riskFactors?.filter(r => r.severity === 'medium').length || 0,
      low: riskFactors?.filter(r => r.severity === 'low').length || 0,
      responded: riskFactors?.filter(r => r.response_status !== 'pending').length || 0,
      verified: riskFactors?.filter(r => r.response_status === 'verified').length || 0,
    };

    // 获取章节进度
    const outline = project.metadata?.outline;
    const sectionStats = {
      total: outline?.sections?.length || 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
    };

    if (outline?.sections) {
      for (const section of outline.sections) {
        const status = section.status || 'pending';
        if (status === 'completed') sectionStats.completed++;
        else if (status === 'in_progress') sectionStats.inProgress++;
        else sectionStats.pending++;
      }
    }

    // 获取时间线信息
    const parsedInfo = project.metadata?.info;
    const timeline = {
      publishDate: parsedInfo?.publishDate || null,
      deadlineDate: parsedInfo?.deadlineDate || null,
      openDate: parsedInfo?.openDate || null,
      daysRemaining: null as number | null,
    };

    if (timeline.deadlineDate) {
      const deadline = new Date(timeline.deadlineDate);
      const now = new Date();
      timeline.daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // 构建看板数据
    const dashboard = {
      project: {
        id: project.id,
        name: project.name,
        projectNumber: project.project_number,
        status: project.status,
        createdAt: project.created_at,
      },
      summary: {
        totalScore: scoringStats.totalScore,
        scoringItems: scoringStats.total,
        riskFactors: riskStats.total,
        criticalRisks: riskStats.critical,
        sectionsCompleted: sectionStats.completed,
        sectionsTotal: sectionStats.total,
      },
      scoring: scoringStats,
      risks: riskStats,
      sections: sectionStats,
      timeline,
      parsedInfo: parsedInfo ? {
        projectName: parsedInfo.projectName,
        tenderingUnit: parsedInfo.tenderingUnit,
        budget: parsedInfo.budget,
        contactPerson: parsedInfo.contactPerson,
        contactPhone: parsedInfo.contactPhone,
      } : null,
    };

    return NextResponse.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error('获取看板数据失败:', error);
    return NextResponse.json(
      { success: false, error: '获取看板数据失败' },
      { status: 500 }
    );
  }
}
