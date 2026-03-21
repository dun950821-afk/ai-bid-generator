'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  ShieldCheck,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  FileText,
  FileOutput,
  AlertCircle,
  Target,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { ValidationResult, ScoringItem, Risk } from '../../types';

interface ExportStageProps {
  projectId: string;
  hasContent: boolean;
  validationResult: ValidationResult | null;
  coverageReport: CoverageReport | null;
  validating: boolean;
  exporting: boolean;
  scoringItems: ScoringItem[];
  risks: Risk[];
  onValidate: () => Promise<void>;
  onExport: (format: 'markdown' | 'html' | 'docx') => Promise<void>;
}

// 覆盖报告类型
interface CoverageReport {
  coverageRate: number;
  coverageByType: Record<string, { total: number; covered: number; rate: number }>;
  uncoveredItems: ScoringItem[];
  partialItems: Array<{
    item_name: string;
    item_type: string;
    max_score: number;
    coverageScore: number;
    missingAspects?: string[];
  }>;
  fullyCoveredItems: ScoringItem[];
  recommendations: string[];
}

// 严重程度样式
const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  low: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

// 响应状态样式
const RESPONSE_STATUS_STYLES: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  covered: { icon: CheckCircle, color: 'text-green-600', label: '已响应' },
  partial: { icon: AlertTriangle, color: 'text-yellow-600', label: '部分响应' },
  uncovered: { icon: XCircle, color: 'text-red-600', label: '未响应' },
};

/**
 * 校验导出阶段组件
 */
