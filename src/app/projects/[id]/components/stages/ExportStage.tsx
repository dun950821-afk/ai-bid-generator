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
  TrendingUp,
  BarChart3,
  FileCheck,
  ShieldAlert,
  RefreshCw,
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
  // 计算统计数据
  const stats = calculateStats(scoringItems, risks, validationResult, coverageReport);

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
          {/* 概览卡片 - 参考 validation/page.tsx 设计 */}
          <div className="grid grid-cols-4 gap-4">
            {/* 综合得分 */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">综合得分</p>
                    <p className="text-2xl font-bold">
                      {validationResult?.overallScore?.toFixed(0) || '-'}分
                    </p>
                  </div>
                  <TrendingUp className={`h-8 w-8 ${validationResult?.overallPassed ? 'text-green-500' : 'text-red-500'}`} />
                </div>
                <Progress value={validationResult?.overallScore || 0} className="mt-2" />
              </CardContent>
            </Card>

            {/* 评分覆盖 */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">评分覆盖</p>
                    <p className="text-2xl font-bold">
                      {coverageReport?.coverageRate?.toFixed(0) || stats.coverageRate.toFixed(0)}%
                    </p>
                  </div>
                  <Target className="h-8 w-8 text-blue-500" />
                </div>
                <Progress value={coverageReport?.coverageRate || stats.coverageRate} className="mt-2" />
              </CardContent>
            </Card>

            {/* 问题总数 */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">问题总数</p>
                    <p className="text-2xl font-bold">{validationResult?.totalIssues || 0}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-orange-500" />
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(validationResult?.criticalIssues || 0) > 0 && (
                    <Badge className="bg-red-100 text-red-700 text-xs">{validationResult?.criticalIssues} 致命</Badge>
                  )}
                  {(validationResult?.highIssues || 0) > 0 && (
                    <Badge className="bg-orange-100 text-orange-700 text-xs">{validationResult?.highIssues} 高危</Badge>
                  )}
                  {(validationResult?.mediumIssues || 0) > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-700 text-xs">{validationResult?.mediumIssues} 中</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 校验状态 */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">校验状态</p>
                    <p className={`text-lg font-semibold ${validationResult?.overallPassed ? 'text-green-600' : validationResult ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {validationResult?.overallPassed ? '✓ 通过' : validationResult ? '✗ 未通过' : '未校验'}
                    </p>
                  </div>
                  {validationResult?.overallPassed ? (
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  ) : validationResult ? (
                    <ShieldAlert className="h-8 w-8 text-red-500" />
                  ) : (
                    <FileCheck className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 校验结果和导出选项 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 校验结果摘要 */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  校验结果摘要
                </CardTitle>
              </CardHeader>
              <CardContent>
                {validationResult ? (
                  <div className="space-y-4">
                    {/* 校验维度概览 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <ValidationDimensionCard
                        title="合规性"
                        score={validationResult.complianceScore || 85}
                        passed={validationResult.compliancePassed !== false}
                      />
                      <ValidationDimensionCard
                        title="评分覆盖"
                        score={coverageReport?.coverageRate || stats.coverageRate}
                        passed={(coverageReport?.coverageRate || stats.coverageRate) >= 80}
                      />
                      <ValidationDimensionCard
                        title="风险响应"
                        score={stats.riskResponseRate}
                        passed={stats.riskResponseRate >= 90}
                      />
                      <ValidationDimensionCard
                        title="引用完整"
                        score={validationResult.citationScore || 75}
                        passed={validationResult.citationPassed !== false}
                      />
                    </div>

                    {/* 问题统计 */}
                    <div className="grid grid-cols-4 gap-3 pt-2 border-t">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-500">{validationResult.criticalIssues || 0}</p>
                        <p className="text-xs text-muted-foreground">致命问题</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-orange-500">{validationResult.highIssues || 0}</p>
                        <p className="text-xs text-muted-foreground">高危问题</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-yellow-500">{validationResult.mediumIssues || 0}</p>
                        <p className="text-xs text-muted-foreground">中等问题</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-500">{validationResult.lowIssues || 0}</p>
                        <p className="text-xs text-muted-foreground">轻微问题</p>
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
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onExport('markdown')}
                    disabled={exporting}
                  >
                    {exporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <FileText className="h-4 w-4 mr-2" />
                    Markdown 格式
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onExport('html')}
                    disabled={exporting}
                  >
                    {exporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <FileOutput className="h-4 w-4 mr-2" />
                    HTML 网页格式
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onExport('docx')}
                    disabled={exporting}
                  >
                    {exporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <FileOutput className="h-4 w-4 mr-2" />
                    Word 文档格式
                  </Button>
                </div>

                {/* 快捷统计 */}
                <div className="pt-4 border-t space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">评分项总数</span>
                    <span className="font-medium">{scoringItems.length} 个</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">风险项总数</span>
                    <span className="font-medium">{risks.length} 个</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">总字数</span>
                    <span className="font-medium">{stats.totalWords.toLocaleString()} 字</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 内容检验报告详情 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">内容检验报告详情</CardTitle>
              <CardDescription>
                评分项覆盖情况、风险响应状态和校验详情
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="coverage" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="coverage">评分覆盖</TabsTrigger>
                  <TabsTrigger value="risks">风险响应</TabsTrigger>
                  <TabsTrigger value="issues">问题列表</TabsTrigger>
                  <TabsTrigger value="suggestions">优化建议</TabsTrigger>
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

                {/* 问题列表 Tab */}
                <TabsContent value="issues" className="mt-4">
                  <IssuesTab validationResult={validationResult} />
                </TabsContent>

                {/* 优化建议 Tab */}
                <TabsContent value="suggestions" className="mt-4">
                  <SuggestionsTab 
                    coverageReport={coverageReport} 
                    validationResult={validationResult}
                    scoringItems={scoringItems}
                    risks={risks}
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
 * 计算统计数据
 */
function calculateStats(
  scoringItems: ScoringItem[], 
  risks: Risk[], 
  validationResult: ValidationResult | null,
  coverageReport: CoverageReport | null
) {
  // 评分覆盖率
  const coveredItems = scoringItems.filter(i => i.response_status === 'covered');
  const coverageRate = scoringItems.length > 0 
    ? (coveredItems.length / scoringItems.length) * 100 
    : 0;

  // 风险响应率
  const respondedRisks = risks.filter(r => r.response_status === 'covered');
  const riskResponseRate = risks.length > 0 
    ? (respondedRisks.length / risks.length) * 100 
    : 100;

  // 总字数（从validationResult中获取或估算）
  const totalWords = validationResult?.totalWords || 0;

  return {
    coverageRate,
    riskResponseRate,
    totalWords,
  };
}

/**
 * 校验维度卡片
 */
function ValidationDimensionCard({ title, score, passed }: { title: string; score: number; passed: boolean }) {
  return (
    <div className={cn(
      "p-3 rounded-lg border text-center",
      passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
    )}>
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      <p className={cn(
        "text-xl font-bold",
        passed ? "text-green-600" : "text-red-600"
      )}>
        {score.toFixed(0)}分
      </p>
      {passed ? (
        <CheckCircle className="h-4 w-4 mx-auto text-green-500 mt-1" />
      ) : (
        <AlertTriangle className="h-4 w-4 mx-auto text-red-500 mt-1" />
      )}
    </div>
  );
}

/**
 * 评分覆盖 Tab
 */
function ScoreCoverageTab({ coverageReport, scoringItems }: { coverageReport: CoverageReport | null; scoringItems: ScoringItem[] }) {
  if (!coverageReport && scoringItems.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>暂无评分项数据</p>
      </div>
    );
  }

  // 按类型分组统计
  const typeStats = scoringItems.reduce((acc, item) => {
    const type = item.item_type || 'other';
    if (!acc[type]) {
      acc[type] = { total: 0, covered: 0, partial: 0, uncovered: 0, score: 0, maxScore: 0 };
    }
    acc[type].total++;
    acc[type].maxScore += item.max_score || 0;
    if (item.response_status === 'covered') {
      acc[type].covered++;
      acc[type].score += item.max_score || 0;
    } else if (item.response_status === 'partial') {
      acc[type].partial++;
    } else {
      acc[type].uncovered++;
    }
    return acc;
  }, {} as Record<string, { total: number; covered: number; partial: number; uncovered: number; score: number; maxScore: number }>);

  const typeNames: Record<string, string> = {
    technical: '技术评分',
    business: '商务评分',
    price: '价格评分',
    other: '其他',
  };

  const coverageRate = coverageReport?.coverageRate || (scoringItems.length > 0 
    ? (scoringItems.filter(i => i.response_status === 'covered').length / scoringItems.length) * 100 
    : 0);

  return (
    <div className="space-y-4">
      {/* 总体覆盖率 */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm text-muted-foreground">总体覆盖率</p>
            <p className="text-3xl font-bold">{coverageRate.toFixed(0)}%</p>
          </div>
          <Progress value={coverageRate} className="w-40 h-3" />
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">已覆盖评分项</p>
          <p className="text-lg font-semibold">
            {scoringItems.filter(i => i.response_status === 'covered').length} / {scoringItems.length}
          </p>
        </div>
      </div>

      {/* 按类型统计 */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>类型</TableHead>
              <TableHead className="text-center">总数</TableHead>
              <TableHead className="text-center">已覆盖</TableHead>
              <TableHead className="text-center">部分覆盖</TableHead>
              <TableHead className="text-center">未覆盖</TableHead>
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
                <TableCell className="text-center text-green-600">{stats.covered}</TableCell>
                <TableCell className="text-center text-yellow-600">{stats.partial}</TableCell>
                <TableCell className="text-center text-red-600">{stats.uncovered}</TableCell>
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
                  <span className="font-semibold text-green-600">{stats.score}</span>
                  <span className="text-muted-foreground">/{stats.maxScore}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 未覆盖项 */}
      {coverageReport?.uncoveredItems && coverageReport.uncoveredItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>未覆盖的评分项 ({coverageReport.uncoveredItems.length})</AlertTitle>
          <AlertDescription>
            <ScrollArea className="h-[200px] mt-2">
              <div className="space-y-2">
                {coverageReport.uncoveredItems.slice(0, 10).map((item, idx) => (
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
                {coverageReport.uncoveredItems.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center">
                    还有 {coverageReport.uncoveredItems.length - 10} 项未显示...
                  </p>
                )}
              </div>
            </ScrollArea>
          </AlertDescription>
        </Alert>
      )}

      {/* 部分覆盖项 */}
      {coverageReport?.partialItems && coverageReport.partialItems.length > 0 && (
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
                {coverageReport.partialItems.slice(0, 10).map((item, idx) => (
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
    critical: '致命',
    high: '高危',
    medium: '中等',
    low: '轻微',
  };

  const totalResponded = (statusStats['covered'] || 0) + (statusStats['partial'] || 0);
  const responseRate = risks.length > 0 ? (totalResponded / risks.length) * 100 : 100;

  return (
    <div className="space-y-4">
      {/* 响应状态统计 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border text-center">
          <p className="text-sm text-muted-foreground mb-1">总风险数</p>
          <p className="text-2xl font-bold">{risks.length}</p>
        </div>
        <div className="p-3 rounded-lg border text-center bg-green-50">
          <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs">已响应</span>
          </div>
          <p className="text-xl font-bold text-green-600">{statusStats['covered'] || 0}</p>
        </div>
        <div className="p-3 rounded-lg border text-center bg-yellow-50">
          <div className="flex items-center justify-center gap-1 text-yellow-600 mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">部分响应</span>
          </div>
          <p className="text-xl font-bold text-yellow-600">{statusStats['partial'] || 0}</p>
        </div>
        <div className="p-3 rounded-lg border text-center bg-red-50">
          <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
            <XCircle className="h-4 w-4" />
            <span className="text-xs">未响应</span>
          </div>
          <p className="text-xl font-bold text-red-600">{statusStats['uncovered'] || risks.length}</p>
        </div>
      </div>

      {/* 响应率进度 */}
      <div className="p-4 rounded-lg bg-muted/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">总体响应率</span>
          <span className="font-bold">{responseRate.toFixed(0)}%</span>
        </div>
        <Progress value={responseRate} className="h-3" />
      </div>

      {/* 风险列表 */}
      <ScrollArea className="h-[350px]">
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
 * 问题列表 Tab
 */
function IssuesTab({ validationResult }: { validationResult: ValidationResult | null }) {
  if (!validationResult) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>执行校验后查看问题列表</p>
      </div>
    );
  }

  const hasIssues = (validationResult.criticalIssues || 0) > 0 || 
                    (validationResult.highIssues || 0) > 0 || 
                    (validationResult.mediumIssues || 0) > 0 || 
                    (validationResult.lowIssues || 0) > 0;

  if (!hasIssues) {
    return (
      <div className="text-center py-8 text-green-600">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3" />
        <p className="text-lg font-semibold">暂无问题</p>
        <p className="text-muted-foreground mt-2">所有校验项均已通过</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 问题统计概览 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-center">
          <p className="text-2xl font-bold text-red-600">{validationResult.criticalIssues || 0}</p>
          <p className="text-xs text-muted-foreground">致命问题</p>
        </div>
        <div className="p-3 rounded-lg border border-orange-200 bg-orange-50 text-center">
          <p className="text-2xl font-bold text-orange-600">{validationResult.highIssues || 0}</p>
          <p className="text-xs text-muted-foreground">高危问题</p>
        </div>
        <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-center">
          <p className="text-2xl font-bold text-yellow-600">{validationResult.mediumIssues || 0}</p>
          <p className="text-xs text-muted-foreground">中等问题</p>
        </div>
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 text-center">
          <p className="text-2xl font-bold text-blue-600">{validationResult.lowIssues || 0}</p>
          <p className="text-xs text-muted-foreground">轻微问题</p>
        </div>
      </div>

      {/* 问题列表 */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>发现 {validationResult.totalIssues || 0} 个问题需要处理</AlertTitle>
        <AlertDescription>
          <p className="mt-2">
            请根据问题严重程度优先处理致命和高危问题，以确保标书质量符合要求。
          </p>
        </AlertDescription>
      </Alert>

      {/* 状态说明 */}
      <div className="p-4 rounded-lg bg-muted/30">
        <p className="text-sm font-medium mb-2">问题处理优先级</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-red-700">致命：必须立即处理</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-orange-700">高危：优先处理</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-yellow-700">中等：建议处理</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-blue-700">轻微：可选处理</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 优化建议 Tab
 */
function SuggestionsTab({ 
  coverageReport, 
  validationResult,
  scoringItems,
  risks 
}: { 
  coverageReport: CoverageReport | null;
  validationResult: ValidationResult | null;
  scoringItems: ScoringItem[];
  risks: Risk[];
}) {
  // 生成智能建议
  const suggestions: string[] = [];
  
  // 评分覆盖建议
  const coveredCount = scoringItems.filter(i => i.response_status === 'covered').length;
  const coverageRate = scoringItems.length > 0 ? (coveredCount / scoringItems.length) * 100 : 0;
  
  if (coverageRate < 80) {
    suggestions.push(`当前评分覆盖率仅为 ${coverageRate.toFixed(0)}%，建议提升至 80% 以上以获得更高评标得分`);
  }
  
  // 风险响应建议
  const unrespondedRisks = risks.filter(r => r.response_status !== 'covered');
  const criticalRisks = risks.filter(r => r.severity === 'critical' && r.response_status !== 'covered');
  
  if (criticalRisks.length > 0) {
    suggestions.push(`存在 ${criticalRisks.length} 个致命风险未响应，可能导致废标，请优先处理`);
  }
  
  if (unrespondedRisks.length > 0 && criticalRisks.length === 0) {
    suggestions.push(`还有 ${unrespondedRisks.length} 个风险项未响应，建议补充相关内容`);
  }

  // 校验结果建议
  if (validationResult) {
    if ((validationResult.criticalIssues || 0) > 0) {
      suggestions.push(`校验发现 ${validationResult.criticalIssues} 个致命问题，请立即修复`);
    }
    if ((validationResult.highIssues || 0) > 0) {
      suggestions.push(`校验发现 ${validationResult.highIssues} 个高危问题，建议优先处理`);
    }
  }

  // 合并覆盖报告的建议
  if (coverageReport?.recommendations) {
    suggestions.push(...coverageReport.recommendations);
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-8 text-green-600">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3" />
        <p className="text-lg font-semibold">标书质量良好</p>
        <p className="text-muted-foreground mt-2">暂无需要优化的项目</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 建议统计 */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div>
            <p className="font-medium">发现 {suggestions.length} 条优化建议</p>
            <p className="text-sm text-muted-foreground">按优先级排序，建议逐一处理</p>
          </div>
        </div>
      </div>

      {/* 建议列表 */}
      <div className="space-y-2">
        {suggestions.map((suggestion, idx) => (
          <div 
            key={idx} 
            className={cn(
              "p-3 rounded-lg border flex items-start gap-3",
              idx === 0 && suggestion.includes('致命') ? "border-red-200 bg-red-50" :
              idx === 0 ? "border-amber-200 bg-amber-50" :
              "border-border bg-card"
            )}
          >
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
              idx === 0 && suggestion.includes('致命') ? "bg-red-500 text-white" :
              idx === 0 ? "bg-amber-500 text-white" :
              "bg-muted text-muted-foreground"
            )}>
              {idx + 1}
            </div>
            <p className="text-sm">{suggestion}</p>
          </div>
        ))}
      </div>

      {/* 快捷操作 */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                处理完成后可重新执行校验
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ExportStage;
