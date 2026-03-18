'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Building2,
  Calendar,
  Settings,
  Target,
  AlertTriangle,
  FileCheck,
  Info,
  ArrowLeft,
} from 'lucide-react';

// 定义分段显示的键名映射
const SECTION_CONFIG = {
  projectBasicInfo: { title: '项目基本信息', icon: Building2, color: 'text-blue-600' },
  timeSchedule: { title: '时间节点', icon: Calendar, color: 'text-green-600' },
  coreTechDemand: { title: '核心技术需求', icon: Settings, color: 'text-purple-600' },
  businessRequirements: { title: '商务要求', icon: Building2, color: 'text-orange-600' },
  scoringStandard: { title: '评分标准', icon: Target, color: 'text-red-600' },
  disqualificationRisks: { title: '废标风险', icon: AlertTriangle, color: 'text-yellow-600' },
  biddingDocumentRequirements: { title: '投标文件要求', icon: FileCheck, color: 'text-cyan-600' },
  projectBackground: { title: '项目背景', icon: Info, color: 'text-gray-600' },
  otherImportantInfo: { title: '其他重要信息', icon: Info, color: 'text-indigo-600' },
  summary: { title: '提取摘要', icon: Target, color: 'text-pink-600' },
};

interface ExtractionStatus {
  isExtracting: boolean;
  progress: string;
  error: string | null;
}

