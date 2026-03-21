'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TenderExtractionView } from '@/components/tender-extraction-view';
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
} from 'lucide-react';
import type { ValidationResult, ScoringItem, Risk } from '../../types';

interface ExportStageProps {
  projectId: string;
  hasContent: boolean;
  validationResult: ValidationResult | null;
  validating: boolean;
  exporting: boolean;
  scoringItems: ScoringItem[];
  risks: Risk[];
  extractionResult: any;
  onValidate: () => Promise<void>;
  onExport: (format: 'markdown' | 'html' | 'docx') => Promise<void>;
}

/**
 * 校验导出阶段组件
 */
export function ExportStage({
  projectId,
  hasContent,
  validationResult,
  validating,
  exporting,
  scoringItems,
  risks,
  extractionResult,
  onValidate,
  onExport,
}: ExportStageProps) {
  const [activeTab, setActiveTab] = useState('validation');

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
      )}

      {/* 提取结果预览 */}
      {extractionResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">提取结果预览</CardTitle>
          </CardHeader>
          <CardContent>
            <TenderExtractionView extractionResult={extractionResult} showCompact={true} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ExportStage;
