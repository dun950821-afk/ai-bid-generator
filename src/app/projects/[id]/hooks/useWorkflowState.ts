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
  // 内容生成进度 (0-100)
  contentProgress?: number;
  // 是否已校验
  hasValidated?: boolean;
  // 章节总数
  totalSections?: number;
  // 已生成章节数
  generatedCount?: number;
}

export function useWorkflowState(options: WorkflowStateOptions = {}): UseWorkflowStateReturn {
  const { 
    hasUploadedDoc, 
    hasExtracted, 
    hasOutline, 
    hasContent, 
    contentProgress,
    hasValidated,
    totalSections = 0,
    generatedCount = 0,
  } = options;
  
  // 当前步骤
  const [currentStep, setCurrentStep] = useState<WorkflowStepId>('upload');

  // 计算生成阶段是否完成（所有章节都已生成内容）
  const isGenerateComplete = useMemo(() => {
    if (totalSections === 0) return false;
    return generatedCount >= totalSections && totalSections > 0;
  }, [totalSections, generatedCount]);

  // 计算各步骤状态
  const steps = useMemo<WorkflowStep[]>(() => {
    // 阶段完成状态
    const uploadComplete = !!(hasUploadedDoc && hasExtracted);
    const outlineComplete = !!(hasOutline && uploadComplete);
    const generateComplete = !!(isGenerateComplete && outlineComplete);
    const exportComplete = !!(hasValidated && generateComplete);

    return STEP_CONFIG.map((config) => {
      let status: WorkflowStep['status'] = 'pending';
      
      switch (config.id) {
        case 'upload':
          if (uploadComplete) {
            status = 'completed';
          } else {
            status = 'current';
          }
          break;
          
        case 'outline':
          if (outlineComplete) {
            status = 'completed';
          } else if (uploadComplete) {
            status = 'current';
          }
          // 否则保持 pending
          break;
          
        case 'generate':
          if (generateComplete) {
            status = 'completed';
          } else if (outlineComplete) {
            status = 'current';
          }
          // 否则保持 pending
          break;
          
        case 'export':
          if (exportComplete) {
            status = 'completed';
          } else if (generateComplete) {
            status = 'current';
          }
          // 否则保持 pending
          break;
      }
      
      return { ...config, status };
    });
  }, [hasUploadedDoc, hasExtracted, hasOutline, isGenerateComplete, hasValidated]);

  // 当前步骤索引
  const currentIndex = useMemo(() => {
    return steps.findIndex(s => s.id === currentStep);
  }, [steps, currentStep]);

  // 进度百分比 - 基于实际完成情况计算
  const progressPercent = useMemo(() => {
    let progress = 0;
    
    // 上传阶段完成 +25%
    if (hasUploadedDoc && hasExtracted) {
      progress += 25;
    } else if (hasUploadedDoc) {
      progress += 10; // 上传了但没提取完成
    }
    
    // 大纲阶段完成 +25%
    if (hasOutline) {
      progress += 25;
    }
    
    // 生成阶段 - 按比例计算 +25%
    if (totalSections > 0) {
      const generateRatio = generatedCount / totalSections;
      progress += Math.round(generateRatio * 25);
    }
    
    // 校验导出阶段完成 +25%
    if (hasValidated) {
      progress += 25;
    }
    
    return Math.min(progress, 100);
  }, [hasUploadedDoc, hasExtracted, hasOutline, totalSections, generatedCount, hasValidated]);

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

  // 是否可以跳转到某步骤
  const canGoToStep = useCallback((step: WorkflowStepId) => {
    const targetStep = steps.find(s => s.id === step);
    // 可以跳转到：已完成的步骤、当前步骤
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
