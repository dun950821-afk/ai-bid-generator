'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FolderOpen,
  Sparkles,
  Download,
  CheckCircle,
  Circle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import type { WorkflowStep, WorkflowStepId } from '../../types';

interface WorkflowNavProps {
  steps: WorkflowStep[];
  currentStep: WorkflowStepId;
  progressPercent: number;
  onStepChange: (step: WorkflowStepId) => void;
  canGoToStep: (step: WorkflowStepId) => boolean;
}

// 图标映射
const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  upload: Upload,
  folder: FolderOpen,
  sparkles: Sparkles,
  download: Download,
};

/**
 * 工作流导航组件
 * 参考 Ant Design Steps 的导航式步骤条设计
 */
export function WorkflowNav({
  steps,
  currentStep,
  progressPercent,
  onStepChange,
  canGoToStep,
}: WorkflowNavProps) {
  return (
    <div className="bg-card border rounded-lg p-4">
      {/* 进度条 */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium">整体进度</span>
        <span className="text-sm text-muted-foreground">{progressPercent}%</span>
      </div>
      <Progress value={progressPercent} className="h-2 mb-4" />
      
      {/* 步骤条 */}
      <div className="flex items-start gap-1">
        {steps.map((step, index) => (
          <WorkflowStepItem
            key={step.id}
            step={step}
            index={index}
            isLast={index === steps.length - 1}
            isActive={step.id === currentStep}
            onClick={() => canGoToStep(step.id) && onStepChange(step.id)}
            canClick={canGoToStep(step.id)}
          />
        ))}
      </div>
    </div>
  );
}

// 单个步骤项
interface WorkflowStepItemProps {
  step: WorkflowStep;
  index: number;
  isLast: boolean;
  isActive: boolean;
  onClick: () => void;
  canClick: boolean;
}

function WorkflowStepItem({
  step,
  index,
  isLast,
  isActive,
  onClick,
  canClick,
}: WorkflowStepItemProps) {
  const Icon = STEP_ICONS[step.icon] || Circle;
  const isCompleted = step.status === 'completed';
  const isCurrent = step.status === 'current';
  const isPending = step.status === 'pending';

  return (
    <div className="flex-1 flex flex-col">
      {/* 步骤按钮 */}
      <button
        onClick={onClick}
        disabled={!canClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left w-full",
          canClick && "hover:bg-muted/50 cursor-pointer",
          !canClick && "cursor-not-allowed opacity-60",
          isActive && "bg-primary/10 border border-primary/30",
          isCompleted && !isActive && "bg-green-50 dark:bg-green-950/30",
        )}
      >
        {/* 步骤指示器 */}
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
            isCompleted && "bg-green-500 text-white",
            isCurrent && "bg-primary text-white",
            isPending && "bg-muted text-muted-foreground",
          )}
        >
          {isCompleted ? (
            <CheckCircle className="w-5 h-5" />
          ) : isCurrent ? (
            <Icon className="w-4 h-4" />
          ) : (
            <span className="text-sm font-medium">{index + 1}</span>
          )}
        </div>
        
        {/* 标签 */}
        <div className="flex-1 min-w-0">
          <div className={cn(
            "text-sm font-medium truncate",
            isActive && "text-primary",
            isCompleted && "text-green-600 dark:text-green-400",
            isPending && "text-muted-foreground",
          )}>
            {step.label}
          </div>
        </div>
        
        {/* 箭头（非最后一项） */}
        {!isLast && (
          <ChevronRight className={cn(
            "w-4 h-4 flex-shrink-0",
            isCompleted ? "text-green-400" : "text-muted-foreground/50",
          )} />
        )}
      </button>
      
      {/* 当前步骤的操作提示 */}
      {isCurrent && (
        <div className="mt-2 px-3">
          <Badge variant="outline" className="text-xs">
            当前阶段
          </Badge>
        </div>
      )}
    </div>
  );
}

export default WorkflowNav;
