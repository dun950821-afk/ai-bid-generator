'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Calendar,
  Cpu,
  Briefcase,
  Target,
  AlertTriangle,
  FileCheck,
  Building,
  Info,
  RefreshCw,
} from 'lucide-react';

// 提取结果接口 - 与数据库表结构一致
interface ExtractionResult {
  id: string;
  project_id: string;
  status?: string;
  extraction_status?: string;
  
  // 1. 项目基本信息
  project_name?: string;
  project_number?: string;
  purchase_unit?: string;
  procuring_entity?: string;
  procurement_type?: string;
  procurement_method?: string;
  project_type?: string;
  budget_amount?: number;
  project_budget?: number;
  
  // 2. 时间节点
  bid_deadline?: string;
  bid_opening_time?: string;
  bid_opening_date?: string;
  bid_submission_deadline?: string;
  clarification_deadline?: string;
  question_deadline?: string;
  bid_validity_period?: number;
  
  // 3. 核心技术需求
  technical_requirements?: string | any[];
  core_tech_demand?: string | any[];
  
  // 4. 商务要求
  business_requirements?: string | any[];
  
  // 5. 评分标准
  scoring_standard?: any;
  evaluation_criteria?: {
    categories: Array<{
      id: string;
      category_name: string;
      weight: number;
      items: Array<{
        id: string;
        item_name: string;
        max_score: number;
        scoring_method: string;
        scoring_rules: Array<{ rule: string; score: number }>;
      }>;
    }>;
  };
  
  // 6. 废标风险
  disqualification_risks?: Array<{
    id: string;
    risk_type: string;
    risk_description: string;
    source_text?: string;
    severity: string;
  }>;
  
  // 7. 投标文件要求
  bid_document_requirements?: string | any[];
  bidding_document_requirements?: string | any[];
  
  // 8. 项目背景
  project_background?: string | any;
  
  // 9. 其他重要信息
  other_requirements?: string | any;
  other_important_info?: string | any;
  
  // 完整的LLM提取结果（新格式）
  full_extraction_result?: {
    projectBasicInfo?: any;
    project_basic_info?: any;
    timeSchedule?: any;
    time_schedule?: any;
    coreTechDemand?: any;
    core_tech_demand?: any;
    businessRequirements?: any;
    business_requirements?: any;
    scoringStandard?: {
      evaluationCriteria?: Array<{
        category: string;
        categoryType?: string;
        totalScore: number;
        items?: Array<{
          subItem: string;
          itemScore: number;
          rule?: string;
        }>;
      }>;
      evaluation_criteria?: any;
    };
    scoring_standard?: any;
    disqualificationRisks?: Array<{
      riskType?: string;
      description?: string;
      severity: string;
      sourceText?: string;
    }>;
    disqualification_risks?: any;
    biddingDocumentRequirements?: any;
    bidding_document_requirements?: any;
    projectBackground?: any;
    project_background?: any;
    otherImportantInfo?: any;
    other_important_info?: any;
  };
  
  // 摘要统计
  total_score?: number;
  item_count?: number;
  risk_count?: number;
  
  // 元数据
  extraction_metadata?: {
    extraction_time: string;
    document_name: string;
    model_used?: string;
    confidence_score?: number;
  };
  
  created_at: string;
  updated_at: string;
}

