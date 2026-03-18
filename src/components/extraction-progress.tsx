'use client';

import { useEffect, useState, useCallback } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Brain, 
  Database,
  RefreshCw,
  Upload,
  Clock,
  Info,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TaskStatus = 'idle' | 'parsing' | 'success' | 'failed' | 'completed' | 'running' | 'pending';

export interface ExtractionTask {
  id: string;
  status: TaskStatus;
  progress: number;
  stage: string;
  stageDetail?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface ExtractionProgressProps {
  projectId: string;
  taskId?: string | null;
  onTaskComplete?: () => void;
  onTaskFailed?: (error: string) => void;
  documentName?: string;
  documentSize?: string;
  onUploadNew?: () => void;
  isNewUpload?: boolean; // 是否为新上传的文件，用于跳过历史任务检查
}

// 解析阶段文案映射
const STAGE_MESSAGES: Record<string, string> = {
  '准备解析文档': '正在准备解析文档...',
  '解析文档': '正在读取文档内容...',
  '文档解析完成': '正在分析文档结构...',
  '提取项目基本信息': '正在提取项目信息...',
  '提取时间节点': '正在提取时间节点...',
  '提取评分标准': '正在提取评分标准...',
  '提取废标风险': '正在识别废标风险...',
  '提取商务要求': '正在提取商务要求...',
  '提取技术需求': '正在提取技术需求...',
  '保存提取结果': '正在保存提取结果...',
  '完成': '解析完成',
};

// 默认解析步骤（用于跑马灯效果）
const DEFAULT_STEPS = [
  '正在读取文档内容...',
  '正在提取项目信息...',
  '正在提取评分标准...',
  '正在识别废标风险...',
  '正在保存结果...'
];

export function ExtractionProgress({
  projectId,
  taskId: initialTaskId,
  onTaskComplete,
  onTaskFailed,
  documentName = '招标文档',
  documentSize,
  onUploadNew,
  isNewUpload = false,
}: ExtractionProgressProps) {
  const [task, setTask] = useState<ExtractionTask | null>(null);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId || null);
  const [isPolling, setIsPolling] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [status, setStatus] = useState<TaskStatus>('idle');

  // 获取当前阶段文案
  const getCurrentMessage = () => {
    if (!task?.stage) return DEFAULT_STEPS[0];
    return STAGE_MESSAGES[task.stage] || task.stage;
  };

