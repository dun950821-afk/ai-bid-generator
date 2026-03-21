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
  Link2,
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
                    <p className="text-2xl font-bold">{stats.totalIssues}</p>
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
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="coverage">评分覆盖</TabsTrigger>
                  <TabsTrigger value="risks">风险响应</TabsTrigger>
                  <TabsTrigger value="issues">问题列表</TabsTrigger>
                  <TabsTrigger value="details">详细报告</TabsTrigger>
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

                {/* 详细报告 Tab */}
                <TabsContent value="details" className="mt-4">
                  <DetailedReportTab validationResult={validationResult} />
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

  // 总问题数（计算）
  const totalIssues = (validationResult?.criticalIssues || 0) +
                      (validationResult?.highIssues || 0) +
                      (validationResult?.mediumIssues || 0) +
                      (validationResult?.lowIssues || 0);

  return {
    coverageRate,
    riskResponseRate,
    totalWords,
    totalIssues,
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
  const [expandedSeverities, setExpandedSeverities] = useState<Set<string>>(new Set(['critical', 'high']));

  const toggleSeverity = (severity: string) => {
    setExpandedSeverities(prev => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  };

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

  const severityConfig: Record<string, { label: string; desc: string }> = {
    critical: { label: '致命风险', desc: '可能导致直接废标' },
    high: { label: '高危风险', desc: '严重影响评标结果' },
    medium: { label: '中等风险', desc: '影响部分评分项' },
    low: { label: '轻微风险', desc: '建议优化项' },
  };

  const totalResponded = (statusStats['covered'] || 0) + (statusStats['partial'] || 0);
  const responseRate = risks.length > 0 ? (totalResponded / risks.length) * 100 : 100;

  return (
    <div className="space-y-4">
      {/* 响应状态统计 */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            风险响应统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-lg border bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground mb-1">总风险数</p>
              <p className="text-2xl font-bold">{risks.length}</p>
            </div>
            <div className="p-3 rounded-lg border bg-green-50 text-center">
              <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs">已响应</span>
              </div>
              <p className="text-xl font-bold text-green-600">{statusStats['covered'] || 0}</p>
            </div>
            <div className="p-3 rounded-lg border bg-yellow-50 text-center">
              <div className="flex items-center justify-center gap-1 text-yellow-600 mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">部分响应</span>
              </div>
              <p className="text-xl font-bold text-yellow-600">{statusStats['partial'] || 0}</p>
            </div>
            <div className="p-3 rounded-lg border bg-red-50 text-center">
              <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
                <XCircle className="h-4 w-4" />
                <span className="text-xs">未响应</span>
              </div>
              <p className="text-xl font-bold text-red-600">{statusStats['uncovered'] || risks.length}</p>
            </div>
          </div>
          {/* 响应率进度 */}
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">总体响应率</span>
              <span className="font-bold">{responseRate.toFixed(0)}%</span>
            </div>
            <Progress value={responseRate} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* 按严重程度分组显示 - 折叠面板 */}
      {severityOrder.map(severity => {
        const severityRisks = groupedRisks[severity];
        if (!severityRisks || severityRisks.length === 0) return null;

        const config = severityConfig[severity];
        const isExpanded = expandedSeverities.has(severity);
        
        // 统计该严重程度下的响应状态
        const covered = severityRisks.filter(r => r.response_status === 'covered').length;
        const partial = severityRisks.filter(r => r.response_status === 'partial').length;
        const uncovered = severityRisks.filter(r => r.response_status !== 'covered' && r.response_status !== 'partial').length;

        return (
          <Card key={severity} className={cn(
            "overflow-hidden",
            severity === 'critical' && "border-red-300",
            severity === 'high' && "border-orange-300",
            severity === 'medium' && "border-yellow-300",
            severity === 'low' && "border-blue-300"
          )}>
            {/* 标题栏 - 可点击展开 */}
            <button
              onClick={() => toggleSeverity(severity)}
              className={cn(
                "w-full px-4 py-3 flex items-center justify-between border-b transition-colors",
                severity === 'critical' && "bg-red-50 border-red-200 hover:bg-red-100",
                severity === 'high' && "bg-orange-50 border-orange-200 hover:bg-orange-100",
                severity === 'medium' && "bg-yellow-50 border-yellow-200 hover:bg-yellow-100",
                severity === 'low' && "bg-blue-50 border-blue-200 hover:bg-blue-100"
              )}
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className={cn(
                  "h-5 w-5",
                  severity === 'critical' && "text-red-600",
                  severity === 'high' && "text-orange-600",
                  severity === 'medium' && "text-yellow-600",
                  severity === 'low' && "text-blue-600"
                )} />
                <div className="text-left">
                  <CardTitle className="text-base">{config.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{config.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {covered > 0 && (
                    <Badge className="bg-green-100 text-green-700 text-xs">{covered} 已响应</Badge>
                  )}
                  {partial > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-700 text-xs">{partial} 部分</Badge>
                  )}
                  {uncovered > 0 && (
                    <Badge className="bg-red-100 text-red-700 text-xs">{uncovered} 未响应</Badge>
                  )}
                </div>
                <Badge variant={severity === 'critical' || severity === 'high' ? 'destructive' : 'secondary'} className="text-sm">
                  {severityRisks.length} 项
                </Badge>
                <div className={cn(
                  "ml-2 transition-transform",
                  isExpanded && "rotate-180"
                )}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 11L3 6h10l-5 5z"/>
                  </svg>
                </div>
              </div>
            </button>

            {/* 展开内容 */}
            {isExpanded && (
              <CardContent className="pt-4">
                <RiskList risks={severityRisks} />
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* 未响应风险警告 */}
      {(statusStats['uncovered'] || 0) > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>存在 {statusStats['uncovered']} 个未响应的风险项</AlertTitle>
          <AlertDescription>
            <p className="text-sm">
              未响应的风险项可能导致评分扣分或废标，请及时补充相关内容。
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * 风险列表组件 - 支持分页展示
 */
function RiskList({ risks }: { risks: Risk[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayRisks = showAll ? risks : risks.slice(0, 5);
  const hasMore = risks.length > 5;

  return (
    <div className="space-y-2">
      {displayRisks.map((risk, idx) => {
        const statusKey = (risk.response_status && RESPONSE_STATUS_STYLES[risk.response_status as keyof typeof RESPONSE_STATUS_STYLES])
          ? risk.response_status as keyof typeof RESPONSE_STATUS_STYLES
          : 'uncovered';
        const statusStyle = RESPONSE_STATUS_STYLES[statusKey];
        const StatusIcon = statusStyle.icon;

        return (
          <div 
            key={risk.id || idx} 
            className="p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs shrink-0">
                    {risk.risk_type}
                  </Badge>
                </div>
                <p className="text-sm">{risk.risk_description}</p>
              </div>
              <div className={cn("flex items-center gap-1 shrink-0", statusStyle.color)}>
                <StatusIcon className="h-4 w-4" />
                <span className="text-xs">{statusStyle.label}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* 显示更多/收起按钮 */}
      {hasMore && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-muted-foreground"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? (
            <>
              <span>收起</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="ml-1">
                <path d="M6 4L10 8H2l4-4z"/>
              </svg>
            </>
          ) : (
            <>
              <span>显示全部 {risks.length} 项</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="ml-1">
                <path d="M6 8L2 4h8l-4 4z"/>
              </svg>
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// 校验类型名称映射
const VALIDATION_TYPE_NAMES: Record<string, string> = {
  compliance: '合规校验',
  score_coverage: '评分覆盖校验',
  logic_consistency: '逻辑一致性校验',
  disqualification: '废标风险校验',
  citation: '引用校验',
};

/**
 * 问题列表 Tab
 */
function IssuesTab({ validationResult }: { validationResult: ValidationResult | null }) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['critical', 'high']));

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (!validationResult) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>执行校验后查看问题列表</p>
      </div>
    );
  }

  // 计算总问题数
  const criticalCount = validationResult.criticalIssues || 0;
  const highCount = validationResult.highIssues || 0;
  const mediumCount = validationResult.mediumIssues || 0;
  const lowCount = validationResult.lowIssues || 0;
  const totalIssues = criticalCount + highCount + mediumCount + lowCount;

  const hasIssues = totalIssues > 0;

  if (!hasIssues) {
    return (
      <div className="text-center py-8 text-green-600">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3" />
        <p className="text-lg font-semibold">暂无问题</p>
        <p className="text-muted-foreground mt-2">所有校验项均已通过</p>
      </div>
    );
  }

  // 从 validationResult.results 中提取所有问题
  const allIssues = validationResult.results?.flatMap(r => 
    (r.issues || []).map(issue => ({ ...issue, validationType: r.validationType }))
  ) || [];

  // 按严重程度分组
  const issuesBySeverity = {
    critical: allIssues.filter(i => i.severity === 'critical'),
    high: allIssues.filter(i => i.severity === 'high'),
    medium: allIssues.filter(i => i.severity === 'medium'),
    low: allIssues.filter(i => i.severity === 'low'),
  };

  // 严重程度配置
  const severityConfig = {
    critical: { 
      label: '致命问题', 
      color: 'red', 
      desc: '可能导致废标，必须立即处理',
      icon: AlertTriangle 
    },
    high: { 
      label: '高危问题', 
      color: 'orange', 
      desc: '严重影响评分，优先处理',
      icon: AlertCircle 
    },
    medium: { 
      label: '中等问题', 
      color: 'yellow', 
      desc: '影响部分评分，建议处理',
      icon: Info 
    },
    low: { 
      label: '轻微问题', 
      color: 'blue', 
      desc: '可优化项，可选处理',
      icon: Info 
    },
  };

  return (
    <div className="space-y-4">
      {/* 问题分布可视化 */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            问题分布 ({totalIssues} 个问题)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="p-3 rounded-lg bg-red-100 text-center">
              <p className="text-2xl font-bold text-red-700">{criticalCount}</p>
              <p className="text-xs text-red-600">致命</p>
            </div>
            <div className="p-3 rounded-lg bg-orange-100 text-center">
              <p className="text-2xl font-bold text-orange-700">{highCount}</p>
              <p className="text-xs text-orange-600">高危</p>
            </div>
            <div className="p-3 rounded-lg bg-yellow-100 text-center">
              <p className="text-2xl font-bold text-yellow-700">{mediumCount}</p>
              <p className="text-xs text-yellow-600">中等</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100 text-center">
              <p className="text-2xl font-bold text-blue-700">{lowCount}</p>
              <p className="text-xs text-blue-600">轻微</p>
            </div>
          </div>
          <div className="space-y-2">
            <IssueProgressBar label="致命问题" count={criticalCount} total={totalIssues} color="bg-red-500" />
            <IssueProgressBar label="高危问题" count={highCount} total={totalIssues} color="bg-orange-500" />
            <IssueProgressBar label="中等问题" count={mediumCount} total={totalIssues} color="bg-yellow-500" />
            <IssueProgressBar label="轻微问题" count={lowCount} total={totalIssues} color="bg-blue-500" />
          </div>
        </CardContent>
      </Card>

      {/* 按严重程度分组显示 - 折叠面板 */}
      {Object.entries(severityConfig).map(([severity, config]) => {
        const issues = issuesBySeverity[severity as keyof typeof issuesBySeverity];
        const count = issues.length;
        const isExpanded = expandedTypes.has(severity);
        const Icon = config.icon;

        if (count === 0) return null;

        return (
          <Card key={severity} className={cn(
            "overflow-hidden",
            severity === 'critical' && "border-red-300",
            severity === 'high' && "border-orange-300",
            severity === 'medium' && "border-yellow-300",
            severity === 'low' && "border-blue-300"
          )}>
            {/* 标题栏 - 可点击展开 */}
            <button
              onClick={() => toggleType(severity)}
              className={cn(
                "w-full px-4 py-3 flex items-center justify-between border-b transition-colors",
                severity === 'critical' && "bg-red-50 border-red-200 hover:bg-red-100",
                severity === 'high' && "bg-orange-50 border-orange-200 hover:bg-orange-100",
                severity === 'medium' && "bg-yellow-50 border-yellow-200 hover:bg-yellow-100",
                severity === 'low' && "bg-blue-50 border-blue-200 hover:bg-blue-100"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn(
                  "h-5 w-5",
                  severity === 'critical' && "text-red-600",
                  severity === 'high' && "text-orange-600",
                  severity === 'medium' && "text-yellow-600",
                  severity === 'low' && "text-blue-600"
                )} />
                <div className="text-left">
                  <CardTitle className="text-base">{config.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{config.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={severity === 'critical' || severity === 'high' ? 'destructive' : 'secondary'} className="text-sm">
                  {count} 个
                </Badge>
                <div className={cn(
                  "ml-2 transition-transform",
                  isExpanded && "rotate-180"
                )}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 11L3 6h10l-5 5z"/>
                  </svg>
                </div>
              </div>
            </button>

            {/* 展开内容 */}
            {isExpanded && (
              <CardContent className="pt-4">
                <ValidationIssueList issues={issues} validationType="" />
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* 严重问题警告 */}
      {(criticalCount > 0 || highCount > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>发现 {criticalCount + highCount} 个严重问题</AlertTitle>
          <AlertDescription>
            <p className="text-sm">
              致命问题可能导致废标，高危问题会影响评分。请在导出前修复这些问题。
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * 问题项组件
 */
function IssueItem({ issue }: { issue: ValidationIssue & { validationType?: string } }) {
  const severityColors: Record<string, string> = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    low: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  const severityIcons: Record<string, typeof AlertTriangle> = {
    critical: AlertTriangle,
    high: AlertCircle,
    medium: Info,
    low: Info,
  };

  const validationTypeNames: Record<string, string> = {
    compliance: '合规校验',
    score_coverage: '评分覆盖校验',
    logic_consistency: '逻辑一致性校验',
    disqualification: '废标风险校验',
    citation: '引用校验',
  };

  // 问题类型中文名映射
  const issueTypeNames: Record<string, string> = {
    compliance: '合规性',
    coverage: '覆盖率',
    citation: '引用',
    risk_response: '风险响应',
    logic: '逻辑一致性',
    data: '数据一致性',
    timeline: '时间线',
    reference: '引用一致性',
  };

  const Icon = severityIcons[issue.severity] || Info;
  const colorClass = severityColors[issue.severity] || severityColors.medium;

  return (
    <div className={`p-3 rounded-lg border ${colorClass}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {issueTypeNames[issue.type] || issue.type}
            </Badge>
            {issue.validationType && (
              <span className="text-xs text-muted-foreground">
                {validationTypeNames[issue.validationType] || issue.validationType}
              </span>
            )}
          </div>
          <p className="text-sm">{issue.description}</p>
          {issue.location && (
            <p className="text-xs mt-1 text-muted-foreground">📍 位置: {issue.location}</p>
          )}
          {issue.suggestion && (
            <p className="text-xs mt-1 opacity-80">💡 {issue.suggestion}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// 问题类型
interface ValidationIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location?: string;
  suggestion?: string;
  relatedItemId?: string;
  relatedRiskId?: string;
}

/**
 * 问题进度条组件
 */
function IssueProgressBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{count} 个 ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all", color)} 
          style={{ width: `${percentage}%` }} 
        />
      </div>
    </div>
  );
}

/**
 * 详细报告 Tab
 */
function DetailedReportTab({ validationResult }: { validationResult: ValidationResult | null }) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (!validationResult) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>执行校验后查看详细报告</p>
      </div>
    );
  }

  const validationTypeNames: Record<string, string> = {
    compliance: '合规校验',
    score_coverage: '评分覆盖校验',
    logic_consistency: '逻辑一致性校验',
    disqualification: '废标风险校验',
    citation: '引用校验',
  };

  const validationTypeIcons: Record<string, typeof FileCheck> = {
    compliance: FileCheck,
    score_coverage: Target,
    logic_consistency: TrendingUp,
    disqualification: ShieldAlert,
    citation: Link2,
  };

  const results = validationResult.results || [];

  // 计算各校验类型统计
  const typeStats = {
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    total: results.length || 5,
  };

  // 计算总分
  const avgScore = results.length > 0 
    ? results.reduce((sum, r) => sum + r.score, 0) / results.length 
    : validationResult.overallScore;

  // 如果没有详细结果，显示概要信息
  if (results.length === 0) {
    return (
      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>详细报告</AlertTitle>
          <AlertDescription>
            <p className="mb-2">当前显示概要信息。点击"执行校验"按钮获取完整的分项校验报告。</p>
            <div className="mt-3 p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">已知数据：</p>
              <ul className="text-sm space-y-1">
                <li>• 综合得分：<strong>{validationResult.overallScore.toFixed(0)}分</strong></li>
                {validationResult.complianceScore !== undefined && (
                  <li>• 合规校验：<strong>{validationResult.complianceScore.toFixed(0)}分</strong></li>
                )}
                {validationResult.citationScore !== undefined && (
                  <li>• 引用校验：<strong>{validationResult.citationScore.toFixed(0)}分</strong></li>
                )}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 校验结果概览卡片 */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              校验结果概览
            </CardTitle>
            <Badge variant={validationResult.overallPassed ? 'default' : 'destructive'} className="text-sm px-3">
              {validationResult.overallPassed ? '✓ 通过' : '✗ 未通过'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* 综合得分 */}
            <div className={cn(
              "p-4 rounded-lg border text-center",
              validationResult.overallPassed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
            )}>
              <p className="text-sm text-muted-foreground mb-1">综合得分</p>
              <p className={cn(
                "text-3xl font-bold",
                validationResult.overallPassed ? "text-green-600" : "text-red-600"
              )}>
                {validationResult.overallScore.toFixed(0)}
              </p>
              <Progress value={validationResult.overallScore} className="h-2 mt-2" />
            </div>

            {/* 通过率 */}
            <div className="p-4 rounded-lg border bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground mb-1">通过率</p>
              <p className="text-3xl font-bold">
                {typeStats.total > 0 ? ((typeStats.passed / typeStats.total) * 100).toFixed(0) : 0}%
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge variant="default" className="bg-green-600">{typeStats.passed} 通过</Badge>
                <Badge variant="destructive">{typeStats.failed} 未通过</Badge>
              </div>
            </div>

            {/* 问题统计 */}
            <div className="p-4 rounded-lg border bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground mb-1">问题总数</p>
              <p className="text-3xl font-bold text-orange-600">
                {(validationResult.criticalIssues || 0) + 
                 (validationResult.highIssues || 0) + 
                 (validationResult.mediumIssues || 0) + 
                 (validationResult.lowIssues || 0)}
              </p>
              <div className="flex items-center justify-center gap-1 mt-2 flex-wrap">
                {(validationResult.criticalIssues || 0) > 0 && (
                  <Badge className="bg-red-100 text-red-700">{validationResult.criticalIssues} 致命</Badge>
                )}
                {(validationResult.highIssues || 0) > 0 && (
                  <Badge className="bg-orange-100 text-orange-700">{validationResult.highIssues} 高危</Badge>
                )}
              </div>
            </div>
          </div>

          {/* 各校验类型得分概览 */}
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(validationTypeNames).map(([type, name]) => {
              const result = results.find(r => r.validationType === type);
              const Icon = validationTypeIcons[type] || FileCheck;
              const score = result?.score || 0;
              const passed = result?.passed ?? true;
              const issueCount = result?.issues?.length || 0;
              
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={cn(
                    "p-3 rounded-lg border text-center transition-all hover:shadow-md cursor-pointer",
                    passed ? "border-green-200 bg-green-50 hover:bg-green-100" : "border-red-200 bg-red-50 hover:bg-red-100",
                    expandedTypes.has(type) && "ring-2 ring-primary"
                  )}
                >
                  <Icon className={cn("h-4 w-4 mx-auto mb-1", passed ? "text-green-600" : "text-red-600")} />
                  <p className="text-xs text-muted-foreground truncate">{name}</p>
                  <p className={cn(
                    "text-lg font-bold",
                    passed ? "text-green-600" : "text-red-600"
                  )}>
                    {score.toFixed(0)}
                  </p>
                  {issueCount > 0 && (
                    <Badge variant="destructive" className="text-xs mt-1">{issueCount}</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 各校验类型详细结果 - 使用折叠面板 */}
      {results.map((result, idx) => {
        const Icon = validationTypeIcons[result.validationType] || FileCheck;
        const typeName = validationTypeNames[result.validationType] || result.validationType;
        const isExpanded = expandedTypes.has(result.validationType);
        const issues = result.issues || [];
        
        // 统计各严重程度问题数
        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const highCount = issues.filter(i => i.severity === 'high').length;
        const mediumCount = issues.filter(i => i.severity === 'medium').length;
        const lowCount = issues.filter(i => i.severity === 'low').length;

        return (
          <Card key={idx} className={cn(
            "overflow-hidden transition-all",
            result.passed ? "border-green-200" : "border-red-200",
            isExpanded && "ring-2 ring-primary/50"
          )}>
            {/* 标题栏 - 可点击展开 */}
            <button
              onClick={() => toggleType(result.validationType)}
              className={cn(
                "w-full px-4 py-3 flex items-center justify-between border-b transition-colors",
                result.passed ? "bg-green-50 border-green-200 hover:bg-green-100" : "bg-red-50 border-red-200 hover:bg-red-100"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("h-5 w-5", result.passed ? "text-green-600" : "text-red-600")} />
                <div className="text-left">
                  <CardTitle className="text-base">{typeName}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {result.passed ? '校验通过' : `发现 ${issues.length} 个问题`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={cn(
                    "text-2xl font-bold",
                    result.passed ? "text-green-600" : "text-red-600"
                  )}>
                    {result.score.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">得分</p>
                </div>
                <Badge variant={result.passed ? 'default' : 'destructive'} className="text-sm">
                  {result.passed ? '通过' : '未通过'}
                </Badge>
                <div className={cn(
                  "ml-2 transition-transform",
                  isExpanded && "rotate-180"
                )}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 11L3 6h10l-5 5z"/>
                  </svg>
                </div>
              </div>
            </button>

            {/* 展开内容 */}
            {isExpanded && (
              <CardContent className="pt-4">
                {/* 问题统计 - 始终显示四格 */}
                <div className="mb-4 grid grid-cols-4 gap-2">
                  <div className="p-2 rounded bg-red-100 text-center">
                    <p className="text-lg font-bold text-red-700">{criticalCount}</p>
                    <p className="text-xs text-red-600">致命</p>
                  </div>
                  <div className="p-2 rounded bg-orange-100 text-center">
                    <p className="text-lg font-bold text-orange-700">{highCount}</p>
                    <p className="text-xs text-orange-600">高危</p>
                  </div>
                  <div className="p-2 rounded bg-yellow-100 text-center">
                    <p className="text-lg font-bold text-yellow-700">{mediumCount}</p>
                    <p className="text-xs text-yellow-600">中等</p>
                  </div>
                  <div className="p-2 rounded bg-blue-100 text-center">
                    <p className="text-lg font-bold text-blue-700">{lowCount}</p>
                    <p className="text-xs text-blue-600">轻微</p>
                  </div>
                </div>

                {/* 问题列表 - 使用紧凑列表 */}
                {issues.length > 0 ? (
                  <ValidationIssueList issues={issues} validationType={result.validationType} />
                ) : (
                  <div className="text-center py-6 text-green-600">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-2" />
                    <p className="font-medium">该项校验通过</p>
                    <p className="text-sm text-muted-foreground">未发现问题</p>
                  </div>
                )}

                {/* 详细数据 - 折叠显示 */}
                {result.details && Object.keys(result.details).length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      查看校验详情数据 ({Object.keys(result.details).length} 项)
                    </summary>
                    <div className="mt-2 p-3 bg-muted rounded-lg">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-[200px]">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </div>
                  </details>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* 校验统计汇总 */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              校验统计汇总
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-sm text-muted-foreground">校验项目</p>
                <p className="text-2xl font-bold">{results.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 text-center">
                <p className="text-sm text-green-600">通过项</p>
                <p className="text-2xl font-bold text-green-600">{typeStats.passed}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 text-center">
                <p className="text-sm text-red-600">未通过项</p>
                <p className="text-2xl font-bold text-red-600">{typeStats.failed}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-sm text-muted-foreground">平均得分</p>
                <p className="text-2xl font-bold">{avgScore.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * 校验问题列表 - 支持分页展示
 */
function ValidationIssueList({ issues, validationType }: { issues: ValidationIssue[]; validationType: string }) {
  const [showAll, setShowAll] = useState(false);
  const displayIssues = showAll ? issues : issues.slice(0, 5);
  const hasMore = issues.length > 5;

  return (
    <div className="space-y-2">
      {/* 问题列表 */}
      {displayIssues.map((issue, i) => (
        <div 
          key={i} 
          className={cn(
            "p-3 rounded-lg border text-sm",
            issue.severity === 'critical' && "bg-red-50 border-red-200 text-red-800",
            issue.severity === 'high' && "bg-orange-50 border-orange-200 text-orange-800",
            issue.severity === 'medium' && "bg-yellow-50 border-yellow-200 text-yellow-800",
            issue.severity === 'low' && "bg-blue-50 border-blue-200 text-blue-800"
          )}
        >
          <div className="flex items-start gap-2">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
              issue.severity === 'critical' && "bg-red-200 text-red-800",
              issue.severity === 'high' && "bg-orange-200 text-orange-800",
              issue.severity === 'medium' && "bg-yellow-200 text-yellow-800",
              issue.severity === 'low' && "bg-blue-200 text-blue-800"
            )}>
              {issue.severity === 'critical' ? '致命' : 
               issue.severity === 'high' ? '高危' : 
               issue.severity === 'medium' ? '中等' : '轻微'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="break-words">{issue.description}</p>
              {issue.suggestion && (
                <p className="mt-1 text-xs opacity-75">💡 {issue.suggestion}</p>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* 显示更多/收起按钮 */}
      {hasMore && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-muted-foreground"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? (
            <>
              <span>收起</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="ml-1">
                <path d="M6 4L10 8H2l4-4z"/>
              </svg>
            </>
          ) : (
            <>
              <span>显示全部 {issues.length} 个问题</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="ml-1">
                <path d="M6 8L2 4h8l-4 4z"/>
              </svg>
            </>
          )}
        </Button>
      )}
    </div>
  );
}

/**
 * 校验类型卡片
 */
function ValidationTypeCard({ title, score, passed }: { title: string; score: number; passed: boolean }) {
  return (
    <div className={cn(
      "p-4 rounded-lg border",
      passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{title}</span>
        {passed ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Progress value={score} className="h-2 flex-1" />
        <span className={cn(
          "text-sm font-semibold",
          passed ? "text-green-600" : "text-red-600"
        )}>
          {score.toFixed(0)}分
        </span>
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
