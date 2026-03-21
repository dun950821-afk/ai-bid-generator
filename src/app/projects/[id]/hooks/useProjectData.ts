'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project, ScoringItem, Risk, Section, ValidationResult } from '../types';

interface UseProjectDataReturn {
  // 数据
  project: Project | null;
  scoringItems: ScoringItem[];
  risks: Risk[];
  sections: Section[];
  validationResult: ValidationResult | null;
  coverageReport: any;
  extractionResult: any;
  
  // 加载状态
  loading: boolean;
  
  // 操作方法
  fetchProjectData: () => Promise<void>;
  updateSectionContent: (sectionId: string, data: { content: string; wordCount: number; metadata: any }) => void;
  updateSections: (newSections: Section[]) => void;
}

export function useProjectData(projectId: string): UseProjectDataReturn {
  // 数据状态
  const [project, setProject] = useState<Project | null>(null);
  const [scoringItems, setScoringItems] = useState<ScoringItem[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [coverageReport, setCoverageReport] = useState<any>(null);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  
  // 加载状态
  const [loading, setLoading] = useState(true);

  // 加载所有数据
  const fetchProjectData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectRes, scoringRes, risksRes, outlineRes, validationRes, coverageRes, extractionRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/scoring-items`),
        fetch(`/api/projects/${projectId}/risks`),
        fetch(`/api/projects/${projectId}/outline`),
        fetch(`/api/projects/${projectId}/validation?latest=true`),
        fetch(`/api/projects/${projectId}/scoring-items?coverage=true`),
        fetch(`/api/projects/${projectId}/extract-tender`),
      ]);

      const projectData = await projectRes.json();
      const scoringData = await scoringRes.json();
      const risksData = await risksRes.json();
      const outlineData = await outlineRes.json();
      const validationData = await validationRes.json();
      const coverageData = await coverageRes.json();
      const extractionData = await extractionRes.json();

      if (projectData.success) {
        setProject(projectData.data);
      }
      if (scoringData.success) {
        setScoringItems(scoringData.data.items || []);
      }
      if (risksData.success) {
        setRisks(risksData.data.risks || []);
      }
      if (outlineData.success && outlineData.data.outline?.sections) {
        setSections(outlineData.data.outline.sections);
      }
      if (validationData.success && validationData.data.summary) {
        const summary = validationData.data.summary;
        const results = validationData.data.results || [];
        
        // 转换results格式
        const formattedResults = results.map((r: any) => ({
          validationType: r.validation_type,
          passed: r.passed,
          score: r.score,
          issues: r.issues || [],
          details: r.details || {},
        }));
        
        setValidationResult({
          overallScore: summary.overallScore || 0,
          overallPassed: summary.overallPassed || false,
          criticalIssues: summary.criticalIssues || 0,
          highIssues: summary.highIssues || 0,
          mediumIssues: summary.mediumIssues || 0,
          lowIssues: summary.lowIssues || 0,
          results: formattedResults,
        });
      }
      if (coverageData.success) {
        setCoverageReport(coverageData.data.coverage);
      }
      if (extractionData.success && extractionData.data.hasResult) {
        setExtractionResult(extractionData.data.extractionResult);
      }
    } catch (error) {
      console.error('获取项目数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 增量更新章节内容
  const updateSectionContent = useCallback((sectionId: string, data: { content: string; wordCount: number; metadata: any }) => {
    setSections(prev => {
      const updateSectionContentRecursive = (sections: Section[]): Section[] => {
        return sections.map(s => {
          if (s.id === sectionId) {
            return { ...s, content: data.content, status: 'completed' };
          }
          if (s.children) {
            return { ...s, children: updateSectionContentRecursive(s.children) };
          }
          return s;
        });
      };
      return updateSectionContentRecursive(prev);
    });
  }, []);

  // 更新整个章节列表
  const updateSections = useCallback((newSections: Section[]) => {
    setSections(newSections);
  }, []);

  // 初始加载
  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  return {
    project,
    scoringItems,
    risks,
    sections,
    validationResult,
    coverageReport,
    extractionResult,
    loading,
    fetchProjectData,
    updateSectionContent,
    updateSections,
  };
}
