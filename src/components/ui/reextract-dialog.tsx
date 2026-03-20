'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Calendar,
  Target,
  AlertTriangle,
  Briefcase,
  Cpu,
  FileCheck,
  Building,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

// 分段定义
export interface ExtractionSegment {
  key: string;
  name: string;
  icon: React.ReactNode;
}

// 9个提取阶段
export const EXTRACTION_SEGMENTS: ExtractionSegment[] = [
  { key: 'projectBasicInfo', name: '项目基本信息', icon: <FileText className="h-5 w-5 text-blue-500" /> },
  { key: 'projectBackground', name: '项目背景', icon: <Building className="h-5 w-5 text-indigo-500" /> },
  { key: 'timeSchedule', name: '时间节点', icon: <Calendar className="h-5 w-5 text-orange-500" /> },
  { key: 'scoringStandard', name: '评分标准', icon: <Target className="h-5 w-5 text-green-500" /> },
  { key: 'disqualificationRisks', name: '废标风险', icon: <AlertTriangle className="h-5 w-5 text-red-500" /> },
  { key: 'businessRequirements', name: '商务要求', icon: <Briefcase className="h-5 w-5 text-purple-500" /> },
  { key: 'coreTechDemand', name: '技术需求', icon: <Cpu className="h-5 w-5 text-cyan-500" /> },
  { key: 'biddingDocumentRequirements', name: '投标文件要求', icon: <FileCheck className="h-5 w-5 text-teal-500" /> },
  { key: 'otherImportantInfo', name: '其他重要信息', icon: <Info className="h-5 w-5 text-slate-500" /> },
];

// 分段状态
export type SegmentStatus = 'extracted' | 'extracting' | 'error' | 'pending';

// 分段状态信息
export interface SegmentState {
  status: SegmentStatus;
  lastUpdated?: string;
  extraInfo?: string;
  errorMessage?: string;
  taskId?: string;
  progress?: number;
  stage?: string;
}

// 任务状态
interface TaskStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  stageDetail?: string;
  errorMessage?: string;
}

interface ReextractDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  extractionResult?: any;
  onReextractComplete?: () => void;
}

// 状态徽章组件
function StatusBadge({ status }: { status: SegmentStatus }) {
  const config = {
    extracted: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: '已提取',
      className: 'text-green-600 bg-green-50 border-green-200',
    },
    extracting: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: '提取中',
      className: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: '失败',
      className: 'text-red-600 bg-red-50 border-red-200',
    },
    pending: {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: '待提取',
      className: 'text-slate-500 bg-slate-50 border-slate-200',
    },
  };

  const { icon, label, className } = config[status];

  return (
    <Badge variant="outline" className={cn('text-xs gap-1', className)}>
      {icon}
      {label}
    </Badge>
  );
}

// 进度条组件
function SegmentProgress({
  progress,
  stage,
}: {
  progress: number;
  stage: string;
}) {
  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-blue-600 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {stage}
        </span>
        <span className="text-slate-400 font-mono">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5" />
    </div>
  );
}

