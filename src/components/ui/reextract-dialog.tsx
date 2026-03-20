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
  FileStack,
  Sparkles,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

// 分段定义
export interface ExtractionSegment {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

// 9个提取阶段 - 商业级设计
export const EXTRACTION_SEGMENTS: ExtractionSegment[] = [
  { 
    key: 'projectBasicInfo', 
    name: '项目基本信息', 
    description: '项目名称、编号、采购人等',
    icon: <FileText className="h-5 w-5" />, 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200 hover:border-blue-300',
  },
  { 
    key: 'projectBackground', 
    name: '项目背景', 
    description: '项目概述、背景说明',
    icon: <Building className="h-5 w-5" />, 
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 border-indigo-200 hover:border-indigo-300',
  },
  { 
    key: 'timeSchedule', 
    name: '时间节点', 
    description: '投标截止、开标时间等',
    icon: <Calendar className="h-5 w-5" />, 
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200 hover:border-orange-300',
  },
  { 
    key: 'scoringStandard', 
    name: '评分标准', 
    description: '评分项、分值权重',
    icon: <Target className="h-5 w-5" />, 
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200 hover:border-green-300',
  },
  { 
    key: 'disqualificationRisks', 
    name: '废标风险', 
    description: '可能导致废标的风险项',
    icon: <AlertTriangle className="h-5 w-5" />, 
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200 hover:border-red-300',
  },
  { 
    key: 'businessRequirements', 
    name: '商务要求', 
    description: '资质、业绩、财务要求',
    icon: <Briefcase className="h-5 w-5" />, 
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200 hover:border-purple-300',
  },
  { 
    key: 'coreTechDemand', 
    name: '技术需求', 
    description: '技术规格、参数要求',
    icon: <Cpu className="h-5 w-5" />, 
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 border-cyan-200 hover:border-cyan-300',
  },
  { 
    key: 'biddingDocumentRequirements', 
    name: '投标文件要求', 
    description: '文件格式、签章要求',
    icon: <FileCheck className="h-5 w-5" />, 
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 border-teal-200 hover:border-teal-300',
  },
  { 
    key: 'otherImportantInfo', 
    name: '其他重要信息', 
    description: '其他关键条款和要求',
    icon: <Info className="h-5 w-5" />, 
    color: 'text-slate-600',
    bgColor: 'bg-slate-50 border-slate-200 hover:border-slate-300',
  },
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

// 状态图标组件
function StatusIcon({ status, size = 'sm' }: { status: SegmentStatus; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  
  switch (status) {
    case 'extracted':
      return <CheckCircle2 className={cn(sizeClass, 'text-green-500')} />;
    case 'extracting':
      return <Loader2 className={cn(sizeClass, 'text-blue-500 animate-spin')} />;
    case 'error':
      return <AlertCircle className={cn(sizeClass, 'text-red-500')} />;
    case 'pending':
      return <Clock className={cn(sizeClass, 'text-slate-400')} />;
    default:
      return null;
  }
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
        <span className="text-slate-500 font-mono font-medium">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5 bg-blue-100" />
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

  // 统计信息
  const extractedCount = Object.values(segmentStates).filter(s => s.status === 'extracted').length;
  const totalSegments = EXTRACTION_SEGMENTS.length;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] p-0 gap-0 overflow-hidden border-0 shadow-2xl">
        {/* Header - 渐变背景 */}
        <div className="relative px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjAyIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
                <RefreshCw className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">
                  重新提取招标文档
                </DialogTitle>
                <p className="text-sm text-slate-300 mt-0.5">
                  选择需要重新提取的分段，系统将智能分析文档内容
                </p>
              </div>
            </div>
            
            {/* 进度统计 */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg backdrop-blur-sm">
                  <FileStack className="h-4 w-4 text-slate-300" />
                  <span className="text-sm text-slate-200">已提取</span>
                  <span className="text-lg font-bold text-white ml-1">{extractedCount}</span>
                  <span className="text-slate-400">/ {totalSegments}</span>
                </div>
              </div>
              {hasRunningTask && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 rounded-lg border border-blue-400/30">
                  <Loader2 className="h-4 w-4 text-blue-300 animate-spin" />
                  <span className="text-sm text-blue-200">提取中...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content - 网格布局 */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXTRACTION_SEGMENTS.map((segment) => {
              const state = segmentStates[segment.key] || { status: 'pending' as SegmentStatus };
              const isExtracting = state.status === 'extracting';
              
              return (
                <div
                  key={segment.key}
                  className={cn(
                    'group relative flex flex-col p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer',
                    segment.bgColor,
                    isExtracting && 'ring-2 ring-blue-400 ring-offset-2 shadow-lg',
                    state.status === 'error' && 'ring-2 ring-red-400 ring-offset-2'
                  )}
                  onClick={() => !isExtracting && handleReextractSegment(segment.key)}
                >
                  {/* 顶部：图标 + 状态 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn('p-2 rounded-lg bg-white/80 shadow-sm', segment.color)}>
                      {segment.icon}
                    </div>
                    <StatusIcon status={state.status} />
                  </div>
                  
                  {/* 中部：名称 + 描述 */}
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-800 mb-1">{segment.name}</h4>
                    <p className="text-xs text-slate-500 line-clamp-1">{segment.description}</p>
                  </div>
                  
                  {/* 底部：状态信息 */}
                  <div className="mt-3 pt-3 border-t border-black/5">
                    {isExtracting ? (
                      <SegmentProgress progress={state.progress || 0} stage={state.stage || '正在提取...'} />
                    ) : state.status === 'extracted' ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {state.extraInfo || '已完成'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {state.lastUpdated}
                        </span>
                      </div>
                    ) : state.status === 'error' ? (
                      <span className="text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {state.errorMessage || '提取失败'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        点击重新提取
                      </span>
                    )}
                  </div>
                  
                  {/* Hover 效果：重新提取按钮 */}
                  {!isExtracting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 rounded-xl transition-all">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          size="sm" 
                          className="shadow-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReextractSegment(segment.key);
                          }}
                        >
                          <Zap className="h-3.5 w-3.5 mr-1" />
                          重新提取
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              提示：单项提取仅重新分析选中部分，全部提取将覆盖所有数据
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button 
                onClick={handleReextractAll} 
                disabled={hasRunningTask}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                {hasRunningTask ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                全部重新提取
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ReextractDialog;
