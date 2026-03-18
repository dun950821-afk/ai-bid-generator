'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileUpload, UploadFile } from '@/components/ui/file-upload';
import { ExtractionResultDisplay } from '@/components/extraction-result-display';
import { ExtractionProgress, TaskStatus } from '@/components/extraction-progress';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  Download,
  Upload,
  ChevronRight,
  Loader2,
  Settings,
  FileSearch,
  LayoutDashboard,
  Sparkles,
  ShieldCheck,
  FileOutput,
  Plus,
  FolderOpen,
  Target,
  Zap,
  Eye,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Database,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  project_number: string;
  status: string;
  knowledge_base_id: string;
  metadata: {
    uploadedDocument?: {
      name: string;
      url: string;
      extracted: boolean;
      extractError?: string;
      uploadedAt?: string;
    };
    [key: string]: any;
  };
  created_at: string;
}

interface ScoringItem {
  id: string;
  item_name: string;
  item_type: string;
  max_score: number;
  scoring_rules: Array<any>;
  response_status: string;
  chapter_id?: string;
}

interface Risk {
  id: string;
  risk_type: string;
  risk_description: string;
  severity: string;
  response_status: string;
}

interface Section {
  id: string;
  title: string;
  order: number;
  parent_id?: string;
  content?: string;
  status: string;
  scoring_item_ids?: string[];
  children?: Section[];
}