export function ExportStage({
  projectId,
  hasContent,
  validationResult,
  coverageReport,
  validating,
  exporting,
  scoringItems,
  risks,
  onValidate,
  onExport,
}: ExportStageProps) {
  return (
    <div className="space-y-4">
      {/* 校验操作栏 */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">校验与导出</CardTitle>
              <CardDescription>
                校验标书内容质量并导出文档
              </CardDescription>
            </div>
            <Button
              onClick={onValidate}
              disabled={!hasContent || validating}
            >
              {validating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              执行校验
            </Button>
          </div>
        </CardHeader>
      </Card>

      {!hasContent ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center">
              <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">请先生成章节内容</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 校验结果和导出选项 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 校验结果 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  校验结果
                </CardTitle>
              </CardHeader>
              <CardContent>
                {validationResult ? (
                  <div className="space-y-4">
                    {/* 总体得分 */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm text-muted-foreground">总体得分</p>
                        <p className="text-3xl font-bold">{validationResult.overallScore.toFixed(0)}</p>
                      </div>
                      <Badge
                        variant={validationResult.overallPassed ? 'default' : 'destructive'}
                        className={cn(
                          "text-sm",
                          validationResult.overallPassed && "bg-green-600"
                        )}
                      >
                        {validationResult.overallPassed ? '通过' : '待修复'}
                      </Badge>
                    </div>

                    {/* 问题统计 */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg border">
                        <p className="text-xs text-muted-foreground">严重问题</p>
                        <p className="text-xl font-bold text-red-500">
                          {validationResult.criticalIssues + validationResult.highIssues}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border">
                        <p className="text-xs text-muted-foreground">中等问题</p>
                        <p className="text-xl font-bold text-yellow-500">
                          {validationResult.mediumIssues}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border">
                        <p className="text-xs text-muted-foreground">轻微问题</p>
                        <p className="text-xl font-bold text-blue-500">
                          {validationResult.lowIssues}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>点击"执行校验"按钮开始校验</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 导出选项 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileOutput className="h-4 w-4" />
                  导出文档
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  选择格式导出标书文档
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onExport('markdown')}
                    disabled={exporting}
                  >
                    {exporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Markdown
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onExport('html')}
                    disabled={exporting}
                  >
                    {exporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    HTML
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onExport('docx')}
                    disabled={exporting}
                  >
                    {exporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Word (DOCX)
                  </Button>
                </div>

                {/* 快捷统计 */}
                <div className="pt-4 border-t grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="text-sm">{scoringItems.length} 个评分项</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">{risks.length} 个风险项</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 内容检验报告 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">内容检验报告</CardTitle>
              <CardDescription>
                评分项覆盖情况、风险响应状态和校验详情
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="coverage" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="coverage">评分覆盖</TabsTrigger>
                  <TabsTrigger value="risks">风险响应</TabsTrigger>
                  <TabsTrigger value="details">校验详情</TabsTrigger>
                </TabsList>

                {/* 评分覆盖 Tab */}
                <TabsContent value="coverage" className="mt-4">
                  <ScoreCoverageTab 
                    coverageReport={coverageReport} 
                    scoringItems={scoringItems} 
                  />
                </TabsContent>

                {/* 风险响应 Tab */}
                <TabsContent value="risks" className="mt-4">
                  <RiskResponseTab risks={risks} />
                </TabsContent>

                {/* 校验详情 Tab */}
                <TabsContent value="details" className="mt-4">
                  <ValidationDetailsTab 
                    validationResult={validationResult}
                    coverageReport={coverageReport}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * 评分覆盖 Tab
 */
function ScoreCoverageTab({ coverageReport, scoringItems }: { coverageReport: CoverageReport | null; scoringItems: ScoringItem[] }) {
  if (!coverageReport) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>执行校验后查看评分覆盖情况</p>
      </div>
    );
  }

  // 按类型分组统计
  const typeStats = scoringItems.reduce((acc, item) => {
    const type = item.item_type || 'other';
    if (!acc[type]) {
      acc[type] = { total: 0, covered: 0, score: 0, maxScore: 0 };
    }
    acc[type].total++;
    acc[type].maxScore += item.max_score || 0;
    if (item.response_status === 'covered') {
      acc[type].covered++;
      acc[type].score += item.max_score || 0;
    }
    return acc;
  }, {} as Record<string, { total: number; covered: number; score: number; maxScore: number }>);

  const typeNames: Record<string, string> = {
    technical: '技术评分',
    business: '商务评分',
    price: '价格评分',
    other: '其他',
  };

  return (
    <div className="space-y-4">
      {/* 总体覆盖率 */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
        <div>
          <p className="text-sm text-muted-foreground">总体覆盖率</p>
          <p className="text-2xl font-bold">{coverageReport.coverageRate?.toFixed(0) || 0}%</p>
        </div>
        <Progress value={coverageReport.coverageRate || 0} className="w-32 h-3" />
      </div>

      {/* 按类型统计 */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>类型</TableHead>
              <TableHead className="text-center">总数</TableHead>
              <TableHead className="text-center">已覆盖</TableHead>
              <TableHead className="text-center">覆盖率</TableHead>
              <TableHead className="text-right">覆盖分值</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(typeStats).map(([type, stats]) => (
              <TableRow key={type}>
                <TableCell className="font-medium">
                  <Badge variant="outline">{typeNames[type] || type}</Badge>
                </TableCell>
                <TableCell className="text-center">{stats.total}</TableCell>
                <TableCell className="text-center">{stats.covered}</TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Progress 
                      value={stats.total > 0 ? (stats.covered / stats.total) * 100 : 0} 
                      className="h-2 w-16" 
                    />
                    <span className="text-sm">
                      {stats.total > 0 ? ((stats.covered / stats.total) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold">{stats.score}</span>
                  <span className="text-muted-foreground">/{stats.maxScore}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 未覆盖项 */}
      {coverageReport.uncoveredItems && coverageReport.uncoveredItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>未覆盖的评分项 ({coverageReport.uncoveredItems.length})</AlertTitle>
          <AlertDescription>
            <ScrollArea className="h-[200px] mt-2">
              <div className="space-y-2">
                {coverageReport.uncoveredItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-red-50 border border-red-200">
                    <div>
                      <span className="font-medium">{item.item_name}</span>
                      <Badge variant="outline" className="ml-2">
                        {typeNames[item.item_type] || item.item_type}
                      </Badge>
                    </div>
                    <span className="text-red-600 font-semibold">{item.max_score}分</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </AlertDescription>
        </Alert>
      )}

      {/* 部分覆盖项 */}
      {coverageReport.partialItems && coverageReport.partialItems.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-yellow-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              响应不完整的评分项 ({coverageReport.partialItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {coverageReport.partialItems.map((item, idx) => (
                  <div key={idx} className="p-2 rounded bg-yellow-50 border border-yellow-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{item.item_name}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={item.coverageScore} className="h-2 w-16" />
                        <span className="text-sm">{item.coverageScore}%</span>
                      </div>
                    </div>
                    {item.missingAspects && item.missingAspects.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        缺失: {item.missingAspects.join('、')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * 风险响应 Tab
 */
function RiskResponseTab({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) {
    return (
      <div className="text-center py-8 text-green-600">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3" />
        <p className="text-lg font-semibold">暂无风险项</p>
        <p className="text-muted-foreground mt-2">招标文档中未识别出废标风险</p>
      </div>
    );
  }

  // 按严重程度分组
  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const groupedRisks = severityOrder.reduce((acc, severity) => {
    acc[severity] = risks.filter(r => r.severity === severity);
    return acc;
  }, {} as Record<string, Risk[]>);

  // 统计响应状态
  const statusStats = risks.reduce((acc, risk) => {
    const status = risk.response_status || 'uncovered';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const severityNames: Record<string, string> = {
    critical: '严重',
    high: '高危',
    medium: '中等',
    low: '轻微',
  };

  return (
    <div className="space-y-4">
      {/* 响应状态统计 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border text-center">
          <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs">已响应</span>
          </div>
          <p className="text-xl font-bold">{statusStats['covered'] || 0}</p>
        </div>
        <div className="p-3 rounded-lg border text-center">
          <div className="flex items-center justify-center gap-1 text-yellow-600 mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">部分响应</span>
          </div>
          <p className="text-xl font-bold">{statusStats['partial'] || 0}</p>
        </div>
        <div className="p-3 rounded-lg border text-center">
          <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
            <XCircle className="h-4 w-4" />
            <span className="text-xs">未响应</span>
          </div>
          <p className="text-xl font-bold">{statusStats['uncovered'] || risks.length}</p>
        </div>
      </div>

      {/* 风险列表 */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {severityOrder.map(severity => {
            const severityRisks = groupedRisks[severity];
            if (!severityRisks || severityRisks.length === 0) return null;

            return (
              <div key={severity}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    variant={severity === 'critical' ? 'destructive' : severity === 'high' ? 'default' : 'secondary'}
                  >
                    {severityNames[severity]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {severityRisks.length} 项
                  </span>
                </div>
                
                {severityRisks.map((risk, idx) => {
                  const statusStyle = RESPONSE_STATUS_STYLES[risk.response_status || 'uncovered'];
                  const StatusIcon = statusStyle.icon;
                  const severityStyle = SEVERITY_STYLES[severity] || SEVERITY_STYLES.medium;

                  return (
                    <div 
                      key={risk.id || idx} 
                      className={cn(
                        "p-3 rounded-lg border mb-2",
                        severityStyle.bg,
                        severityStyle.border
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {risk.risk_type}
                            </Badge>
                          </div>
                          <p className={cn("text-sm", severityStyle.text)}>
                            {risk.risk_description}
                          </p>
                        </div>
                        <div className={cn("flex items-center gap-1", statusStyle.color)}>
                          <StatusIcon className="h-4 w-4" />
                          <span className="text-xs">{statusStyle.label}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * 校验详情 Tab
 */
function ValidationDetailsTab({ 
  validationResult, 
  coverageReport 
}: { 
  validationResult: ValidationResult | null;
  coverageReport: CoverageReport | null;
}) {
  if (!validationResult && !coverageReport) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>执行校验后查看详细信息</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 校验统计 */}
      {validationResult && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border text-center">
            <p className="text-xs text-muted-foreground">总分</p>
            <p className="text-lg font-bold">{validationResult.overallScore.toFixed(0)}</p>
          </div>
          <div className="p-3 rounded-lg border text-center bg-red-50">
            <p className="text-xs text-muted-foreground">严重</p>
            <p className="text-lg font-bold text-red-600">{validationResult.criticalIssues + validationResult.highIssues}</p>
          </div>
          <div className="p-3 rounded-lg border text-center bg-yellow-50">
            <p className="text-xs text-muted-foreground">中等</p>
            <p className="text-lg font-bold text-yellow-600">{validationResult.mediumIssues}</p>
          </div>
          <div className="p-3 rounded-lg border text-center bg-blue-50">
            <p className="text-xs text-muted-foreground">轻微</p>
            <p className="text-lg font-bold text-blue-600">{validationResult.lowIssues}</p>
          </div>
        </div>
      )}

      {/* 优化建议 */}
      {coverageReport?.recommendations && coverageReport.recommendations.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              优化建议
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {coverageReport.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 状态说明 */}
      <div className="p-4 rounded-lg bg-muted/30">
        <p className="text-sm font-medium mb-2">校验状态说明</p>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-green-700">已通过</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-yellow-700">待优化</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600" />
            <span className="text-red-700">需修复</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExportStage;
