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
  RefreshCw,
  Upload,
  Clock,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TaskStatus = 'idle' | 'parsing' | 'success' | 'failed' | 'completed' | 'running' | 'pending';

// 辅助函数：根据服务端的 startedAt 计算真实的已用时间（秒）
const getElapsedTime = (startedAt?: Date | string) => {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 1000));
};

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
  isNewUpload?: boolean;
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

// 默认解析步骤
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
        
        // 用服务端时间校准
        if (taskData.startedAt) {
          setTimeElapsed(getElapsedTime(taskData.startedAt));
        }
        
        if (taskData.status === 'completed') {
          setIsPolling(false);
          setStatus('success');
          if (taskData.completedAt && taskData.startedAt) {
            const finalTime = Math.max(0, Math.floor((new Date(taskData.completedAt).getTime() - new Date(taskData.startedAt).getTime()) / 1000));
            setTimeElapsed(finalTime);
          }
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

  // 轮询任务状态（5秒间隔）
  useEffect(() => {
    if (!isPolling || !taskId) return;
    const interval = setInterval(() => {
      fetchTaskStatus(taskId);
    }, 5000);
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
    if (isNewUpload) {
      setStatus('parsing');
      setTask({
        id: initialTaskId || 'pending',
        status: 'parsing',
        progress: 0,
        stage: '准备解析文档',
      });
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
            setTimeElapsed(getElapsedTime(existingTask.startedAt));
          } else if (existingTask.status === 'completed') {
            setStatus('success');
            if (existingTask.startedAt && existingTask.completedAt) {
              const duration = Math.max(0, Math.floor((new Date(existingTask.completedAt).getTime() - new Date(existingTask.startedAt).getTime()) / 1000));
              setTimeElapsed(duration);
            }
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

  // 监听 taskId prop 变化
  useEffect(() => {
    if (isNewUpload && initialTaskId && initialTaskId !== taskId) {
      setTaskId(initialTaskId);
      setIsPolling(true);
    }
  }, [isNewUpload, initialTaskId, taskId]);

  // ==================== 单层卡片渲染 ====================
  return (
    <div className={cn(
      "w-full rounded-xl border-2 transition-all duration-300 flex flex-col overflow-hidden",
      status === 'idle' ? "border-primary/30 bg-white" : 
      status === 'parsing' ? "border-blue-400 bg-white shadow-md shadow-blue-100/50" : 
      status === 'success' ? "border-green-500 bg-white" :
      "border-red-400 bg-white"
    )}>
      
      {/* ========== 头部区域：步骤名称 + 状态徽标 ========== */}
      <div className={cn(
        "flex items-center justify-between p-4 border-b",
        status === 'success' ? "border-green-100 bg-green-50/50" :
        status === 'failed' ? "border-red-100 bg-red-50/50" :
        status === 'parsing' ? "border-blue-100 bg-blue-50/30" :
        "border-border/50"
      )}>
        <div className="flex items-center gap-3">
          {/* 左侧图标：根据状态变化 */}
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
            status === 'success' ? "bg-green-500 text-white" :
            status === 'failed' ? "bg-red-500 text-white" :
            status === 'parsing' ? "bg-blue-500 text-white" :
            "bg-primary text-primary-foreground"
          )}>
            {status === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
             status === 'failed' ? <AlertCircle className="w-5 h-5" /> :
             status === 'parsing' ? <Loader2 className="w-5 h-5 animate-spin" /> :
             <FileText className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">上传招标文档</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">提取评分项和风险</p>
          </div>
        </div>
        {/* 右侧状态徽标 */}
        {status === 'success' && (
          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 shrink-0">
            已完成
          </Badge>
        )}
        {status === 'failed' && (
          <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 shrink-0">
            解析失败
          </Badge>
        )}
        {status === 'parsing' && (
          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 shrink-0">
            解析中
          </Badge>
        )}
      </div>

      {/* ========== 内容区域：文件信息（无额外边框） ========== */}
      <div className="p-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
          <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate" title={documentName}>
              {documentName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {documentSize || '招标文档'}
            </p>
          </div>
        </div>
      </div>

      {/* ========== 底部区域：状态提示 + 操作按钮 ========== */}
      
      {/* 状态 1：待解析 */}
      {status === 'idle' && (
        <div className="flex items-center gap-2 px-4 pb-4">
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
        <div className="px-4 pb-4 space-y-3">
          {/* 进度信息 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-600 font-medium text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="truncate">{getCurrentMessage()}</span>
            </div>
            <span className="text-slate-400 font-mono text-xs">
              {task?.progress || 0}%
            </span>
          </div>

          {/* 进度条 */}
          <Progress 
            value={task?.progress || 0} 
            className="h-2 bg-blue-100"
          />
          
          {/* 时间 + 提示 */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>已耗时: {formatTime(timeElapsed)}</span>
            </div>
          </div>
          
          <div className="flex items-start gap-1.5 p-2 rounded bg-blue-50 text-slate-500 text-xs leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>解析通常需要 10-20 分钟，您可离开此页面，后台将继续运行任务。</p>
          </div>
        </div>
      )}

      {/* 状态 3：解析完成 */}
      {status === 'success' && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <span className="text-[12px] text-green-600 flex items-center gap-1.5 font-medium shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            解析成功
          </span>
          
          <div className="flex items-center gap-1">
            {onUploadNew && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-[12px] text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-2"
                  onClick={() => {
                    setStatus('idle');
                    onUploadNew();
                  }}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  重新上传
                </Button>
                <div className="w-[1px] h-3 bg-slate-200 mx-1"></div>
              </>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-[12px] text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-2"
              onClick={() => { setStatus('idle'); startTask(); }}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              重新解析
            </Button>
          </div>
        </div>
      )}

      {/* 状态 4：解析失败 */}
      {status === 'failed' && (
        <div className="px-4 pb-4 space-y-3">
          {/* 错误信息 */}
          <div className="p-3 rounded-lg bg-red-50 border border-red-100">
            <p className="text-sm text-red-700 font-medium">解析失败</p>
            <p className="text-xs text-red-500 mt-1 truncate" title={task?.errorMessage || '未知错误'}>
              {task?.errorMessage || '未知错误'}
            </p>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[12px] text-red-500 flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              请重试
            </span>
            
            <div className="flex items-center gap-1">
              {onUploadNew && (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[12px] text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-2"
                    onClick={() => {
                      setStatus('idle');
                      onUploadNew();
                    }}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    更换文件
                  </Button>
                  <div className="w-[1px] h-3 bg-slate-200 mx-1"></div>
                </>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[12px] text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-2"
                onClick={() => { setStatus('idle'); startTask(); }}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                重新解析
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 紧凑版进度条
export function ExtractionProgressCompact({
  projectId,
  taskId,
  onTaskComplete,
  documentName,
}: ExtractionProgressProps) {
  const [task, setTask] = useState<ExtractionTask | null>(null);
  const [isPolling, setIsPolling] = useState(false);

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
      const interval = setInterval(fetchStatus, 5000);
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