  // 获取阶段索引（用于跑马灯）
  const getStepIndex = () => {
    if (!task?.progress) return 0;
    if (task.progress < 15) return 0;
    if (task.progress < 35) return 1;
    if (task.progress < 60) return 2;
    if (task.progress < 85) return 3;
    return 4;
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 获取任务状态
  const fetchTaskStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-task?taskId=${id}`);
      const data = await res.json();
      
      if (data.success && data.data.task) {
        const taskData = data.data.task;
        setTask(taskData);
        
        if (taskData.status === 'completed') {
          setIsPolling(false);
          setStatus('success');
          onTaskComplete?.();
        } else if (taskData.status === 'failed') {
          setIsPolling(false);
          setStatus('failed');
          onTaskFailed?.(taskData.errorMessage || '提取失败');
        }
        
        return taskData;
      }
    } catch (error) {
      console.error('获取任务状态失败:', error);
    }
    return null;
  }, [projectId, onTaskComplete, onTaskFailed]);

  // 启动任务
  const startTask = useCallback(async () => {
    try {
      setStatus('parsing');
      setIsPolling(true);
      setTimeElapsed(0);
      
      const res = await fetch(`/api/projects/${projectId}/extraction-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentName }),
      });
      const data = await res.json();
      
      if (data.success) {
        setTaskId(data.data.taskId);
        
        if (data.data.task) {
          setTask(data.data.task);
        } else {
          setTask({
            id: data.data.taskId,
            status: 'parsing',
            progress: 0,
            stage: '准备解析文档',
          });
        }
      } else {
        setStatus('failed');
        setIsPolling(false);
        onTaskFailed?.(data.error || '启动任务失败');
      }
    } catch (error) {
      setStatus('failed');
      setIsPolling(false);
      onTaskFailed?.(error instanceof Error ? error.message : '启动任务失败');
    }
  }, [projectId, documentName, onTaskFailed]);

  // 轮询任务状态
  useEffect(() => {
    if (!isPolling || !taskId) return;

    const interval = setInterval(() => {
      fetchTaskStatus(taskId);
    }, 2000);

    return () => clearInterval(interval);
  }, [isPolling, taskId, fetchTaskStatus]);

  // 计时器
  useEffect(() => {
    if (status !== 'parsing') return;

    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // 检查是否有运行中的任务
  useEffect(() => {
    // 如果是新上传的文件，跳过历史任务检查
    // 此时应该通过 taskId prop 传入新任务ID
    if (isNewUpload) {
      // 新上传时，直接显示解析中状态
      setStatus('parsing');
      setTask({
        id: initialTaskId || 'pending',
        status: 'parsing',
        progress: 0,
        stage: '准备解析文档',
      });
      
      // 如果有传入 taskId，开始轮询
      if (initialTaskId) {
        setTaskId(initialTaskId);
        setIsPolling(true);
      }
      return;
    }

    const checkExistingTask = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/extraction-task`);
        const data = await res.json();
        
        if (data.success && data.data.task) {
          const existingTask = data.data.task;
          setTask(existingTask);
          setTaskId(existingTask.id);
          
          if (existingTask.status === 'running' || existingTask.status === 'pending') {
            setStatus('parsing');
            setIsPolling(true);
          } else if (existingTask.status === 'completed') {
            setStatus('success');
          } else if (existingTask.status === 'failed') {
            setStatus('failed');
          }
        }
      } catch (error) {
        console.error('检查任务状态失败:', error);
      }
    };

    if (projectId) {
      checkExistingTask();
    }
  }, [projectId, isNewUpload, initialTaskId]);

  // 监听 taskId prop 变化（新上传时传入）
  useEffect(() => {
    // 只有当 isNewUpload 为 true 且有新的 taskId 时才处理
    if (isNewUpload && initialTaskId && initialTaskId !== taskId) {
      setTaskId(initialTaskId);
      setIsPolling(true);
    }
  }, [isNewUpload, initialTaskId, taskId]);

  return (
    <div className={cn(
      "w-full rounded-xl border-2 transition-all duration-300 flex flex-col",
      status === 'idle' ? "border-primary bg-primary/5" : 
      status === 'parsing' ? "border-blue-400 bg-white shadow-md shadow-blue-100/50" : 
      status === 'success' ? "border-green-500 bg-green-50/30" :
      "border-red-300 bg-red-50/30"
    )}>
      {/* 头部信息 */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg text-white",
            status === 'success' ? "bg-green-500" : 
            status === 'failed' ? "bg-red-500" :
            "bg-primary"
          )}>
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">上传招标文档</h3>
            <p className="text-xs text-muted-foreground">提取评分项和风险</p>
          </div>
          {status === 'success' && (
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              已完成
            </Badge>
          )}
        </div>
      </div>

      {/* 文件展示区 */}
      <div className="px-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
          <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={documentName}>
              {documentName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {documentSize || '招标文档'}
            </p>
          </div>
        </div>
      </div>

      {/* 动态交互区 - 固定最小高度防止布局跳动 */}
      <div className="p-4 pt-3 min-h-[130px] flex flex-col justify-end">
        
        {/* 状态 1：待解析 */}
        {status === 'idle' && (
          <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-300">
            <Button onClick={startTask} className="flex-1" size="sm">
              <RefreshCw className="w-4 h-4 mr-1.5" />
              开始解析
            </Button>
            {onUploadNew && (
              <Button variant="outline" size="sm" onClick={onUploadNew} className="flex-1">
                <Upload className="w-4 h-4 mr-1.5" />
                更换文件
              </Button>
            )}
          </div>
        )}

        {/* 状态 2：解析中 */}
        {status === 'parsing' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            {/* 进度文案跑马灯 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="truncate">{getCurrentMessage()}</span>
              </div>
              <span className="text-muted-foreground font-mono text-xs">
                {task?.progress || 0}%
              </span>
            </div>

            {/* 进度条 */}
            <Progress 
              value={task?.progress || 0} 
              className="h-2 bg-primary/10"
            />
            
            {/* 底部信息 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>已耗时: {formatTime(timeElapsed)}</span>
              </div>
            </div>

            {/* 弱化的温馨提示 */}
            <div className="flex items-start gap-1.5 p-2 rounded bg-primary/5 text-muted-foreground text-xs leading-relaxed">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>解析通常需要 1-3 分钟，您可离开此页面，后台将继续运行任务。</p>
            </div>
          </div>
        )}

        {/* 状态 3：解析完成 */}
        {status === 'success' && (
          <div className="flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-700 text-sm">解析完成</p>
                <p className="text-xs text-muted-foreground">
                  已提取评分项和风险
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => { setStatus('idle'); startTask(); }}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              重新解析
            </Button>
          </div>
        )}

        {/* 状态 4：解析失败 */}
        {status === 'failed' && (
          <div className="flex items-center justify-between animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-red-700 text-sm">解析失败</p>
                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {task?.errorMessage || '未知错误'}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => { setStatus('idle'); startTask(); }}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              重试
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// 紧凑版进度条（用于表格行内或小空间）
export function ExtractionProgressCompact({
  projectId,
  taskId,
  onTaskComplete,
  documentName,
}: ExtractionProgressProps) {
  const [task, setTask] = useState<ExtractionTask | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // 获取任务状态
  useEffect(() => {
    if (!taskId) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/extraction-task?taskId=${taskId}`);
        const data = await res.json();
        
        if (data.success && data.data.task) {
          setTask(data.data.task);
          if (data.data.task.status === 'completed') {
            setIsPolling(false);
            onTaskComplete?.();
          }
        }
      } catch (error) {
        console.error('获取任务状态失败:', error);
      }
    };

    fetchStatus();
    
    if (isPolling) {
      const interval = setInterval(fetchStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [projectId, taskId, isPolling, onTaskComplete]);

  if (!task) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>等待解析</span>
      </div>
    );
  }

  if (task.status === 'success' || task.status === 'completed') {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle2 className="w-4 h-4" />
        <span>已完成</span>
      </div>
    );
  }

  if (task.status === 'failed') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <AlertCircle className="w-4 h-4" />
        <span>失败</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
      <div className="flex-1">
        <Progress value={task.progress} className="h-1.5" />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-10">
        {task.progress}%
      </span>
    </div>
  );
}
