'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Target, AlertTriangle, FileText, CheckCircle } from 'lucide-react';
import type { ProjectSummary } from '../../types';

interface QuickStatsProps {
  summary: ProjectSummary;
  validationResult?: {
    overallScore: number;
    overallPassed: boolean;
  } | null;
  coverageReport?: {
    coverageRate?: number;
  } | null;
}

/**
 * 快捷统计栏组件
 * 紧凑展示4个核心指标
 */
export function QuickStats({ summary, validationResult, coverageReport }: QuickStatsProps) {
  const stats = [
    {
      label: '评分总分',
      value: summary.totalScore,
      subLabel: `技术 ${summary.technicalScore} · 商务 ${summary.businessScore}`,
      icon: Target,
      iconColor: 'text-primary',
    },
    {
      label: '废标风险',
      value: summary.criticalRisks + summary.highRisks,
      subLabel: `致命 ${summary.criticalRisks} · 高危 ${summary.highRisks}`,
      icon: AlertTriangle,
      iconColor: summary.criticalRisks + summary.highRisks > 0 ? 'text-red-500' : 'text-green-500',
    },
    {
      label: '生成进度',
      value: summary.totalSections > 0 
        ? `${Math.round((summary.generatedCount / summary.totalSections) * 100)}%`
        : '0%',
      subLabel: `${summary.generatedCount}/${summary.totalSections} 章节`,
      icon: FileText,
      iconColor: 'text-blue-500',
      showProgress: true,
      progress: summary.totalSections > 0 
        ? (summary.generatedCount / summary.totalSections) * 100 
        : 0,
    },
    {
      label: '校验状态',
      value: validationResult?.overallPassed ? '通过' : validationResult ? '待修复' : '未校验',
      subLabel: validationResult ? `得分 ${validationResult.overallScore.toFixed(0)}` : '点击校验',
      icon: CheckCircle,
      iconColor: validationResult?.overallPassed 
        ? 'text-green-500' 
        : validationResult 
          ? 'text-yellow-500' 
          : 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-xl font-bold truncate">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{stat.subLabel}</p>
                {stat.showProgress && (
                  <Progress value={stat.progress} className="h-1 mt-2" />
                )}
              </div>
              <stat.icon className={cn("h-8 w-8 flex-shrink-0", stat.iconColor)} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default QuickStats;
