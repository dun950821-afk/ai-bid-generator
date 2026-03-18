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

// 提取结果接口
interface ExtractionResult {
  id: string;
  project_id: string;
  extraction_status: string;
  
  // 1. 项目基本信息
  project_name?: string;
  project_number?: string;
  procuring_entity?: string;
  procurement_type?: string;
  budget_amount?: number;
  
  // 2. 时间节点
  bid_deadline?: string;
  bid_opening_time?: string;
  clarification_deadline?: string;
  bid_validity_period?: number;
  
  // 3. 核心技术需求
  technical_requirements?: string | any[];
  
  // 4. 商务要求
  business_requirements?: string | any[];
  
  // 5. 评分标准（新结构）
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
  
  // 8. 项目背景
  project_background?: string | any;
  
  // 9. 其他重要信息
  other_requirements?: string | any;
  
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

  // 计算统计信息
  const getStats = () => {
    const stats = {
      categories: 0,
      items: 0,
      risks: 0,
      criticalRisks: 0,
    };
    
    if (extractionResult?.evaluation_criteria?.categories) {
      stats.categories = extractionResult.evaluation_criteria.categories.length;
      extractionResult.evaluation_criteria.categories.forEach(cat => {
        stats.items += cat.items?.length || 0;
      });
    }
    
    if (extractionResult?.disqualification_risks) {
      stats.risks = extractionResult.disqualification_risks.length;
      stats.criticalRisks = extractionResult.disqualification_risks.filter(
        r => r.severity === 'critical' || r.severity === 'high'
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
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">项目名称</label>
                    <p className="mt-1 font-medium">{extractionResult.project_name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">项目编号</label>
                    <p className="mt-1">{extractionResult.project_number || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">采购人</label>
                    <p className="mt-1">{extractionResult.procuring_entity || '-'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">采购方式</label>
                    <p className="mt-1">
                      <Badge variant="outline">{extractionResult.procurement_type || '未指定'}</Badge>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">预算金额</label>
                    <p className="mt-1 text-lg font-semibold text-green-600">
                      {formatBudget(extractionResult.budget_amount)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">提取状态</label>
                    <p className="mt-1">
                      <Badge variant={extractionResult.extraction_status === 'completed' ? 'default' : 'secondary'}>
                        {extractionResult.extraction_status === 'completed' ? '已完成' : '处理中'}
                      </Badge>
                    </p>
                  </div>
                </div>
              </div>
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
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <label className="text-sm font-medium text-muted-foreground">投标截止时间</label>
                    <p className="mt-1 font-medium text-lg">{formatDate(extractionResult.bid_deadline)}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <label className="text-sm font-medium text-muted-foreground">开标时间</label>
                    <p className="mt-1 font-medium text-lg">{formatDate(extractionResult.bid_opening_time)}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <label className="text-sm font-medium text-muted-foreground">澄清截止时间</label>
                    <p className="mt-1 font-medium text-lg">{formatDate(extractionResult.clarification_deadline)}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <label className="text-sm font-medium text-muted-foreground">投标有效期</label>
                    <p className="mt-1 font-medium text-lg">
                      {extractionResult.bid_validity_period 
                        ? `${extractionResult.bid_validity_period} 天` 
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
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
                {renderListContent(extractionResult.technical_requirements)}
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
                {renderListContent(extractionResult.business_requirements)}
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
                {extractionResult.evaluation_criteria?.categories?.length || 0} 个评分大类，
                共 {stats.items} 个评分细项
              </CardDescription>
            </CardHeader>
            <CardContent>
              {extractionResult.evaluation_criteria?.categories ? (
                <div className="space-y-6">
                  {extractionResult.evaluation_criteria.categories.map((category, idx) => (
                    <div key={category.id || idx} className="border rounded-lg">
                      <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{category.category_name}</h3>
                          <p className="text-sm text-muted-foreground">
                            权重: {category.weight}%
                          </p>
                        </div>
                        <Badge variant="outline">{category.items?.length || 0} 项</Badge>
                      </div>
                      <div className="p-4 space-y-3">
                        {category.items?.map((item, itemIdx) => (
                          <div 
                            key={item.id || itemIdx} 
                            className="flex items-start justify-between p-3 bg-muted/30 rounded"
                          >
                            <div className="flex-1">
                              <p className="font-medium">{item.item_name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {item.scoring_method || '评分'}
                                </Badge>
                                {item.scoring_rules && item.scoring_rules.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {item.scoring_rules.length} 条细则
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold text-primary">
                                {item.max_score}
                              </span>
                              <span className="text-sm text-muted-foreground"> 分</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  暂无评分标准信息
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. 废标风险 */}
        <TabsContent value="risks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>废标风险</CardTitle>
              <CardDescription>
                共 {extractionResult.disqualification_risks?.length || 0} 项风险，
                其中 {stats.criticalRisks} 项高风险
              </CardDescription>
            </CardHeader>
            <CardContent>
              {extractionResult.disqualification_risks && extractionResult.disqualification_risks.length > 0 ? (
                <div className="space-y-3">
                  {extractionResult.disqualification_risks
                    .sort((a, b) => {
                      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                      return (order[a.severity] || 4) - (order[b.severity] || 4);
                    })
                    .map((risk, idx) => (
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
                          <span className="text-sm text-muted-foreground">{risk.risk_type}</span>
                        </div>
                        <p className="text-sm">{risk.risk_description}</p>
                        {risk.source_text && (
                          <p className="text-xs text-muted-foreground mt-2 border-l-2 pl-2">
                            原文: {risk.source_text}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无废标风险信息</p>
                </div>
              )}
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
                {renderListContent(extractionResult.bid_document_requirements)}
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
                {typeof extractionResult.project_background === 'object' 
                  ? renderListContent(extractionResult.project_background as any)
                  : extractionResult.project_background 
                    ? <p className="whitespace-pre-wrap">{extractionResult.project_background}</p>
                    : <span className="text-muted-foreground">暂无项目背景信息</span>
                }
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
                {typeof extractionResult.other_requirements === 'object' 
                  ? renderListContent(extractionResult.other_requirements as any)
                  : extractionResult.other_requirements 
                    ? <p className="whitespace-pre-wrap">{extractionResult.other_requirements}</p>
                    : <span className="text-muted-foreground">暂无其他重要信息</span>
                }
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
