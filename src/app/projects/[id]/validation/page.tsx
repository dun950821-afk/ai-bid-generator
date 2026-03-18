'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
  RefreshCw,
  FileCheck,
  TrendingUp,
  ShieldAlert,
  Target,
  Link2,
  BarChart3,
  ArrowLeft,
} from 'lucide-react';

interface ValidationIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location?: string;
  suggestion?: string;
  relatedItemId?: string;
  relatedRiskId?: string;
}

interface ValidationResult {
  validationType: string;
  passed: boolean;
  score: number;
  issues: ValidationIssue[];
  details: Record<string, any>;
}

interface ValidationReport {
  projectId: string;
  overallScore: number;
  overallPassed: boolean;
  results: ValidationResult[];
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  criticalIssuesList: ValidationIssue[];
  suggestions: string[];
}

interface CoverageReport {
  coverageRate: number;
  coverageByType: Record<string, { total: number; covered: number; rate: number }>;
  uncoveredItems: any[];
  partialItems: any[];
  fullyCoveredItems: any[];
  recommendations: string[];
}

const VALIDATION_TYPE_NAMES: Record<string, string> = {
  compliance: '合规校验',
  score_coverage: '评分覆盖校验',
  logic_consistency: '逻辑一致性校验',
  disqualification: '废标风险校验',
  citation: '引用校验',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const SEVERITY_ICONS: Record<string, any> = {
  critical: AlertTriangle,
  high: AlertCircle,
  medium: Info,
  low: Info,
};

export default function ValidationReportPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [report, setReport] = useState<ValidationReport | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 获取评分项覆盖报告
      const coverageRes = await fetch(`/api/projects/${projectId}/scoring-items?coverage=true`);
      const coverageData = await coverageRes.json();
      
      if (coverageData.success) {
        setCoverage(coverageData.data.coverage);
      }

      // 获取最新校验报告
      const validationRes = await fetch(`/api/projects/${projectId}/validation?latest=true`);
      const validationData = await validationRes.json();

      if (validationData.success && validationData.data.results?.length > 0) {
        // 从数据库结果构建报告
        const results = validationData.data.results;
        const summary = validationData.data.summary;
        
        setReport({
          projectId,
          overallScore: summary.overallScore,
          overallPassed: summary.overallPassed,
          results: results.map((r: any) => ({
            validationType: r.validation_type,
            passed: r.passed,
            score: r.score,
            issues: r.issues || [],
            details: r.details || {},
          })),
          totalIssues: summary.criticalIssues + summary.highIssues + summary.mediumIssues + summary.lowIssues,
          criticalIssues: summary.criticalIssues,
          highIssues: summary.highIssues,
          mediumIssues: summary.mediumIssues,
          lowIssues: summary.lowIssues,
          criticalIssuesList: [],
          suggestions: [],
        });
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 执行校验
  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: ['compliance', 'score_coverage', 'logic_consistency', 'disqualification', 'citation'] }),
      });

      const data = await res.json();
      if (data.success) {
        setReport(data.data.report);
        // 刷新覆盖报告
        loadData();
      }
    } catch (error) {
      console.error('校验失败:', error);
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回项目
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">内容校验报告</h1>
            <p className="text-muted-foreground">多维度校验标书内容质量</p>
          </div>
        </div>
        <Button onClick={handleValidate} disabled={validating}>
          {validating ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              校验中...
            </>
          ) : (
            <>
              <FileCheck className="h-4 w-4 mr-2" />
              执行校验
            </>
          )}
        </Button>
      </div>

      {/* 概览卡片 */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">综合得分</p>
                <p className="text-2xl font-bold">{report?.overallScore?.toFixed(0) || '-'}分</p>
              </div>
              <TrendingUp className={`h-8 w-8 ${report?.overallPassed ? 'text-green-500' : 'text-red-500'}`} />
            </div>
            <Progress value={report?.overallScore || 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">评分覆盖</p>
                <p className="text-2xl font-bold">{coverage?.coverageRate?.toFixed(0) || '-'}%</p>
              </div>
              <Target className="h-8 w-8 text-blue-500" />
            </div>
            <Progress value={coverage?.coverageRate || 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">问题总数</p>
                <p className="text-2xl font-bold">{report?.totalIssues || 0}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500" />
            </div>
            <div className="flex gap-1 mt-2">
              {report?.criticalIssues! > 0 && (
                <Badge className="bg-red-100 text-red-700">{report?.criticalIssues} 致命</Badge>
              )}
              {report?.highIssues! > 0 && (
                <Badge className="bg-orange-100 text-orange-700">{report?.highIssues} 高危</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">校验状态</p>
                <p className={`text-lg font-semibold ${report?.overallPassed ? 'text-green-600' : 'text-red-600'}`}>
                  {report?.overallPassed ? '✓ 通过' : '✗ 未通过'}
                </p>
              </div>
              {report?.overallPassed ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <ShieldAlert className="h-8 w-8 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 校验结果详情 */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="coverage">评分覆盖</TabsTrigger>
          <TabsTrigger value="issues">问题列表</TabsTrigger>
          <TabsTrigger value="details">详细报告</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {report?.results.map((result, idx) => (
              <ValidationResultCard key={idx} result={result} />
            ))}
          </div>

          {/* 建议列表 */}
          {coverage?.recommendations && coverage.recommendations.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">优化建议</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {coverage.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="coverage" className="mt-4">
          <CoverageReportView coverage={coverage} />
        </TabsContent>

        <TabsContent value="issues" className="mt-4">
          <IssuesListView report={report} />
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <DetailedReportView report={report} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * 校验结果卡片
 */
function ValidationResultCard({ result }: { result: ValidationResult }) {
  const Icon = result.passed ? CheckCircle2 : AlertCircle;
  const iconColor = result.passed ? 'text-green-500' : 'text-red-500';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {VALIDATION_TYPE_NAMES[result.validationType] || result.validationType}
          </CardTitle>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">得分</span>
            <span className="font-semibold">{result.score.toFixed(0)}分</span>
          </div>
          <Progress value={result.score} className="h-2" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">问题数</span>
            <Badge variant={result.issues.length > 0 ? 'destructive' : 'secondary'}>
              {result.issues.length}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 覆盖报告视图
 */
function CoverageReportView({ coverage }: { coverage: CoverageReport | null }) {
  if (!coverage) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            请先执行校验获取覆盖报告
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 按类型统计 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">评分项覆盖情况</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>总数</TableHead>
                <TableHead>已覆盖</TableHead>
                <TableHead>覆盖率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(coverage.coverageByType).map(([type, data]) => (
                <TableRow key={type}>
                  <TableCell className="font-medium">
                    {type === 'technical' ? '技术评分' : 
                     type === 'business' ? '商务评分' : 
                     type === 'price' ? '价格评分' : type}
                  </TableCell>
                  <TableCell>{data.total}</TableCell>
                  <TableCell>{data.covered}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={data.rate} className="h-2 w-20" />
                      <span>{data.rate.toFixed(0)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 未覆盖项 */}
      {coverage.uncoveredItems.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base text-red-700">
              ⚠️ 未覆盖的评分项
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>评分项</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>分值</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.uncoveredItems.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.item_type === 'technical' ? '技术' : 
                         item.item_type === 'business' ? '商务' : '价格'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-red-600 font-semibold">{item.max_score}分</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 部分覆盖项 */}
      {coverage.partialItems.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader>
            <CardTitle className="text-base text-yellow-700">
              ⚡ 响应不完整的评分项
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>评分项</TableHead>
                  <TableHead>覆盖度</TableHead>
                  <TableHead>缺失内容</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.partialItems.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell>
                      <Progress value={item.coverageScore} className="h-2 w-20" />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.missingAspects?.join('、') || '部分细则未响应'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * 问题列表视图
 */
function IssuesListView({ report }: { report: ValidationReport | null }) {
  if (!report) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            请先执行校验获取问题列表
          </div>
        </CardContent>
      </Card>
    );
  }

  const allIssues = report.results.flatMap(r => 
    r.issues.map(issue => ({ ...issue, validationType: r.validationType }))
  );

  const criticalAndHigh = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high');
  const mediumAndLow = allIssues.filter(i => i.severity === 'medium' || i.severity === 'low');

  return (
    <div className="space-y-4">
      {/* 致命和高危问题 */}
      {criticalAndHigh.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>发现 {criticalAndHigh.length} 个严重问题</AlertTitle>
          <AlertDescription>
            <ScrollArea className="h-[300px] mt-2">
              <div className="space-y-2">
                {criticalAndHigh.map((issue, idx) => (
                  <IssueItem key={idx} issue={issue} />
                ))}
              </div>
            </ScrollArea>
          </AlertDescription>
        </Alert>
      )}

      {/* 中低问题 */}
      {mediumAndLow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">一般问题</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {mediumAndLow.map((issue, idx) => (
                  <IssueItem key={idx} issue={issue} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {allIssues.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-green-600">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg font-semibold">暂无问题</p>
              <p className="text-muted-foreground mt-2">所有校验项均已通过</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * 问题项组件
 */
function IssueItem({ issue }: { issue: ValidationIssue & { validationType?: string } }) {
  const Icon = SEVERITY_ICONS[issue.severity] || Info;

  return (
    <div className={`p-3 rounded-lg border ${SEVERITY_COLORS[issue.severity]}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs">
              {issue.type}
            </Badge>
            {issue.validationType && (
              <span className="text-xs text-muted-foreground">
                {VALIDATION_TYPE_NAMES[issue.validationType]}
              </span>
            )}
          </div>
          <p className="text-sm">{issue.description}</p>
          {issue.suggestion && (
            <p className="text-xs mt-1 opacity-80">💡 {issue.suggestion}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 详细报告视图
 */
function DetailedReportView({ report }: { report: ValidationReport | null }) {
  if (!report) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            请先执行校验获取详细报告
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {report.results.map((result, idx) => (
        <Card key={idx}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {VALIDATION_TYPE_NAMES[result.validationType] || result.validationType}
              </CardTitle>
              <Badge variant={result.passed ? 'default' : 'destructive'}>
                {result.passed ? '通过' : '未通过'} - {result.score.toFixed(0)}分
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {result.issues.length > 0 ? (
              <div className="space-y-2">
                {result.issues.map((issue, i) => (
                  <IssueItem key={i} issue={issue} />
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-green-600">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
                <p>该项校验通过</p>
              </div>
            )}

            {/* 详细数据 */}
            {Object.keys(result.details).length > 0 && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">校验详情</p>
                <pre className="text-xs text-muted-foreground overflow-auto">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
