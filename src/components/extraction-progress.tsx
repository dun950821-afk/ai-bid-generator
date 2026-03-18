'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  ArrowRight
} from 'lucide-react';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

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
  autoStart?: boolean;
  documentName?: string;
}

// 阶段图标映射
const stageIcons: Record<string, React.ReactNode> = {
  '准备解析文档': <FileText className="h-5 w-5" />,
  '解析文档': <FileText className="h-5 w-5" />,
  '文档解析完成': <FileText className="h-5 w-5" />,
  '提取项目基本信息': <Brain className="h-5 w-5" />,
  '提取时间节点': <Brain className="h-5 w-5" />,
  '提取评分标准': <Brain className="h-5 w-5" />,
  '提取废标风险': <Brain className="h-5 w-5" />,
  '提取商务要求': <Brain className="h-5 w-5" />,
  '提取技术需求': <Brain className="h-5 w-5" />,
  '保存提取结果': <Database className="h-5 w-5" />,
  '完成': <CheckCircle2 className="h-5 w-5" />,
};

// 进度阶段定义
const progressStages = [
  { name: '文档解析', minProgress: 0, maxProgress: 10 },
  { name: '项目信息提取', minProgress: 10, maxProgress: 25 },
  { name: '时间节点提取', minProgress: 25, maxProgress: 40 },
  { name: '评分标准提取', minProgress: 40, maxProgress: 55 },
  { name: '废标风险提取', minProgress: 55, maxProgress: 70 },
  { name: '商务要求提取', minProgress: 70, maxProgress: 85 },
  { name: '技术需求提取', minProgress: 85, maxProgress: 95 },
  { name: '保存结果', minProgress: 95, maxProgress: 100 },
];

export function ExtractionProgress({
  projectId,
  taskId: initialTaskId,
  onTaskComplete,
  onTaskFailed,
  autoStart = false,
  documentName,
}: ExtractionProgressProps) {
  const [task, setTask] = useState<ExtractionTask | null>(null);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId || null);
  const [isPolling, setIsPolling] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);

  // 获取任务状态
  const fetchTaskStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-task?taskId=${id}`);
      const data = await res.json();
      
      if (data.success && data.data.task) {
        const taskData = data.data.task;
        setTask(taskData);
        
        // 检查任务是否完成
        if (taskData.status === 'completed') {
          setIsPolling(false);
          onTaskComplete?.();
        } else if (taskData.status === 'failed') {
          setIsPolling(false);
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
      const res = await fetch(`/api/projects/${projectId}/extraction-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentName }),
      });
      const data = await res.json();
      
      if (data.success) {
        setTaskId(data.data.taskId);
        setIsPolling(true);
        setTimeElapsed(0);
        
        // 初始化任务状态
        if (data.data.task) {
          setTask(data.data.task);
        } else {
          setTask({
            id: data.data.taskId,
            status: 'pending',
            progress: 0,
            stage: '准备解析文档',
          });
        }
      } else {
        onTaskFailed?.(data.error || '启动任务失败');
      }
    } catch (error) {
      onTaskFailed?.(error instanceof Error ? error.message : '启动任务失败');
    }
  }, [projectId, documentName, onTaskFailed]);

  // 轮询任务状态
  useEffect(() => {
    if (!isPolling || !taskId) return;

    const interval = setInterval(() => {
      fetchTaskStatus(taskId);
    }, 2000); // 每2秒轮询一次

    return () => clearInterval(interval);
  }, [isPolling, taskId, fetchTaskStatus]);

  // 计时器
  useEffect(() => {
    if (!isPolling) return;

    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isPolling]);

  // 自动启动
  useEffect(() => {
    if (autoStart && !taskId && !task) {
      startTask();
    }
  }, [autoStart, taskId, task, startTask]);

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 获取当前阶段索引
  const getCurrentStageIndex = () => {
    if (!task) return 0;
    for (let i = progressStages.length - 1; i >= 0; i--) {
      if (task.progress >= progressStages[i].minProgress) {
        return i;
      }
    }
    return 0;
  };

  // 获取阶段图标
  const getStageIcon = (stageName: string) => {
    for (const [key, icon] of Object.entries(stageIcons)) {
      if (stageName.includes(key) || key.includes(stageName)) {
        return icon;
      }
    }
    return <Brain className="h-5 w-5" />;
  };

  // 如果没有任务且不自动启动，显示启动按钮
  if (!task && !autoStart) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">准备解析文档</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {documentName || '点击开始解析招标文档'}
              </p>
            </div>
            <Button onClick={startTask} size="lg">
              <RefreshCw className="h-4 w-4 mr-2" />
              开始解析
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 任务失败状态
  if (task?.status === 'failed') {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <CardTitle className="text-red-700">解析失败</CardTitle>
              <CardDescription className="text-red-600">
                {task.errorMessage || '文档解析过程中发生错误'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={startTask}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重新解析
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 任务完成状态
  if (task?.status === 'completed') {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-green-700">解析完成</CardTitle>
              <CardDescription className="text-green-600">
                文档已成功解析，可以查看提取结果
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  // 运行中状态 - 带进度条
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              {getStageIcon(task?.stage || '')}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                正在解析文档...
                {task?.status === 'running' && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <span>{task?.stage || '准备中'}</span>
                <span className="text-xs">•</span>
                <span>耗时 {formatTime(timeElapsed)}</span>
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-lg font-mono">
            {task?.progress || 0}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 主进度条 */}
        <div className="space-y-2">
          <Progress value={task?.progress || 0} className="h-3" />
          {task?.stageDetail && (
            <p className="text-xs text-muted-foreground">{task.stageDetail}</p>
          )}
        </div>

        {/* 阶段列表 */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {progressStages.map((stage, index) => {
            const isActive = index === getCurrentStageIndex();
            const isCompleted = task && task.progress >= stage.maxProgress;
            
            return (
              <div
                key={stage.name}
                className={`p-2 rounded-lg border transition-all ${
                  isCompleted 
                    ? 'border-green-200 bg-green-50 text-green-700' 
                    : isActive 
                      ? 'border-primary bg-primary/5 text-primary' 
                      : 'border-border text-muted-foreground'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {isCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border" />
                  )}
                  <span className="text-xs font-medium truncate">{stage.name}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 提示信息 */}
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>解析过程可能需要1-3分钟，您可以离开页面，任务会继续在后台运行</span>
        </div>
      </CardContent>
    </Card>
  );
}