interface ValidationResult {
  overallScore: number;
  overallPassed: boolean;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // 数据状态
  const [project, setProject] = useState<Project | null>(null);
  const [scoringItems, setScoringItems] = useState<ScoringItem[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [coverageReport, setCoverageReport] = useState<any>(null);
  
  // 提取结果状态
  const [extractionResult, setExtractionResult] = useState<any>(null);
  
  // 后台任务状态
  const [taskId, setTaskId] = useState<string | null>(null);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [isNewUpload, setIsNewUpload] = useState(false); // 标记是否为新上传的文件
  
  // 加载状态
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [generatingContent, setGeneratingContent] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // 对话框状态
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [documentText, setDocumentText] = useState('');
  const [uploadFileDialogOpen, setUploadFileDialogOpen] = useState(false);
  
  // 上传状态
  const [uploadedDocument, setUploadedDocument] = useState<{
    name: string;
    url: string;
    extracted: boolean;
    extractError?: string;
  } | null>(null);
  const [uploadResetKey, setUploadResetKey] = useState(0); // 用于重置FileUpload组件

  // 加载数据
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
        // 从项目 metadata 恢复上传的文档信息
        if (projectData.data.metadata?.uploadedDocument) {
          setUploadedDocument(projectData.data.metadata.uploadedDocument);
        }
      }
      if (scoringData.success) {
        setScoringItems(scoringData.data.items || []);
      }
      if (risksData.success) setRisks(risksData.data.risks || []);
      if (outlineData.success) setSections(outlineData.data.sections || []);
      if (validationData.success && validationData.data.summary) {
        setValidationResult({
          overallScore: validationData.data.summary.overallScore || 0,
          overallPassed: validationData.data.summary.overallPassed || false,
          criticalIssues: validationData.data.summary.criticalIssues || 0,
          highIssues: validationData.data.summary.highIssues || 0,
          mediumIssues: validationData.data.summary.mediumIssues || 0,
          lowIssues: validationData.data.summary.lowIssues || 0,
        });
      }
      if (coverageData.success) {
        setCoverageReport(coverageData.data.coverage);
      }
      // 加载提取结果
      if (extractionData.success && extractionData.data.hasResult) {
        setExtractionResult(extractionData.data.extractionResult);
      }
    } catch (error) {
      console.error('获取项目数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  // 上传文件并提取
  const handleUploadComplete = async (files: UploadFile[]) => {
    // 找到成功的文件并提取内容
    const successFiles = files.filter(f => f.status === 'success' && f.response);
    
    if (successFiles.length === 0) return;
    
    // 保存上传的文档信息
    const uploadFile = successFiles[0];
    const fileUrl = uploadFile.response?.accessUrl || uploadFile.response?.url;
    
    setUploadedDocument({
      name: uploadFile.file.name,
      url: fileUrl,
      extracted: false,
    });
    
    // 标记为新上传
    setIsNewUpload(true);
    
    // 启动后台提取任务
    await startExtractionTask(fileUrl, uploadFile.file.name);
  };

  // 启动后台提取任务
  const startExtractionTask = async (fileUrl: string, fileName: string) => {
    setExtracting(true);
    
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentUrl: fileUrl,
          documentName: fileName,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setTaskId(data.data.taskId);
        // 任务已启动，后续通过轮询获取进度
      } else {
        setUploadedDocument(prev => prev ? { ...prev, extracted: false, extractError: data.error } : null);
        setExtracting(false);
      }
    } catch (error) {
      console.error('启动提取任务失败:', error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      setUploadedDocument(prev => prev ? { ...prev, extracted: false, extractError: errorMsg } : null);
      setExtracting(false);
    }
  };

  // 提取任务完成回调
  const handleTaskComplete = useCallback(() => {
    setExtracting(false);
    setIsNewUpload(false); // 重置新上传标记
    setUploadedDocument(prev => prev ? { ...prev, extracted: true, extractError: undefined } : null);
    fetchProjectData();
  }, [fetchProjectData]);

  // 提取任务失败回调
  const handleTaskFailed = useCallback((error: string) => {
    setExtracting(false);
    setIsNewUpload(false); // 重置新上传标记
    setUploadedDocument(prev => prev ? { ...prev, extracted: false, extractError: error } : null);
  }, []);

  // 提取文档内容（保留用于手动触发）
  const handleExtractDocument = async (fileUrl?: string, fileName?: string) => {
    const url = fileUrl || uploadedDocument?.url;
    const name = fileName || uploadedDocument?.name;
    
    if (!url) return;
    
    await startExtractionTask(url, name || '招标文档');
  };

  // 文本提取
  const handleTextExtract = async () => {
    if (!documentText.trim()) return;

    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText,
          documentName: '招标文档',
          extractionType: 'full',
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
        setExtractDialogOpen(false);
        setDocumentText('');
        alert('提取成功！');
      } else {
        alert('提取失败：' + data.error);
      }
    } catch (error) {
      console.error('提取失败:', error);
      alert('提取失败');
    } finally {
      setExtracting(false);
    }
  };

  // 生成大纲
  const handleGenerateOutline = async () => {
    setGeneratingOutline(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
        alert('大纲生成成功！');
      } else {
        alert('生成失败：' + data.error);
      }
    } catch (error) {
      console.error('生成大纲失败:', error);
      alert('生成失败');
    } finally {
      setGeneratingOutline(false);
    }
  };

  // 生成章节内容
  const handleGenerateSectionContent = async (sectionId: string) => {
    setGeneratingContent(sectionId);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useKnowledge: true }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
        alert('内容生成成功！');
      } else {
        alert('生成失败：' + data.error);
      }
    } catch (error) {
      console.error('生成内容失败:', error);
      alert('生成失败');
    } finally {
      setGeneratingContent(null);
    }
  };

  // 一键生成所有内容
  const handleGenerateAllContent = async () => {
    if (sections.length === 0) {
      alert('请先生成大纲');
      return;
    }

    setGeneratingContent('all');
    try {
      // 逐个生成章节内容
      for (const section of sections) {
        if (!section.content) {
          await fetch(`/api/projects/${projectId}/sections/${section.id}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ useKnowledge: true }),
          });
        }
      }
      fetchProjectData();
      alert('全部内容生成完成！');
    } catch (error) {
      console.error('批量生成失败:', error);
      alert('批量生成失败');
    } finally {
      setGeneratingContent(null);
    }
  };

  // 执行校验
  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: ['compliance', 'score_coverage', 'logic_consistency', 'disqualification', 'citation']
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
        alert('校验完成！');
      } else {
        alert('校验失败：' + data.error);
      }
    } catch (error) {
      console.error('校验失败:', error);
      alert('校验失败');
    } finally {
      setValidating(false);
    }
  };

  // 导出文档
  const handleExport = async (format: 'markdown' | 'html' | 'docx') => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      if (data.success) {
        const blob = new Blob([data.data.content], {
          type: format === 'markdown' ? 'text/markdown' : format === 'html' ? 'text/html' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.data.fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('导出失败：' + data.error);
      }
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 计算流程进度
  const getStepStatus = () => {
    const hasScoringItems = scoringItems.length > 0;
    const hasOutline = sections.length > 0;
    const hasContent = sections.some(s => s.content);
    const hasValidation = validationResult !== null;
    const hasUploadedDoc = uploadedDocument !== null;

    return {
      upload: hasScoringItems ? 'completed' : hasUploadedDoc ? 'uploaded' : 'pending',
      outline: hasOutline ? 'completed' : hasScoringItems ? 'current' : 'pending',
      content: hasContent ? 'completed' : hasOutline ? 'current' : 'pending',
      validate: hasValidation ? 'completed' : hasContent ? 'current' : 'pending',
    };
  };

  const stepStatus = getStepStatus();

  // 计算统计
  const summary = {
    totalScore: scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0),
    technicalScore: scoringItems.filter(i => i.item_type === 'technical').reduce((sum, item) => sum + (item.max_score || 0), 0),
    businessScore: scoringItems.filter(i => i.item_type === 'business').reduce((sum, item) => sum + (item.max_score || 0), 0),
    priceScore: scoringItems.filter(i => i.item_type === 'price').reduce((sum, item) => sum + (item.max_score || 0), 0),
    technicalCount: scoringItems.filter(i => i.item_type === 'technical').length,
    businessCount: scoringItems.filter(i => i.item_type === 'business').length,
    priceCount: scoringItems.filter(i => i.item_type === 'price').length,
    criticalRisks: risks.filter(r => r.severity === 'critical').length,
    highRisks: risks.filter(r => r.severity === 'high').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">项目不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{project.name}</h1>
                  <Badge variant={project.status === 'completed' ? 'default' : 'secondary'}>
                    {project.status === 'draft' ? '草稿' : 
                     project.status === 'processing' ? '处理中' : 
                     project.status === 'completed' ? '已完成' : project.status}
                  </Badge>
                </div>
                {project.project_number && (
                  <p className="text-sm text-muted-foreground">编号: {project.project_number}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/extraction-management`)}>
                <FileSearch className="h-4 w-4 mr-2" />
                提取管理
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/validation`)}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                校验报告
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push('/settings')}>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 流程步骤 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">标书生成流程</CardTitle>
            <CardDescription>按照以下步骤完成标书制作</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {/* Step 1: 上传招标文档 */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${
                stepStatus.upload === 'completed' ? 'border-green-500 bg-green-50/50' :
                stepStatus.upload === 'uploaded' ? 'border-blue-500 bg-blue-50/50' :
                stepStatus.upload === 'current' ? 'border-primary bg-primary/5' : 'border-border'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    stepStatus.upload === 'completed' ? 'bg-green-500 text-white' :
                    stepStatus.upload === 'uploaded' ? 'bg-blue-500 text-white' :
                    stepStatus.upload === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {stepStatus.upload === 'completed' ? <CheckCircle className="h-5 w-5" /> : 
                     stepStatus.upload === 'uploaded' ? <FileText className="h-5 w-5" /> : '1'}
                  </div>
                  <div>
                    <h3 className="font-medium">上传招标文档</h3>
                    <p className="text-xs text-muted-foreground">提取评分项和风险</p>
                  </div>
                </div>
                
                {/* 未上传状态：显示上传按钮 */}
                {stepStatus.upload === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setUploadFileDialogOpen(true)}>
                      <Upload className="h-4 w-4 mr-1" />
                      上传文件
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setExtractDialogOpen(true)}>
                      粘贴文本
                    </Button>
                  </div>
                )}
                
                {/* 已上传但未提取状态：显示文件信息和解析按钮 */}
                {/* 使用新的进度条组件，统一管理所有状态 */}
                {(stepStatus.upload === 'uploaded' || extracting || stepStatus.upload === 'completed') && (
                  <ExtractionProgress
                    projectId={projectId}
                    taskId={taskId}
                    documentName={uploadedDocument?.name}
                    isNewUpload={isNewUpload}
                    onTaskComplete={handleTaskComplete}
                    onTaskFailed={handleTaskFailed}
                    onUploadNew={() => setUploadFileDialogOpen(true)}
                  />
                )}
              </div>

              {/* Step 2: 生成标书大纲 */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${
                stepStatus.outline === 'completed' ? 'border-green-500 bg-green-50/50' :
                stepStatus.outline === 'current' ? 'border-primary bg-primary/5' : 'border-border opacity-60'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    stepStatus.outline === 'completed' ? 'bg-green-500 text-white' :
                    stepStatus.outline === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {stepStatus.outline === 'completed' ? <CheckCircle className="h-5 w-5" /> : '2'}
                  </div>
                  <div>
                    <h3 className="font-medium">生成标书大纲</h3>
                    <p className="text-xs text-muted-foreground">基于评分项生成结构</p>
                  </div>
                </div>
                {stepStatus.outline !== 'completed' && (
                  <Button 
                    size="sm" 
                    onClick={handleGenerateOutline}
                    disabled={stepStatus.outline === 'pending' || generatingOutline}
                  >
                    {generatingOutline ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FolderOpen className="h-4 w-4 mr-1" />}
                    生成大纲
                  </Button>
                )}
                {stepStatus.outline === 'completed' && (
                  <div className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    已生成 {sections.length} 个章节
                  </div>
                )}
              </div>

              {/* Step 3: AI生成内容 */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${
                stepStatus.content === 'completed' ? 'border-green-500 bg-green-50/50' :
                stepStatus.content === 'current' ? 'border-primary bg-primary/5' : 'border-border opacity-60'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    stepStatus.content === 'completed' ? 'bg-green-500 text-white' :
                    stepStatus.content === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {stepStatus.content === 'completed' ? <CheckCircle className="h-5 w-5" /> : '3'}
                  </div>
                  <div>
                    <h3 className="font-medium">AI生成内容</h3>
                    <p className="text-xs text-muted-foreground">结合知识库生成章节</p>
                  </div>
                </div>
                {stepStatus.content !== 'completed' && (
                  <Button 
                    size="sm" 
                    onClick={handleGenerateAllContent}
                    disabled={stepStatus.content === 'pending' || generatingContent === 'all'}
                  >
                    {generatingContent === 'all' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    一键生成
                  </Button>
                )}
                {stepStatus.content === 'completed' && (
                  <div className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    内容已生成
                  </div>
                )}
              </div>

              {/* Step 4: 校验导出 */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${
                stepStatus.validate === 'completed' ? 'border-green-500 bg-green-50/50' :
                stepStatus.validate === 'current' ? 'border-primary bg-primary/5' : 'border-border opacity-60'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    stepStatus.validate === 'completed' ? 'bg-green-500 text-white' :
                    stepStatus.validate === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {stepStatus.validate === 'completed' ? <CheckCircle className="h-5 w-5" /> : '4'}
                  </div>
                  <div>
                    <h3 className="font-medium">校验导出</h3>
                    <p className="text-xs text-muted-foreground">质量检查与导出</p>
                  </div>
                </div>
                {stepStatus.validate !== 'completed' && (
                  <Button 
                    size="sm" 
                    onClick={handleValidate}
                    disabled={stepStatus.validate === 'pending' || validating}
                  >
                    {validating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                    执行校验
                  </Button>
                )}
                {stepStatus.validate === 'completed' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleExport('markdown')} disabled={exporting}>
                      <Download className="h-4 w-4 mr-1" />
                      导出MD
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport('html')} disabled={exporting}>
                      导出HTML
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">评分总分</p>
                  <p className="text-2xl font-bold">{summary.totalScore}</p>
                </div>
                <Target className="h-8 w-8 text-primary" />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                技术 {summary.technicalScore} · 商务 {summary.businessScore} · 价格 {summary.priceScore}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">评分项</p>
                  <p className="text-2xl font-bold">{scoringItems.length}</p>
                </div>
                <Zap className="h-8 w-8 text-orange-500" />
              </div>
              <div className="mt-2">
                <Progress 
                  value={coverageReport?.coverageRate || 0} 
                  className="h-1"
                />
                <span className="text-xs text-muted-foreground">
                  覆盖率 {coverageReport?.coverageRate?.toFixed(0) || 0}%
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">废标风险</p>
                  <p className="text-2xl font-bold">{risks.length}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
              {(summary.criticalRisks > 0 || summary.highRisks > 0) && (
                <div className="mt-2 text-xs text-red-600">
                  致命 {summary.criticalRisks} · 高危 {summary.highRisks}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">校验得分</p>
                  <p className="text-2xl font-bold">
                    {validationResult ? validationResult.overallScore.toFixed(0) : '-'}
                  </p>
                </div>
                <ShieldCheck className={`h-8 w-8 ${validationResult?.overallPassed ? 'text-green-500' : 'text-muted-foreground'}`} />
              </div>
              {validationResult && (
                <div className="mt-2 text-xs text-muted-foreground">
                  问题：{validationResult.criticalIssues + validationResult.highIssues} 个严重
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 标签页内容 */}
        <Tabs defaultValue="sections" className="space-y-4">
          <TabsList>
            <TabsTrigger value="extraction">
              <Database className="h-4 w-4 mr-2" />
              提取结果
            </TabsTrigger>
            <TabsTrigger value="sections">
              <FolderOpen className="h-4 w-4 mr-2" />
              章节内容
            </TabsTrigger>
            <TabsTrigger value="scoring">
              <Target className="h-4 w-4 mr-2" />
              评分项
            </TabsTrigger>
            <TabsTrigger value="risks">
              <AlertTriangle className="h-4 w-4 mr-2" />
              废标风险
            </TabsTrigger>
            <TabsTrigger value="tools">
              <Settings className="h-4 w-4 mr-2" />
              高级功能
            </TabsTrigger>
          </TabsList>

          {/* 提取结果 */}
          <TabsContent value="extraction">
            <ExtractionResultDisplay extractionResult={extractionResult} />
          </TabsContent>

          {/* 章节内容 */}
          <TabsContent value="sections">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>标书章节</CardTitle>
                    <CardDescription>管理标书结构和内容</CardDescription>
                  </div>
                  {sections.length > 0 && (
                    <Button onClick={handleGenerateAllContent} disabled={generatingContent === 'all'}>
                      {generatingContent === 'all' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      一键生成所有内容
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {sections.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-4">暂无章节，请先上传招标文档并生成大纲</p>
                    <Button onClick={handleGenerateOutline} disabled={scoringItems.length === 0 || generatingOutline}>
                      {generatingOutline ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FolderOpen className="h-4 w-4 mr-2" />
                      )}
                      生成大纲
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {sections.map((section) => (
                        <div
                          key={section.id}
                          className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{section.order}. {section.title}</span>
                                {section.content && (
                                  <Badge variant="outline" className="text-green-600 border-green-200">
                                    已生成
                                  </Badge>
                                )}
                                {section.scoring_item_ids && section.scoring_item_ids.length > 0 && (
                                  <Badge variant="secondary">
                                    {section.scoring_item_ids.length} 个评分项
                                  </Badge>
                                )}
                              </div>
                              {section.content && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {section.content.substring(0, 150)}...
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {section.content ? (
                                <>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => router.push(`/projects/${projectId}/sections/${section.id}`)}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    查看
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleGenerateSectionContent(section.id)}
                                    disabled={generatingContent === section.id}
                                  >
                                    {generatingContent === section.id ? (
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-4 w-4 mr-1" />
                                    )}
                                    重新生成
                                  </Button>
                                </>
                              ) : (
                                <Button 
                                  size="sm"
                                  onClick={() => handleGenerateSectionContent(section.id)}
                                  disabled={generatingContent === section.id}
                                >
                                  {generatingContent === section.id ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4 mr-1" />
                                  )}
                                  AI生成
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 评分项 */}
          <TabsContent value="scoring">
            <Card>
              <CardHeader>
                <CardTitle>评分项列表</CardTitle>
                <CardDescription>
                  技术 {summary.technicalCount}项({summary.technicalScore}分) · 
                  商务 {summary.businessCount}项({summary.businessScore}分) · 
                  价格 {summary.priceCount}项({summary.priceScore}分)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scoringItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>暂无评分项，请上传招标文档并提取</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {scoringItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={
                                item.item_type === 'technical' ? 'default' :
                                item.item_type === 'business' ? 'secondary' : 'outline'
                              }>
                                {item.item_type === 'technical' ? '技术' :
                                 item.item_type === 'business' ? '商务' : '价格'}
                              </Badge>
                              <span className="font-medium">{item.item_name}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <span>满分: {item.max_score}分</span>
                              {item.scoring_rules && item.scoring_rules.length > 0 && (
                                <span>· {item.scoring_rules.length}条细则</span>
                              )}
                              {item.chapter_id && (
                                <Badge variant="outline" className="text-green-600">已关联章节</Badge>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 废标风险 */}
          <TabsContent value="risks">
            <Card>
              <CardHeader>
                <CardTitle>废标风险列表</CardTitle>
                <CardDescription>按严重程度排列，请确保所有风险项都已响应</CardDescription>
              </CardHeader>
              <CardContent>
                {risks.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>暂无废标风险</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {risks.sort((a, b) => {
                        const order = { critical: 0, high: 1, medium: 2, low: 3 };
                        return order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order];
                      }).map((risk) => (
                        <div
                          key={risk.id}
                          className="p-3 rounded-lg border"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={
                                risk.severity === 'critical' ? 'destructive' :
                                risk.severity === 'high' ? 'default' : 'secondary'
                              }>
                                {risk.severity === 'critical' ? '致命' :
                                 risk.severity === 'high' ? '高' :
                                 risk.severity === 'medium' ? '中' : '低'}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{risk.risk_type}</span>
                            </div>
                            <Badge variant={risk.response_status === 'verified' ? 'default' : 'outline'}>
                              {risk.response_status === 'verified' ? '已验证' :
                               risk.response_status === 'responded' ? '已响应' : '未响应'}
                            </Badge>
                          </div>
                          <p className="text-sm">{risk.risk_description}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 高级功能 */}
          <TabsContent value="tools">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push(`/projects/${projectId}/extraction-management`)}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileSearch className="h-5 w-5 text-primary" />
                    提取结果管理
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    管理招标文档提取结果，支持版本对比、人工修正
                  </p>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push(`/projects/${projectId}/validation`)}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    内容校验报告
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    多维度校验标书内容质量，包括合规、覆盖、一致性等
                  </p>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push(`/projects/${projectId}/extract`)}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    智能提取
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    使用AI智能提取招标文档中的关键信息
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    映射矩阵
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    查看招标要素到标书章节的映射关系
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                    const res = await fetch(`/api/projects/${projectId}/mapping-matrix`);
                    const data = await res.json();
                    if (data.success) {
                      alert('映射矩阵：' + JSON.stringify(data.data, null, 2));
                    }
                  }}>
                    查看映射
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-primary" />
                    废标风险管理
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    识别和管理可能导致废标的风险项
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                    const res = await fetch(`/api/projects/${projectId}/disqualification-risks`);
                    const data = await res.json();
                    if (data.success) {
                      alert('风险列表：' + JSON.stringify(data.data, null, 2));
                    }
                  }}>
                    查看风险
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileOutput className="h-5 w-5 text-primary" />
                    导出设置
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    选择格式导出标书文档
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => handleExport('markdown')} disabled={exporting}>
                      MD
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport('html')} disabled={exporting}>
                      HTML
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport('docx')} disabled={exporting}>
                      DOCX
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* 上传文件对话框 */}
      <Dialog open={uploadFileDialogOpen} onOpenChange={(open) => {
        setUploadFileDialogOpen(open);
        if (!open) {
          // 关闭时重置状态
          setUploadedDocument(null);
        }
      }}>
        <DialogContent className="sm:max-w-xl h-[520px] p-0 overflow-hidden border-0 shadow-2xl flex flex-col">
          {/* 标题区域 - 固定高度 */}
          <div className="flex-shrink-0 p-6 pb-4 border-b border-gray-100">
            <DialogHeader>
              <DialogTitle className="text-xl">上传招标文档</DialogTitle>
              <DialogDescription className="text-gray-500 mt-2">
                支持 PDF、Word、TXT 格式的招标文档，上传后将自动提取评分项和废标风险
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* 内容区域 - 紧凑布局 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50/50">
            <div className="flex flex-col gap-3">
              <FileUpload
                key={uploadResetKey}
                uploadUrl="/api/upload"
                accept=".pdf,.doc,.docx,.txt"
                multiple={false}
                maxSize={50}
                maxFiles={1}
                extraData={{ projectId }}
                onComplete={handleUploadComplete}
                hint="拖拽文件到此处或点击选择"
              />
              
              {/* 文档解析状态 - 紧跟在上传组件下方 */}
              {uploadedDocument && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className={`flex items-start gap-3 p-4 rounded-xl border ${
                    uploadedDocument.extractError 
                      ? 'border-red-200 bg-red-50/80'
                      : uploadedDocument.extracted
                      ? 'border-green-200 bg-green-50/80'
                      : 'border-blue-200 bg-blue-50/80'
                  }`}>
                    <FileText className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      uploadedDocument.extractError ? 'text-red-500' : uploadedDocument.extracted ? 'text-green-500' : 'text-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{uploadedDocument.name}</p>
                      
                      {uploadedDocument.extractError ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-1.5 text-red-600 text-sm">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span className="font-medium">解析失败</span>
                          </div>
                          <p className="text-xs text-red-500 mt-1">{uploadedDocument.extractError}</p>
                        </div>
                      ) : uploadedDocument.extracted ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-1.5 text-green-600 text-sm">
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                            <span className="font-medium">解析完成</span>
                          </div>
                          <p className="text-xs text-green-500 mt-1">评分项和风险已提取，可关闭对话框查看</p>
                        </div>
                      ) : extracting ? (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2 text-blue-600 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                            <span className="font-medium">正在解析文档...</span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                              <span>读取内容</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                              <span>提取评分项</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                              <span>识别风险</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <Button 
                            size="sm"
                            onClick={() => handleExtractDocument()}
                            disabled={extracting}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            开始分析
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 已上传文件后的操作按钮 */}
                  {!uploadedDocument.extracted && (
                    <div className="flex gap-2 mt-2">
                      {uploadedDocument.extractError && (
                        <Button 
                          size="sm"
                          onClick={() => handleExtractDocument()}
                          disabled={extracting}
                        >
                          {extracting ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          重新解析
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setUploadedDocument(null);
                          setUploadResetKey(prev => prev + 1);
                        }}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        重新上传
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 底部按钮 - 固定高度 */}
          <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-slate-50/50">
            <Button variant="outline" className="w-full" onClick={() => setUploadFileDialogOpen(false)}>
              {uploadedDocument?.extractError ? '取消' : '关闭'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 粘贴文本对话框 */}
      <Dialog open={extractDialogOpen} onOpenChange={setExtractDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>粘贴招标文档内容</DialogTitle>
            <DialogDescription>
              粘贴招标文档的文本内容，系统将自动提取评分项和废标风险
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="请粘贴招标文档内容..."
              className="min-h-[300px]"
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtractDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleTextExtract} disabled={extracting || !documentText.trim()}>
              {extracting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              开始提取
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
