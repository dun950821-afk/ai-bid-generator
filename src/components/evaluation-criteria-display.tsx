'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Target, 
  CheckCircle2, 
  Clock, 
  ChevronDown, 
  ChevronRight,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EvaluationItem {
  id: string;
  subItem: string;
  itemScore: number;
  rule: string;
  basis?: string;
  techDocRef?: string;
  responseContent?: string;
  responseStatus: 'pending' | 'draft' | 'completed';
  createdAt: string;
}

interface EvaluationCriteria {
  id: string;
  seq: number;
  category: string;
  totalScore: number;
  categoryType: 'technical' | 'business' | 'price';
  createdAt: string;
  items: EvaluationItem[];
}

interface EvaluationSummary {
  totalCriteria: number;
  totalItems: number;
  totalScore: number;
  technicalScore: number;
  businessScore: number;
  priceScore: number;
  pendingItems: number;
  completedItems: number;
}

interface EvaluationCriteriaDisplayProps {
  projectId: string;
}

export function EvaluationCriteriaDisplay({ projectId }: EvaluationCriteriaDisplayProps) {
  const [criteriaList, setCriteriaList] = useState<EvaluationCriteria[]>([]);
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set());

  // 获取评分标准数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/evaluation-criteria`);
        const data = await res.json();
        
        if (data.success) {
          setCriteriaList(data.data.criteriaList || []);
          setSummary(data.data.summary || null);
          // 默认展开第一个评分大类
          if (data.data.criteriaList?.length > 0) {
            setExpandedCriteria(new Set([data.data.criteriaList[0].id]));
          }
        }
      } catch (error) {
        console.error('获取评分标准失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId]);

  // 切换展开/折叠
  const toggleCriteria = (criteriaId: string) => {
    setExpandedCriteria(prev => {
      const newSet = new Set(prev);
      if (newSet.has(criteriaId)) {
        newSet.delete(criteriaId);
      } else {
        newSet.add(criteriaId);
      }
      return newSet;
    });
  };

  // 获取类型颜色
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'technical':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'business':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'price':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // 获取类型名称
  const getTypeName = (type: string) => {
    switch (type) {
      case 'technical':
        return '技术评分';
      case 'business':
        return '商务评分';
      case 'price':
        return '价格评分';
      default:
        return '其他';
    }
  };

  // 获取响应状态
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />已完成</Badge>;
      case 'draft':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-200"><Clock className="h-3 w-3 mr-1" />草稿</Badge>;
      default:
        return <Badge variant="outline" className="text-gray-500"><AlertCircle className="h-3 w-3 mr-1" />待响应</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (criteriaList.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>暂无评分标准，请先上传招标文档并提取</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 汇总信息卡片 */}
      {summary && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">评分总分</p>
                <p className="text-2xl font-bold text-primary">{summary.totalScore}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">评分大类</p>
                <p className="text-2xl font-bold">{summary.totalCriteria}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">评分细项</p>
                <p className="text-2xl font-bold">{summary.totalItems}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">响应进度</p>
                <div className="flex items-center justify-center gap-2">
                  <Progress 
                    value={summary.totalItems > 0 ? (summary.completedItems / summary.totalItems) * 100 : 0} 
                    className="h-2 w-20"
                  />
                  <span className="text-sm font-medium">
                    {summary.completedItems}/{summary.totalItems}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
              <div>
                <Badge className="bg-blue-100 text-blue-700">技术 {summary.technicalScore} 分</Badge>
              </div>
              <div>
                <Badge className="bg-green-100 text-green-700">商务 {summary.businessScore} 分</Badge>
              </div>
              <div>
                <Badge className="bg-orange-100 text-orange-700">价格 {summary.priceScore} 分</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 评分标准列表 */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3 pr-4">
          {criteriaList.map((criteria) => {
            const isExpanded = expandedCriteria.has(criteria.id);
            
            return (
              <Card key={criteria.id} className="overflow-hidden">
                {/* 评分大类头部 */}
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
                  onClick={() => toggleCriteria(criteria.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-6">{criteria.seq}.</span>
                        <CardTitle className="text-base">{criteria.category}</CardTitle>
                        <Badge className={cn('ml-2', getTypeColor(criteria.categoryType))}>
                          {getTypeName(criteria.categoryType)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg">{criteria.totalScore} 分</span>
                      <Badge variant="secondary">{criteria.items.length} 项</Badge>
                    </div>
                  </div>
                </CardHeader>

                {/* 评分细项列表 */}
                {isExpanded && (
                  <CardContent className="pt-0 pb-4">
                    <div className="space-y-3 ml-9">
                      {criteria.items.map((item, index) => (
                        <div 
                          key={item.id}
                          className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.subItem}</span>
                                <Badge variant="outline" className="font-mono">{item.itemScore} 分</Badge>
                                {getStatusBadge(item.responseStatus)}
                              </div>
                              
                              {/* 评分细则 */}
                              {item.rule && (
                                <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                                  <span className="font-medium text-foreground">评分细则：</span>
                                  {item.rule}
                                </div>
                              )}
                              
                              {/* 评分依据 */}
                              {item.basis && (
                                <div className="text-sm text-muted-foreground">
                                  <span className="font-medium">评分依据：</span>
                                  {item.basis}
                                </div>
                              )}
                              
                              {/* 技术需求书引用 */}
                              {item.techDocRef && (
                                <div className="flex items-center gap-1 text-xs text-blue-600">
                                  <FileText className="h-3 w-3" />
                                  <span>引用技术需求书 {item.techDocRef}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {criteria.items.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-4">
                          暂无评分细项
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