export default function ExtractionManagementPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // 状态
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('basic');

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-result`);
      const data = await res.json();
      
      if (data.success && data.data) {
        setExtractionResult(data.data);
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

  // 格式化金额
  const formatBudget = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  // 渲染列表内容
  const renderListContent = (content: string | any[] | undefined) => {
    if (!content) return <span className="text-muted-foreground">暂无信息</span>;
    
    if (typeof content === 'string') {
      // 尝试解析JSON
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return (
            <ul className="space-y-2">
              {parsed.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span>{typeof item === 'object' ? JSON.stringify(item) : item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <span>{content}</span>;
      } catch {
        // 按换行符分割
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
          return (
            <ul className="space-y-2">
              {lines.map((line, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <span>{content}</span>;
      }
    }
    
    if (Array.isArray(content)) {
      return (
        <ul className="space-y-2">
          {content.map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-primary mt-1.5">•</span>
              <span>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
            </li>
          ))}
        </ul>
      );
    }
    
    return <span className="text-muted-foreground">暂无信息</span>;
  };

  // 计算统计信息 - 从 full_extraction_result 获取数据
  const getStats = () => {
    const stats = {
      categories: 0,
      items: 0,
      risks: 0,
      criticalRisks: 0,
    };
    
    // 从 full_extraction_result 获取数据（新格式）
    const fullResult = extractionResult?.full_extraction_result || {};
    const scoringStandard = fullResult.scoringStandard || fullResult.scoring_standard || {};
    const evaluationCriteria = scoringStandard.evaluationCriteria || scoringStandard.evaluation_criteria || [];
    
    // 计算评分项数量
    if (Array.isArray(evaluationCriteria)) {
      stats.categories = evaluationCriteria.length;
      evaluationCriteria.forEach((cat: any) => {
        stats.items += cat.items?.length || 0;
      });
    }
    
    // 从 full_extraction_result 获取风险数据
    const risks = fullResult.disqualificationRisks || fullResult.disqualification_risks || [];
    if (Array.isArray(risks)) {
      stats.risks = risks.length;
      stats.criticalRisks = risks.filter(
        (r: any) => r.severity === 'critical' || r.severity === 'high'
      ).length;
    }
    
    return stats;
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <div className="h-12 w-full bg-muted animate-pulse rounded" />
        <div className="h-[600px] w-full bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!extractionResult) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">暂无提取结果</p>
            <Button onClick={() => router.push(`/projects/${projectId}`)}>
              返回项目上传文档
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">提取结果管理</h1>
          <p className="text-muted-foreground">
            {extractionResult.project_name || '招标文档提取结果'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
          <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
            返回项目
          </Button>
        </div>
      </div>

      {/* 统计概览 */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">评分大类</p>
                <p className="text-2xl font-bold">{stats.categories}</p>
              </div>
              <Target className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">评分细项</p>
                <p className="text-2xl font-bold">{stats.items}</p>
              </div>
              <Target className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">废标风险</p>
                <p className="text-2xl font-bold">{stats.risks}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">高风险项</p>
                <p className="text-2xl font-bold text-red-500">{stats.criticalRisks}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 主内容区域 - 9项提取信息 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            <TabsTrigger value="basic">
              <FileText className="h-4 w-4 mr-2" />
              基本信息
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <Calendar className="h-4 w-4 mr-2" />
              时间节点
            </TabsTrigger>
            <TabsTrigger value="technical">
              <Cpu className="h-4 w-4 mr-2" />
              技术需求
            </TabsTrigger>
            <TabsTrigger value="business">
              <Briefcase className="h-4 w-4 mr-2" />
              商务要求
            </TabsTrigger>
            <TabsTrigger value="scoring">
              <Target className="h-4 w-4 mr-2" />
              评分标准
            </TabsTrigger>
            <TabsTrigger value="risks">
              <AlertTriangle className="h-4 w-4 mr-2" />
              废标风险
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileCheck className="h-4 w-4 mr-2" />
              文件要求
            </TabsTrigger>
            <TabsTrigger value="background">
              <Building className="h-4 w-4 mr-2" />
              项目背景
            </TabsTrigger>
            <TabsTrigger value="other">
              <Info className="h-4 w-4 mr-2" />
              其他信息
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        {/* 1. 项目基本信息 */}
        <TabsContent value="basic" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>项目基本信息</CardTitle>
              <CardDescription>招标项目的基础资料</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const fullResult = extractionResult?.full_extraction_result || {};
                const basicInfo = fullResult.projectBasicInfo || fullResult.project_basic_info || {};
                // 合并数据库顶级字段和 full_extraction_result 中的数据
                const projectName = extractionResult.project_name || basicInfo.projectName || basicInfo.project_name || '-';
                const projectNumber = extractionResult.project_number || basicInfo.projectNumber || basicInfo.project_number || '-';
                const purchaseUnit = extractionResult.purchase_unit || basicInfo.purchaseUnit || basicInfo.purchase_unit || '-';
                const projectType = extractionResult.project_type || basicInfo.projectType || basicInfo.project_type || '未指定';
                const budget = extractionResult.project_budget || basicInfo.projectBudget || basicInfo.project_budget || extractionResult.budget_amount;
                
                return (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">项目名称</label>
                        <p className="mt-1 font-medium">{projectName}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">项目编号</label>
                        <p className="mt-1">{projectNumber}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">采购单位</label>
                        <p className="mt-1">{purchaseUnit}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">采购方式</label>
                        <p className="mt-1">
                          <Badge variant="outline">{projectType}</Badge>
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">预算金额</label>
                        <p className="mt-1 text-lg font-semibold text-green-600">
                          {formatBudget(budget)}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">提取状态</label>
                        <p className="mt-1">
                          <Badge variant={extractionResult.status === 'completed' ? 'default' : 'secondary'}>
                            {extractionResult.status === 'completed' ? '已完成' : '处理中'}
                          </Badge>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. 时间节点 */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>时间节点</CardTitle>
              <CardDescription>招标项目的重要时间安排</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const fullResult = extractionResult?.full_extraction_result || {};
                const timeSchedule = fullResult.timeSchedule || fullResult.time_schedule || {};
                // 合并数据库顶级字段和 full_extraction_result 中的数据
                const bidDeadline = extractionResult.bid_submission_deadline || timeSchedule.bidSubmissionDeadline || timeSchedule.bid_submission_deadline;
                const bidOpening = extractionResult.bid_opening_date || timeSchedule.bidOpeningDate || timeSchedule.bid_opening_date;
                const questionDeadline = extractionResult.question_deadline || timeSchedule.questionDeadline || timeSchedule.question_deadline;
                const bidValidity = extractionResult.bid_validity_period || timeSchedule.bidValidityPeriod || timeSchedule.bid_validity_period;
                
                return (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg">
                        <label className="text-sm font-medium text-muted-foreground">投标截止时间</label>
                        <p className="mt-1 font-medium text-lg">{formatDate(bidDeadline)}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <label className="text-sm font-medium text-muted-foreground">开标时间</label>
                        <p className="mt-1 font-medium text-lg">{formatDate(bidOpening)}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg">
                        <label className="text-sm font-medium text-muted-foreground">答疑截止时间</label>
                        <p className="mt-1 font-medium text-lg">{formatDate(questionDeadline)}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <label className="text-sm font-medium text-muted-foreground">投标有效期</label>
                        <p className="mt-1 font-medium text-lg">
                          {bidValidity ? `${bidValidity} 天` : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. 核心技术需求 */}
        <TabsContent value="technical" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>核心技术需求</CardTitle>
              <CardDescription>技术规格、参数和性能要求</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                {renderListContent(
                  (extractionResult?.full_extraction_result?.coreTechDemand || 
                   extractionResult?.full_extraction_result?.core_tech_demand ||
                   extractionResult?.core_tech_demand)
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. 商务要求 */}
        <TabsContent value="business" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>商务要求</CardTitle>
              <CardDescription>资质要求、商务条款等</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                {renderListContent(
                  (extractionResult?.full_extraction_result?.businessRequirements || 
                   extractionResult?.full_extraction_result?.business_requirements ||
                   extractionResult?.business_requirements)
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. 评分标准 */}
        <TabsContent value="scoring" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>评分标准</CardTitle>
              <CardDescription>
                {(() => {
                  const fullResult = extractionResult?.full_extraction_result || {};
                  const scoringStandard = fullResult.scoringStandard || fullResult.scoring_standard || {};
                  const evaluationCriteria = scoringStandard.evaluationCriteria || scoringStandard.evaluation_criteria || [];
                  const totalItems = evaluationCriteria.reduce((sum: number, cat: any) => sum + (cat.items?.length || 0), 0);
                  return `${evaluationCriteria.length} 个评分大类，共 ${totalItems} 个评分细项`;
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const fullResult = extractionResult?.full_extraction_result || {};
                const scoringStandard = fullResult.scoringStandard || fullResult.scoring_standard || {};
                const evaluationCriteria = scoringStandard.evaluationCriteria || scoringStandard.evaluation_criteria || [];
                
                if (evaluationCriteria && evaluationCriteria.length > 0) {
                  return (
                    <div className="space-y-6">
                      {evaluationCriteria.map((category: any, idx: number) => (
                        <div key={category.id || idx} className="border rounded-lg overflow-hidden">
                          <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                            <div>
                              <h3 className="font-semibold">{category.category}</h3>
                              <p className="text-sm text-muted-foreground">
                                类型: {category.categoryType === 'technical' ? '技术' : 
                                       category.categoryType === 'business' ? '商务' : 
                                       category.categoryType === 'price' ? '价格' : '其他'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{category.items?.length || 0} 项</Badge>
                              <Badge variant="destructive">{category.totalScore} 分</Badge>
                            </div>
                          </div>
                          <div className="p-4 space-y-3">
                            {category.items?.map((item: any, itemIdx: number) => (
                              <div 
                                key={item.id || itemIdx} 
                                className="flex items-start justify-between p-3 bg-muted/30 rounded"
                              >
                                <div className="flex-1">
                                  <p className="font-medium">{item.subItem}</p>
                                  {item.rule && (
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                      {item.rule}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <span className="text-lg font-bold text-primary">
                                    {item.itemScore}
                                  </span>
                                  <span className="text-sm text-muted-foreground"> 分</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
                
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无评分标准信息
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. 废标风险 */}
        <TabsContent value="risks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>废标风险</CardTitle>
              <CardDescription>
                {(() => {
                  const fullResult = extractionResult?.full_extraction_result || {};
                  const risks = fullResult.disqualificationRisks || fullResult.disqualification_risks || [];
                  const criticalCount = risks.filter((r: any) => r.severity === 'critical' || r.severity === 'high').length;
                  return `共 ${risks.length} 项风险，其中 ${criticalCount} 项高风险`;
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const fullResult = extractionResult?.full_extraction_result || {};
                const risks = fullResult.disqualificationRisks || fullResult.disqualification_risks || [];
                
                if (risks && risks.length > 0) {
                  return (
                    <div className="space-y-3">
                      {risks
                        .sort((a: any, b: any) => {
                          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                          return (order[a.severity] || 4) - (order[b.severity] || 4);
                        })
                        .map((risk: any, idx: number) => (
                          <div 
                            key={risk.id || idx}
                            className={`p-4 border rounded-lg ${
                              risk.severity === 'critical' ? 'border-red-500/50 bg-red-50/10' :
                              risk.severity === 'high' ? 'border-orange-500/50 bg-orange-50/10' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Badge 
                                variant={
                                  risk.severity === 'critical' ? 'destructive' :
                                  risk.severity === 'high' ? 'default' : 'secondary'
                                }
                              >
                                {risk.severity === 'critical' ? '严重' :
                                 risk.severity === 'high' ? '高' : 
                                 risk.severity === 'medium' ? '中' : '低'}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{risk.riskType || risk.risk_type}</span>
                            </div>
                            <p className="text-sm">{risk.description || risk.riskDescription || risk.risk_description}</p>
                            {(risk.sourceText || risk.source_text) && (
                              <p className="text-xs text-muted-foreground mt-2 border-l-2 pl-2">
                                原文: {risk.sourceText || risk.source_text}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  );
                }
                
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>暂无废标风险信息</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 7. 投标文件要求 */}
        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>投标文件要求</CardTitle>
              <CardDescription>投标文件的格式、内容、份数等要求</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                {renderListContent(
                  (extractionResult?.full_extraction_result?.biddingDocumentRequirements || 
                   extractionResult?.full_extraction_result?.bidding_document_requirements ||
                   extractionResult?.bidding_document_requirements)
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 8. 项目背景 */}
        <TabsContent value="background" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>项目背景</CardTitle>
              <CardDescription>项目的背景、目的、实施内容等</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                {(() => {
                  const bg = extractionResult?.full_extraction_result?.projectBackground || 
                             extractionResult?.full_extraction_result?.project_background ||
                             extractionResult?.project_background;
                  if (!bg) return <span className="text-muted-foreground">暂无项目背景信息</span>;
                  return typeof bg === 'object' 
                    ? renderListContent(bg as any)
                    : <p className="whitespace-pre-wrap">{bg}</p>;
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 9. 其他重要信息 */}
        <TabsContent value="other" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>其他重要信息</CardTitle>
              <CardDescription>其他需要关注的重要事项</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                {(() => {
                  const other = extractionResult?.full_extraction_result?.otherImportantInfo || 
                                extractionResult?.full_extraction_result?.other_important_info ||
                                extractionResult?.other_important_info ||
                                extractionResult?.other_requirements;
                  if (!other) return <span className="text-muted-foreground">暂无其他重要信息</span>;
                  return typeof other === 'object' 
                    ? renderListContent(other as any)
                    : <p className="whitespace-pre-wrap">{other}</p>;
                })()}
              </div>
            </CardContent>
          </Card>
          
          {/* 提取元数据 */}
          {extractionResult.extraction_metadata && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">提取元数据</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">提取时间</span>
                    <p className="font-medium">
                      {formatDate(extractionResult.extraction_metadata.extraction_time)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">源文档</span>
                    <p className="font-medium truncate">
                      {extractionResult.extraction_metadata.document_name || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">使用模型</span>
                    <p className="font-medium">
                      {extractionResult.extraction_metadata.model_used || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">置信度</span>
                    <p className="font-medium">
                      {extractionResult.extraction_metadata.confidence_score 
                        ? `${(extractionResult.extraction_metadata.confidence_score * 100).toFixed(1)}%`
                        : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
