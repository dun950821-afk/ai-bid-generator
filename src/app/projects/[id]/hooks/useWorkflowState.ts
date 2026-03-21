'use client';

import { useState, useMemo, useCallback } from 'react';
import type { WorkflowStepId, WorkflowStep } from '../types';

interface UseWorkflowStateReturn {
  // 当前步骤
  currentStep: WorkflowStepId;
  
  // 步骤状态列表
  steps: WorkflowStep[];
  
  // 当前步骤索引
  currentIndex: number;
  
  // 进度百分比
  progressPercent: number;
  
  // 操作方法
  setCurrentStep: (step: WorkflowStepId) => void;
  goToNextStep: () => void;
  goToPrevStep: () => void;
  canGoToStep: (step: WorkflowStepId) => boolean;
}

// 步骤配置
const STEP_CONFIG: Omit<WorkflowStep, 'status'>[] = [
  { id: 'upload', label: '上传文档', shortLabel: '上传', icon: 'upload' },
  { id: 'outline', label: '生成大纲', shortLabel: '大纲', icon: 'folder' },
  { id: 'generate', label: 'AI生成', shortLabel: '生成', icon: 'sparkles' },
  { id: 'export', label: '校验导出', shortLabel: '导出', icon: 'download' },
];

interface WorkflowStateOptions {
  // 是否已上传文档
  hasUploadedDoc?: boolean;
  // 是否已提取
  hasExtracted?: boolean;
  // 是否有大纲
  hasOutline?: boolean;
  // 是否有生成内容
  hasContent?: boolean;
  // 是否已校验
  hasValidated?: boolean;
}

export function useWorkflowState(options: WorkflowStateOptions = {}): UseWorkflowStateReturn {
  const { hasUploadedDoc, hasExtracted, hasOutline, hasContent, hasValidated } = options;
  
  // 当前步骤
  const [currentStep, setCurrentStep] = useState<WorkflowStepId>('upload');

  // 计算各步骤状态
  const steps = useMemo<WorkflowStep[]>(() => {
    // 计算当前应该在哪个步骤
    let autoCurrentStep: WorkflowStepId = 'upload';
    
    if (hasValidated) {
      autoCurrentStep = 'export';
    } else if (hasContent) {
      autoCurrentStep = 'export';
    } else if (hasOutline) {
      autoCurrentStep = 'generate';
    } else if (hasExtracted || hasUploadedDoc) {
      autoCurrentStep = 'outline';
    }
    
    return STEP_CONFIG.map((config, index) => {
      let status: WorkflowStep['status'] = 'pending';
      
      // 判断步骤状态
      switch (config.id) {
        case 'upload':
          if (hasUploadedDoc && hasExtracted) {
            status = 'completed';
          } else if (hasUploadedDoc) {
            status = 'current';
          } else {
            status = 'current';
          }
          break;
        case 'outline':
          if (hasOutline) {
            status = 'completed';
          } else if ((hasUploadedDoc && hasExtracted)) {
            status = 'current';
          }
          break;
        case 'generate':
          if (hasContent) {
            status = 'completed';
          } else if (hasOutline) {
            status = 'current';
          }
          break;
        case 'export':
          if (hasValidated) {
            status = 'completed';
          } else if (hasContent) {
            status = 'current';
          }
          break;
      }
      
      return { ...config, status };
    });
  }, [hasUploadedDoc, hasExtracted, hasOutline, hasContent, hasValidated]);

  // 当前步骤索引
  const currentIndex = useMemo(() => {
    return steps.findIndex(s => s.id === currentStep);
  }, [steps, currentStep]);

  // 进度百分比
  const progressPercent = useMemo(() => {
    const completedCount = steps.filter(s => s.status === 'completed').length;
    return Math.round((completedCount / steps.length) * 100);
  }, [steps]);

  // 前往下一步
  const goToNextStep = useCallback(() => {
    const idx = STEP_CONFIG.findIndex(s => s.id === currentStep);
    if (idx < STEP_CONFIG.length - 1) {
      setCurrentStep(STEP_CONFIG[idx + 1].id as WorkflowStepId);
    }
  }, [currentStep]);

  // 前往上一步
  const goToPrevStep = useCallback(() => {
    const idx = STEP_CONFIG.findIndex(s => s.id === currentStep);
    if (idx > 0) {
      setCurrentStep(STEP_CONFIG[idx - 1].id as WorkflowStepId);
    }
  }, [currentStep]);

  // 是否可以跳转到某步骤（只能跳转到已完成或当前步骤）
  const canGoToStep = useCallback((step: WorkflowStepId) => {
    const targetStep = steps.find(s => s.id === step);
    return targetStep?.status === 'completed' || targetStep?.status === 'current';
  }, [steps]);

  return {
    currentStep,
    steps,
    currentIndex,
    progressPercent,
    setCurrentStep,
    goToNextStep,
    goToPrevStep,
    canGoToStep,
  };
}
