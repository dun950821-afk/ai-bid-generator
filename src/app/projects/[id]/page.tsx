'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  Download,
  Upload,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  project_number: string;
  status: string;
  knowledge_base_id: string;
  metadata: {
    outline?: any;
    sectionContents?: Record<string, any>;
    validationReport?: any;
  };
  created_at: string;
}

interface ScoringItem {
  id: string;
  item_name: string;
  item_type: string;
  max_score: number;
  scoring_rules: Array<{ rule: string; score?: number }>;
  response_status: string;
  response_quality?: string;
}

interface Risk {
  id: string;
  risk_type: string;
  risk_description: string;
  severity: string;
  response_status: string;
  source_text?: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [scoringItems, setScoringItems] = useState<ScoringItem[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [validating, setValidating] = useState(false);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [documentText, setDocumentText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'html'>('markdown');

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
    try {
      const [projectRes, scoringRes, risksRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/scoring-items`),
        fetch(`/api/projects/${projectId}/risks`),
      ]);

      const projectData = await projectRes.json();
      const scoringData = await scoringRes.json();
      const risksData = await risksRes.json();

      if (projectData.success) {
        setProject(projectData.data);
      }
      if (scoringData.success) {
        setScoringItems(scoringData.data.items);
        setSummary(scoringData.data.summary);
      }
      if (risksData.success) {
        setRisks(risksData.data.risks);
      }
    } catch (error) {
      console.error('获取项目数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExtract = async () => {
    if (!documentText.trim()) return;

    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText,
          documentName: '招标文档',
          extractionType: 'full',
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
        setExtractDialogOpen(false);
        setDocumentText('');
      }
    } catch (error) {
      console.error('提取失败:', error);
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateOutline = async () => {
    setGeneratingOutline(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
      }
    } catch (error) {
      console.error('生成大纲失败:', error);
    } finally {
      setGeneratingOutline(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/validate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
      }
    } catch (error) {
      console.error('校验失败:', error);
    } finally {
      setValidating(false);
    }
  };

  const handleExport = async (format: 'markdown' | 'html') => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      if (data.success) {
        // 创建下载
        const blob = new Blob([data.data.content], {
          type: format === 'markdown' ? 'text/markdown' : 'text/html',
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.data.fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      draft: { label: '草稿', color: 'bg-gray-100 text-gray-700' },
      processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
      completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
      submitted: { label: '已提交', color: 'bg-purple-100 text-purple-700' },
    };
    const s = statusMap[status] || statusMap.draft;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>
        {s.label}
      </span>
    );
  };

  const getSeverityBadge = (severity: string) => {
    const severityMap: Record<string, { label: string; color: string }> = {
      critical: { label: '致命', color: 'bg-red-100 text-red-700' },
      high: { label: '高', color: 'bg-orange-100 text-orange-700' },
      medium: { label: '中', color: 'bg-yellow-100 text-yellow-700' },
      low: { label: '低', color: 'bg-gray-100 text-gray-700' },
    };
    const s = severityMap[severity] || severityMap.medium;
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
        {s.label}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, { label: string; color: string }> = {
      technical: { label: '技术', color: 'bg-blue-50 text-blue-700' },
      business: { label: '商务', color: 'bg-green-50 text-green-700' },
      price: { label: '价格', color: 'bg-orange-50 text-orange-700' },
    };
    const t = typeMap[type] || typeMap.technical;
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.color}`}>
        {t.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">项目不存在</div>
      </div>
    );
  }

  const outline = project.metadata?.outline;
  const validationReport = project.metadata?.validationReport;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{project.name}</h1>
                  {getStatusBadge(project.status)}
                </div>
                <p className="text-sm text-gray-500">
                  {project.project_number && `编号: ${project.project_number}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setExtractDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                上传招标文档
              </Button>
              <Button
                onClick={handleGenerateOutline}
                disabled={generatingOutline || scoringItems.length === 0}
              >
                {generatingOutline ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                生成大纲
              </Button>
              <Button
                variant="secondary"
                onClick={handleValidate}
                disabled={validating || !outline}
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                校验内容
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('markdown')}
                disabled={exporting || !outline}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                导出MD
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('html')}
                disabled={exporting || !outline}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                导出HTML
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">总分</p>
                  <p className="text-2xl font-bold">{summary.totalScore || 0}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">评分项</p>
                  <p className="text-2xl font-bold">{summary.itemCount || 0}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">废标风险</p>
                  <p className="text-2xl font-bold">{risks.length}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">校验得分</p>
                  <p className="text-2xl font-bold">
                    {validationReport ? Math.round(validationReport.overallScore) : '-'}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 标签页 */}
        <Tabs defaultValue="scoring" className="space-y-4">
          <TabsList>
            <TabsTrigger value="scoring">评分项</TabsTrigger>
            <TabsTrigger value="risks">废标风险</TabsTrigger>
            <TabsTrigger value="outline">标书大纲</TabsTrigger>
            <TabsTrigger value="validation">校验报告</TabsTrigger>
          </TabsList>

          {/* 评分项 */}
          <TabsContent value="scoring">
            <Card>
              <CardHeader>
                <CardTitle>评分项列表</CardTitle>
                <CardDescription>
                  技术评分: {summary.technicalScore}分 ({summary.technicalItemCount}项) · 
                  商务评分: {summary.businessScore}分 ({summary.businessItemCount}项) · 
                  价格评分: {summary.priceScore}分 ({summary.priceItemCount}项)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scoringItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>暂无评分项，请上传招标文档并提取</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scoringItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {getTypeBadge(item.item_type)}
                            <span className="font-medium">{item.item_name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                            <span>满分: {item.max_score}分</span>
                            {item.scoring_rules && item.scoring_rules.length > 0 && (
                              <span>· {item.scoring_rules.length}条细则</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 废标风险 */}
          <TabsContent value="risks">
            <Card>
              <CardHeader>
                <CardTitle>废标风险列表</CardTitle>
                <CardDescription>
                  按严重程度排列，请确保所有风险项都已响应
                </CardDescription>
              </CardHeader>
              <CardContent>
                {risks.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>暂无废标风险</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {risks.map((risk) => (
                      <div
                        key={risk.id}
                        className="p-3 rounded-lg border border-gray-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getSeverityBadge(risk.severity)}
                            <span className="text-sm text-gray-500">{risk.risk_type}</span>
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              risk.response_status === 'verified'
                                ? 'bg-green-100 text-green-700'
                                : risk.response_status === 'responded'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {risk.response_status === 'verified'
                              ? '已验证'
                              : risk.response_status === 'responded'
                              ? '已响应'
                              : '未响应'}
                          </span>
                        </div>
                        <p className="text-sm">{risk.risk_description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 标书大纲 */}
          <TabsContent value="outline">
            <Card>
              <CardHeader>
                <CardTitle>标书大纲</CardTitle>
                <CardDescription>
                  基于评分项自动生成，确保100%覆盖
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!outline ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>暂无大纲，请先生成</p>
                    <Button
                      className="mt-4"
                      onClick={handleGenerateOutline}
                      disabled={generatingOutline || scoringItems.length === 0}
                    >
                      {generatingOutline ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      生成大纲
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {outline.sections?.map((section: any) => (
                      <div
                        key={section.id}
                        className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{section.title}</span>
                            {section.isRequired && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                                必需
                              </span>
                            )}
                          </div>
                          <span className="text-sm text-gray-500">
                            {section.scoringItemIds?.length || 0} 个评分项
                          </span>
                        </div>
                        {section.children && section.children.length > 0 && (
                          <div className="mt-2 pl-4 space-y-1">
                            {section.children.map((child: any) => (
                              <div
                                key={child.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-gray-600">{child.title}</span>
                                <span className="text-gray-400">
                                  {child.scoringItemIds?.length || 0} 项
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 校验报告 */}
          <TabsContent value="validation">
            <Card>
              <CardHeader>
                <CardTitle>校验报告</CardTitle>
                <CardDescription>多维度内容质量检查</CardDescription>
              </CardHeader>
              <CardContent>
                {!validationReport ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>暂无校验结果，请先生成内容并校验</p>
                    <Button
                      className="mt-4"
                      onClick={handleValidate}
                      disabled={validating || !outline}
                    >
                      {validating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      执行校验
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 总体得分 */}
                    <div className="p-4 rounded-lg bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">总体得分</span>
                        <span className="text-2xl font-bold">
                          {Math.round(validationReport.overallScore)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            validationReport.overallScore >= 80
                              ? 'bg-green-500'
                              : validationReport.overallScore >= 60
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${validationReport.overallScore}%` }}
                        />
                      </div>
                    </div>

                    {/* 问题统计 */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-red-50">
                        <p className="text-2xl font-bold text-red-600">
                          {validationReport.criticalIssues}
                        </p>
                        <p className="text-xs text-red-600">致命问题</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-orange-50">
                        <p className="text-2xl font-bold text-orange-600">
                          {validationReport.highIssues}
                        </p>
                        <p className="text-xs text-orange-600">高风险</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-yellow-50">
                        <p className="text-2xl font-bold text-yellow-600">
                          {validationReport.mediumIssues}
                        </p>
                        <p className="text-xs text-yellow-600">中等</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-gray-50">
                        <p className="text-2xl font-bold text-gray-600">
                          {validationReport.lowIssues}
                        </p>
                        <p className="text-xs text-gray-600">低风险</p>
                      </div>
                    </div>

                    {/* 建议 */}
                    {validationReport.suggestions?.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">改进建议</h4>
                        <ul className="space-y-1">
                          {validationReport.suggestions.map((s: string, i: number) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                              <span className="text-blue-500">•</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* 提取对话框 */}
      <Dialog open={extractDialogOpen} onOpenChange={setExtractDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>上传招标文档内容</DialogTitle>
            <DialogDescription>
              粘贴招标文档的文本内容，系统将自动提取评分项和废标风险
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="请粘贴招标文档内容..."
              className="min-h-[300px]"
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtractDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleExtract} disabled={extracting || !documentText.trim()}>
              {extracting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              开始提取
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