// 阶段卡片组件
function SegmentCard({
  segment,
  state,
  onReextract,
}: {
  segment: ExtractionSegment;
  state: SegmentState;
  onReextract: () => void;
}) {
  const isExtracting = state.status === 'extracting';

  return (
    <div
      className={cn(
        'flex items-start justify-between p-3 rounded-lg border transition-all',
        isExtracting && 'border-blue-200 bg-blue-50/50',
        state.status === 'error' && 'border-red-200 bg-red-50/50'
      )}
    >
      {/* 左侧：图标 + 信息 */}
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-lg bg-muted/50 shrink-0">{segment.icon}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{segment.name}</span>
            <StatusBadge status={state.status} />
          </div>

          {/* 提取中显示进度 */}
          {isExtracting && (
            <SegmentProgress progress={state.progress || 0} stage={state.stage || '正在提取...'} />
          )}

          {/* 其他状态显示信息 */}
          {!isExtracting && (
            <div className="text-xs text-muted-foreground mt-1">
              {state.status === 'error' && state.errorMessage && (
                <span className="text-red-500">{state.errorMessage}</span>
              )}
              {state.status === 'extracted' && state.extraInfo && <span>{state.extraInfo}</span>}
              {state.status === 'extracted' && !state.extraInfo && state.lastUpdated && (
                <span>更新于 {state.lastUpdated}</span>
              )}
              {state.status === 'pending' && <span>尚未提取</span>}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：操作按钮 */}
      {!isExtracting && (
        <Button
          variant="outline"
          size="sm"
          onClick={onReextract}
          className="shrink-0 ml-2 h-8"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          重新提取
        </Button>
      )}
    </div>
  );
}

export function ReextractDialog({
  isOpen,
  onOpenChange,
  projectId,
  extractionResult,
  onReextractComplete,
}: ReextractDialogProps) {
  // 各阶段状态
  const [segmentStates, setSegmentStates] = useState<Record<string, SegmentState>>({});
  // 是否有正在提取的任务
  const [hasRunningTask, setHasRunningTask] = useState(false);
  // 轮询间隔ID
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);

  // 初始化各阶段状态
  useEffect(() => {
    if (!isOpen) return;

    const fullResult = extractionResult?.full_extraction_result || {};
    const initialStates: Record<string, SegmentState> = {};

    for (const segment of EXTRACTION_SEGMENTS) {
      const data = fullResult[segment.key];
      const hasData = data && Object.keys(data).length > 0;

      // 构建额外信息
      let extraInfo = '';
      if (segment.key === 'scoringStandard' && data?.evaluationCriteria) {
        const criteria = data.evaluationCriteria;
        const totalItems = criteria.reduce(
          (sum: number, cat: any) => sum + (cat.items?.length || 0),
          0
        );
        extraInfo = `${criteria.length} 个大类，${totalItems} 个细项`;
      } else if (segment.key === 'disqualificationRisks' && Array.isArray(data)) {
        extraInfo = `${data.length} 项风险`;
      }

      initialStates[segment.key] = {
        status: hasData ? 'extracted' : 'pending',
        extraInfo: extraInfo || undefined,
        lastUpdated: extractionResult?.updated_at
          ? new Date(extractionResult.updated_at).toLocaleTimeString()
          : undefined,
      };
    }

    setSegmentStates(initialStates);
  }, [isOpen, extractionResult]);

  // 轮询任务状态
  useEffect(() => {
    if (!pollingTaskId) return;

    const pollTask = async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/segment-task?taskId=${pollingTaskId}`
        );
        const data = await res.json();

        if (data.success && data.data.task) {
          const task: TaskStatus = data.data.task;

          // 更新对应阶段的状态
          setSegmentStates((prev) => {
            const updated = { ...prev };
            for (const [key, state] of Object.entries(updated)) {
              if (state.taskId === pollingTaskId) {
                updated[key] = {
                  ...state,
                  progress: task.progress,
                  stage: task.stage,
                  status: task.status === 'running' ? 'extracting' : state.status,
                };
              }
            }
            return updated;
          });

          if (task.status === 'completed') {
            // 任务完成
            setPollingTaskId(null);
            setHasRunningTask(false);
            setSegmentStates((prev) => {
              const updated = { ...prev };
              for (const [key, state] of Object.entries(updated)) {
                if (state.taskId === pollingTaskId) {
                  updated[key] = {
                    status: 'extracted',
                    lastUpdated: new Date().toLocaleTimeString(),
                  };
                }
              }
              return updated;
            });
            toast.success('提取完成');
            onReextractComplete?.();
          } else if (task.status === 'failed') {
            // 任务失败
            setPollingTaskId(null);
            setHasRunningTask(false);
            setSegmentStates((prev) => {
              const updated = { ...prev };
              for (const [key, state] of Object.entries(updated)) {
                if (state.taskId === pollingTaskId) {
                  updated[key] = {
                    status: 'error',
                    errorMessage: task.errorMessage || '提取失败',
                  };
                }
              }
              return updated;
            });
            toast.error(task.errorMessage || '提取失败');
          }
        }
      } catch (error) {
        console.error('轮询任务状态失败:', error);
      }
    };

    const interval = setInterval(pollTask, 3000);
    pollTask(); // 立即执行一次

    return () => clearInterval(interval);
  }, [pollingTaskId, projectId, onReextractComplete]);

  // 重新提取单个分段
  const handleReextractSegment = useCallback(
    async (segmentKey: string) => {
      if (hasRunningTask) {
        toast.warning('请等待当前任务完成');
        return;
      }

      const segment = EXTRACTION_SEGMENTS.find((s) => s.key === segmentKey);
      if (!segment) return;

      // 更新状态为提取中
      setSegmentStates((prev) => ({
        ...prev,
        [segmentKey]: {
          status: 'extracting',
          progress: 0,
          stage: '准备提取...',
        },
      }));

      setHasRunningTask(true);

      try {
        const res = await fetch(`/api/projects/${projectId}/segment-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segment: segmentKey }),
        });

        const data = await res.json();

        if (data.success) {
          const taskId = data.data.taskId;
          setPollingTaskId(taskId);

          // 关联taskId到阶段
          setSegmentStates((prev) => ({
            ...prev,
            [segmentKey]: {
              ...prev[segmentKey],
              taskId,
            },
          }));

          toast.info(`开始提取 ${segment.name}`);
        } else {
          setSegmentStates((prev) => ({
            ...prev,
            [segmentKey]: {
              status: 'error',
              errorMessage: data.error || '启动任务失败',
            },
          }));
          setHasRunningTask(false);
          toast.error(data.error || '启动任务失败');
        }
      } catch (error: any) {
        setSegmentStates((prev) => ({
          ...prev,
          [segmentKey]: {
            status: 'error',
            errorMessage: error.message || '启动任务失败',
          },
        }));
        setHasRunningTask(false);
        toast.error(error.message || '启动任务失败');
      }
    },
    [hasRunningTask, projectId]
  );

  // 全部重新提取
  const handleReextractAll = useCallback(async () => {
    if (hasRunningTask) {
      toast.warning('请等待当前任务完成');
      return;
    }

    // 关闭弹窗，由父组件处理全部重新提取
    onOpenChange(false);
    
    // 触发完整提取任务
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (data.success) {
        toast.info('开始全部重新提取');
        onReextractComplete?.();
      } else {
        toast.error(data.error || '启动任务失败');
      }
    } catch (error: any) {
      toast.error(error.message || '启动任务失败');
    }
  }, [hasRunningTask, projectId, onOpenChange, onReextractComplete]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            重新提取招标文档
          </DialogTitle>
          <DialogDescription>
            选择需要重新提取的阶段，或点击底部按钮全部重新提取
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-2 py-4">
            {EXTRACTION_SEGMENTS.map((segment) => (
              <SegmentCard
                key={segment.key}
                segment={segment}
                state={segmentStates[segment.key] || { status: 'pending' }}
                onReextract={() => handleReextractSegment(segment.key)}
              />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleReextractAll} disabled={hasRunningTask}>
            <RefreshCw className={cn('h-4 w-4 mr-2', hasRunningTask && 'animate-spin')} />
            全部重新提取
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReextractDialog;
