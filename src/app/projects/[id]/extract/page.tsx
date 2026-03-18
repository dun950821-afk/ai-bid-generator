'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TenderExtractionResultView } from '@/components/tender/tender-extraction-result-view';
import {
  TenderDocumentExtractionResult,
  createEmptyExtractionResult,
} from '@/types/tender-extraction';
import {
  FileText,
  Upload,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface ExtractionStatus {
  isExtracting: boolean;
  progress: string;
  error: string | null;
}

export default function TenderExtractionPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [extractionResult, setExtractionResult] = useState<TenderDocumentExtractionResult | null>(null);
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
        setExtractionResult(data.data.extractionResult);
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
    setStatus({ isExtracting: true, progress: '正在连接服务...', error: null });

    try {
      const response = await fetch(`/api/projects/${projectId}/extract-tender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useStreaming: true }),
      });

      if (!response.ok) {
        throw new Error('请求失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const tempResult = createEmptyExtractionResult('提取中...', 0, 'unknown');
      setExtractionResult(tempResult);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.substring(6));

            switch (data.type) {
              case 'start':
                setStatus(s => ({ ...s, progress: '开始提取...' }));
                break;

              case 'status':
                setStatus(s => ({ ...s, progress: data.data }));
                break;

              case 'project_basic_info':
                tempResult.project_basic_info = data.data;
                setExtractionResult({ ...tempResult });
                break;

              case 'time_schedule':
                tempResult.time_schedule = data.data;
                setExtractionResult({ ...tempResult });
                break;

              case 'core_tech_demand':
                tempResult.core_tech_demand = data.data;
                setExtractionResult({ ...tempResult });
                break;

              case 'business_requirements':
                tempResult.business_requirements = data.data;
                setExtractionResult({ ...tempResult });
                break;

              case 'scoring_standard':
                tempResult.scoring_standard = data.data;
                setExtractionResult({ ...tempResult });
                break;

              case 'key_compliance_requirements':
                tempResult.key_compliance_requirements = data.data;
                setExtractionResult({ ...tempResult });
                break;

              case 'bidding_document_requirements':
                tempResult.bidding_document_requirements = data.data;
                setExtractionResult({ ...tempResult });
                break;

              case 'complete':
                setExtractionResult(data.data);
                setStatus({ isExtracting: false, progress: '提取完成', error: null });
                break;

              case 'error':
                setStatus({ isExtracting: false, progress: '', error: data.error });
                break;
            }
          } catch (e) {
            console.error('解析数据失败:', e);
          }
        }
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
    if (!extractionResult) return;

    const blob = new Blob([JSON.stringify(extractionResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `招标文档提取结果_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">招标文档提取</h1>
          <p className="text-muted-foreground">智能提取招标文档关键信息</p>
        </div>

        <div className="flex gap-2">
          {extractionResult && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              导出结果
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
                {extractionResult ? '重新提取' : '开始提取'}
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

      {/* 提取结果展示 */}
      {extractionResult ? (
        <TenderExtractionResultView data={extractionResult} />
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
    </div>
  );
}