export default function TenderExtractionPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [rawData, setRawData] = useState<any>(null);
  const [dbRecord, setDbRecord] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(Object.keys(SECTION_CONFIG)));
  const [status, setStatus] = useState<ExtractionStatus>({
    isExtracting: false,
    progress: '',
    error: null,
  });
  const [hasDocument, setHasDocument] = useState(false);

  // 加载提取结果
  const loadExtractionResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/extract-tender`);
      const data = await response.json();

      if (data.success && data.data.hasResult) {
        setDbRecord(data.data.extractionResult);
        // 优先使用完整的LLM原始数据
        setRawData(data.data.extractionResult.full_extraction_result || data.data.extractionResult);
      }
      setHasDocument(true);
    } catch (error) {
      console.error('加载提取结果失败:', error);
    }
  }, [projectId]);

  useEffect(() => {
    loadExtractionResult();
  }, [loadExtractionResult]);

  // 执行提取
  const handleExtract = async () => {
    setStatus({ isExtracting: true, progress: '正在提取...', error: null });

    try {
      const response = await fetch(`/api/projects/${projectId}/extract-tender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (data.success) {
        setRawData(data.data.llmRawData);
        setDbRecord(data.data.savedResult);
        setStatus({ isExtracting: false, progress: '提取完成', error: null });
      } else {
        setStatus({ isExtracting: false, progress: '', error: data.error });
      }
    } catch (error) {
      setStatus({
        isExtracting: false,
        progress: '',
        error: error instanceof Error ? error.message : '提取失败',
      });
    }
  };

  // 导出提取结果
  const handleExport = () => {
    if (!rawData) return;

    const blob = new Blob([JSON.stringify(rawData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `招标文档提取结果_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 切换分段展开/折叠
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // 渲染JSON值
  const renderValue = (value: any, depth: number = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">null</span>;
    }
    
    if (typeof value === 'boolean') {
      return <span className="text-purple-600">{value ? 'true' : 'false'}</span>;
    }
    
    if (typeof value === 'number') {
      return <span className="text-blue-600">{value}</span>;
    }
    
    if (typeof value === 'string') {
      if (value.length > 200) {
        return <span className="text-green-700">"{value.substring(0, 200)}..."</span>;
      }
      return <span className="text-green-700">"{value}"</span>;
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-400">[]</span>;
      }
      return (
        <div className="ml-4 border-l-2 border-gray-200 pl-2">
          {value.map((item, idx) => (
            <div key={idx} className="py-1">
              <span className="text-gray-500 text-xs">[{idx}]</span>
              {typeof item === 'object' ? (
                <div className="ml-2">{renderValue(item, depth + 1)}</div>
              ) : (
                <span className="ml-2">{renderValue(item, depth + 1)}</span>
              )}
            </div>
          ))}
        </div>
      );
    }
    
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return <span className="text-gray-400">{'{}'}</span>;
      }
      return (
        <div className="ml-4 border-l-2 border-gray-200 pl-2">
          {entries.map(([k, v]) => (
            <div key={k} className="py-0.5">
              <span className="text-red-600 font-medium">{k}</span>
              <span className="text-gray-500">: </span>
              {renderValue(v, depth + 1)}
            </div>
          ))}
        </div>
      );
    }
    
    return String(value);
  };

  // 渲染分段卡片
  const renderSectionCard = (key: string, data: any) => {
    const config = SECTION_CONFIG[key as keyof typeof SECTION_CONFIG];
    if (!config) return null;
    
    const isExpanded = expandedSections.has(key);
    const Icon = config.icon;
    
    // 计算该段的数据量
    const getItemCount = (obj: any): number => {
      if (!obj || typeof obj !== 'object') return 1;
      if (Array.isArray(obj)) return obj.length;
      return Object.keys(obj).length;
    };
    
    const itemCount = getItemCount(data);
    
    return (
      <Card key={key} className="overflow-hidden">
        <CardHeader 
          className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
          onClick={() => toggleSection(key)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <CardTitle className="text-base">{config.title}</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {itemCount} 项
              </Badge>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[400px]">
              <div className="font-mono text-sm bg-muted/30 p-3 rounded-lg">
                {renderValue(data)}
              </div>
            </ScrollArea>
          </CardContent>
        )}
      </Card>
    );
  };

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
            <h1 className="text-2xl font-bold">招标文档提取</h1>
            <p className="text-muted-foreground">智能提取招标文档关键信息 - LLM原始返回结果</p>
          </div>
        </div>

        <div className="flex gap-2">
          {rawData && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              导出JSON
            </Button>
          )}
          <Button
            onClick={handleExtract}
            disabled={status.isExtracting || !hasDocument}
          >
            {status.isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                提取中...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {rawData ? '重新提取' : '开始提取'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 提取进度 */}
      {status.isExtracting && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{status.progress}</span>
              </div>
              <Progress value={50} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 错误提示 */}
      {status.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{status.error}</AlertDescription>
        </Alert>
      )}

      {/* 提取元数据 */}
      {dbRecord && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">文档:</span>
                <span className="font-medium">{dbRecord.document_name || '未命名'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">评分项:</span>
                <span className="font-medium">{dbRecord.item_count || 0} 个</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-muted-foreground">风险项:</span>
                <span className="font-medium">{dbRecord.risk_count || 0} 个</span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-red-500" />
                <span className="text-muted-foreground">总分:</span>
                <span className="font-medium">{dbRecord.total_score || 0} 分</span>
              </div>
              {dbRecord.extraction_time_ms && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">耗时:</span>
                  <span className="font-medium">{(dbRecord.extraction_time_ms / 1000).toFixed(1)}s</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* LLM原始返回结果 - 分段展示 */}
      {rawData ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">LLM提取结果（分段展示）</h2>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setExpandedSections(new Set(Object.keys(SECTION_CONFIG)))}
              >
                全部展开
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setExpandedSections(new Set())}
              >
                全部折叠
              </Button>
            </div>
          </div>
          
          <div className="grid gap-4">
            {Object.entries(SECTION_CONFIG).map(([key]) => {
              // 支持多种键名格式
              const data = rawData[key] || 
                           rawData[convertToCamelCase(key)] || 
                           rawData[convertToSnakeCase(key)];
              if (data !== undefined) {
                return renderSectionCard(key, data);
              }
              return null;
            })}
            
            {/* 显示其他未分类的字段 */}
            {Object.entries(rawData)
              .filter(([key]) => !SECTION_CONFIG[key as keyof typeof SECTION_CONFIG] && 
                                 !Object.keys(SECTION_CONFIG).includes(convertToCamelCase(key)) &&
                                 !Object.keys(SECTION_CONFIG).includes(convertToSnakeCase(key)))
              .map(([key, value]) => (
                <Card key={key}>
                  <CardHeader 
                    className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
                    onClick={() => toggleSection(key)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-gray-500" />
                        <CardTitle className="text-base">{key}</CardTitle>
                      </div>
                      {expandedSections.has(key) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  {expandedSections.has(key) && (
                    <CardContent className="pt-0">
                      <ScrollArea className="max-h-[400px]">
                        <div className="font-mono text-sm bg-muted/30 p-3 rounded-lg">
                          {renderValue(value)}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  )}
                </Card>
              ))}
          </div>
        </div>
      ) : (
        !status.isExtracting && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>尚未提取招标文档信息</p>
                <p className="text-sm mt-2">点击"开始提取"按钮进行智能提取</p>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* 原始JSON查看 */}
      {rawData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">完整JSON数据</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <pre className="text-xs bg-muted/30 p-4 rounded-lg overflow-auto">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 辅助函数：转换为驼峰命名
function convertToCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// 辅助函数：转换为下划线命名
function convertToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
