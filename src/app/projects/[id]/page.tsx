'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Settings, FileSearch, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadFile } from '@/components/ui/file-upload';
import KnowledgeDocumentSelector from '@/components/ui/knowledge-document-selector';
import ReextractDialog from '@/components/ui/reextract-dialog';

// 导入自定义hooks
import { useProjectData, useWorkflowState } from './hooks';

// 导入组件
import { WorkflowNav, QuickStats, SectionTree } from './components/shared';
import { UploadStage, OutlineStage, GenerateStage, ExportStage } from './components/stages';
import { DetailPanel } from './components/panels';

// 导入类型
import type { 
  Project, 
  Section, 
  WorkflowStepId, 
  UploadedDocument as UploadedDocType 
} from './types';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // 使用自定义hooks获取数据
  const {
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
  } = useProjectData(projectId);

  // 上传文档状态
  const [uploadedDocument, setUploadedDocument] = useState<UploadedDocType | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isNewUpload, setIsNewUpload] = useState(false);

  // 生成状态
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [generatingContent, setGeneratingContent] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 工作流状态
  const workflowState = useWorkflowState({
    hasUploadedDoc: !!uploadedDocument,
    hasExtracted: uploadedDocument?.extracted,
    hasOutline: sections.length > 0,
    hasContent: sections.some(s => s.content),
    hasValidated: !!validationResult,
  });

  // 选中的章节
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // 对话框状态
  const [sectionEditDialogOpen, setSectionEditDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionFormData, setSectionFormData] = useState({
    title: '',
    requirements: '',
    precautions: '',
    wordCount: 800,
  });
  const [savingSection, setSavingSection] = useState(false);

  // 新增章节
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [addSectionDialogOpen, setAddSectionDialogOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  // 知识库选择
  const [knowledgeFileSelectOpen, setKnowledgeFileSelectOpen] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  // 重新提取弹窗
  const [reextractDialogOpen, setReextractDialogOpen] = useState(false);

  // 从项目metadata恢复上传的文档信息
  useEffect(() => {
    if (project?.metadata?.uploadedDocument) {
      setUploadedDocument(project.metadata.uploadedDocument);
    }
  }, [project]);

  // 计算统计摘要
  const summary = useMemo(() => {
    const totalScore = scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
    const technicalScore = scoringItems.filter(i => i.item_type === 'technical').reduce((sum, item) => sum + (item.max_score || 0), 0);
    const businessScore = scoringItems.filter(i => i.item_type === 'business').reduce((sum, item) => sum + (item.max_score || 0), 0);
    const priceScore = scoringItems.filter(i => i.item_type === 'price').reduce((sum, item) => sum + (item.max_score || 0), 0);
    const technicalCount = scoringItems.filter(i => i.item_type === 'technical').length;
    const businessCount = scoringItems.filter(i => i.item_type === 'business').length;
    const priceCount = scoringItems.filter(i => i.item_type === 'price').length;
    const criticalRisks = risks.filter(r => r.severity === 'critical').length;
    const highRisks = risks.filter(r => r.severity === 'high').length;

    // 计算生成进度
    const countGenerated = (sections: Section[]): number => {
      let count = 0;
      for (const s of sections) {
        if (s.content) count++;
        if (s.children) count += countGenerated(s.children);
      }
      return count;
    };
    const countTotal = (sections: Section[]): number => {
      let count = sections.length;
      for (const s of sections) {
        if (s.children) count += countTotal(s.children);
      }
      return count;
    };

    return {
      totalScore,
      technicalScore,
      businessScore,
      priceScore,
      technicalCount,
      businessCount,
      priceCount,
      criticalRisks,
      highRisks,
      generatedCount: countGenerated(sections),
      totalSections: countTotal(sections),
    };
  }, [scoringItems, risks, sections]);

  // ============ 事件处理函数 ============

  // 上传完成
  const handleUploadComplete = useCallback(async (files: UploadFile[]) => {
    const successFiles = files.filter(f => f.status === 'success' && f.response);
    if (successFiles.length === 0) return;

    const uploadFile = successFiles[0];
    const fileUrl = uploadFile.response?.accessUrl || uploadFile.response?.url;
    const uploadId = uploadFile.response?.uploadId;

    setUploadedDocument({
      name: uploadFile.file.name,
      url: fileUrl,
      extracted: false,
    });
    setIsNewUpload(true);

    // 启动后台提取任务
    await startExtractionTask(fileUrl, uploadFile.file.name, uploadId);
  }, []);

  // 启动提取任务
  const startExtractionTask = async (fileUrl: string, fileName: string, uploadId?: string) => {
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentUrl: fileUrl,
          documentName: fileName,
          uploadId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTaskId(data.data.taskId);
      } else {
        setUploadedDocument(prev => prev ? { ...prev, extracted: false, extractError: data.error } : null);
        setExtracting(false);
      }
    } catch (error) {
      console.error('启动提取任务失败:', error);
      setUploadedDocument(prev => prev ? { ...prev, extracted: false, extractError: '启动失败' } : null);
      setExtracting(false);
    }
  };

  // 提取任务完成
  const handleTaskComplete = useCallback(() => {
    setExtracting(false);
    setIsNewUpload(false);
    setUploadedDocument(prev => prev ? { ...prev, extracted: true } : null);
    fetchProjectData();
  }, [fetchProjectData]);

  // 提取任务失败
  const handleTaskFailed = useCallback((error: string) => {
    setExtracting(false);
    setIsNewUpload(false);
    setUploadedDocument(prev => prev ? { ...prev, extracted: false, extractError: error } : null);
  }, []);

  // 生成大纲
  const handleGenerateOutline = useCallback(async () => {
    setGeneratingOutline(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectData();
      } else {
        alert('生成失败：' + data.error);
      }
    } catch (error) {
      console.error('生成大纲失败:', error);
      alert('生成失败');
    } finally {
      setGeneratingOutline(false);
    }
  }, [projectId, fetchProjectData]);

  // 章节生成完成
  const handleSectionGenerated = useCallback((sectionId: string, data: { content: string; wordCount: number; metadata: any }) => {
    updateSectionContent(sectionId, data);
  }, [updateSectionContent]);

  // 查看章节
  const handleViewSection = useCallback((sectionId: string) => {
    router.push(`/projects/${projectId}/sections/${sectionId}`);
  }, [projectId, router]);

  // 编辑章节
  const handleEditSection = useCallback((section: Section) => {
    setEditingSection(section);
    setSectionFormData({
      title: section.title,
      requirements: section.aiConfig?.requirements || '',
      precautions: section.aiConfig?.precautions || '',
      wordCount: section.aiConfig?.wordCount || 800,
    });
    setSectionEditDialogOpen(true);
  }, []);

  // 保存章节配置
  const handleSaveSectionConfig = useCallback(async () => {
    if (!editingSection) return;
    setSavingSection(true);
    try {
      const updateSection = (sections: Section[]): Section[] => {
        return sections.map(s => {
          if (s.id === editingSection.id) {
            return {
              ...s,
              title: sectionFormData.title,
              aiConfig: {
                requirements: sectionFormData.requirements,
                precautions: sectionFormData.precautions,
                wordCount: sectionFormData.wordCount,
              },
            };
          }
          if (s.children) {
            return { ...s, children: updateSection(s.children) };
          }
          return s;
        });
      };

      const updatedSections = updateSection(sections);
      
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: { sections: updatedSections } }),
      });
      
      const data = await res.json();
      if (data.success) {
        updateSections(updatedSections);
        setSectionEditDialogOpen(false);
        setEditingSection(null);
      } else {
        alert('保存失败：' + data.error);
      }
    } catch (error) {
      console.error('保存章节配置失败:', error);
      alert('保存失败');
    } finally {
      setSavingSection(false);
    }
  }, [editingSection, sectionFormData, sections, projectId, updateSections]);

  // 添加子章节
  const handleAddChild = useCallback((parentId: string) => {
    setNewParentId(parentId);
    setNewSectionTitle('');
    setSectionFormData({ title: '', requirements: '', precautions: '', wordCount: 800 });
    setAddSectionDialogOpen(true);
  }, []);

  // 添加一级章节
  const handleAddTopLevel = useCallback(() => {
    setNewParentId(null);
    setNewSectionTitle('');
    setSectionFormData({ title: '', requirements: '', precautions: '', wordCount: 800 });
    setAddSectionDialogOpen(true);
  }, []);

  // 确认添加章节
  const handleConfirmAddSection = useCallback(async () => {
    if (!newSectionTitle.trim()) {
      alert('请输入章节名称');
      return;
    }

    setSavingSection(true);
    try {
      const newId = `section-${Date.now()}`;
      let updatedSections: Section[];

      const aiConfig = {
        requirements: sectionFormData.requirements,
        precautions: sectionFormData.precautions,
        wordCount: sectionFormData.wordCount,
      };

      if (newParentId) {
        const addSection = (sections: Section[], parentId: string): Section[] => {
          return sections.map(s => {
            if (s.id === parentId) {
              const children = s.children || [];
              const newSection: Section = {
                id: newId,
                title: newSectionTitle,
                level: (s.level || 1) + 1,
                order: children.length + 1,
                parent_id: parentId,
                status: 'pending',
                children: [],
                aiConfig: aiConfig.requirements || aiConfig.precautions ? aiConfig : undefined,
              };
              return { ...s, children: [...children, newSection] };
            }
            if (s.children) {
              return { ...s, children: addSection(s.children, parentId) };
            }
            return s;
          });
        };
        updatedSections = addSection(sections, newParentId);
      } else {
        const newSection: Section = {
          id: newId,
          title: newSectionTitle,
          level: 1,
          order: sections.length + 1,
          status: 'pending',
          children: [],
          aiConfig: aiConfig.requirements || aiConfig.precautions ? aiConfig : undefined,
        };
        updatedSections = [...sections, newSection];
      }

      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: { sections: updatedSections } }),
      });
      
      const data = await res.json();
      if (data.success) {
        updateSections(updatedSections);
        setAddSectionDialogOpen(false);
        setNewParentId(null);
        setNewSectionTitle('');
        setSectionFormData({ title: '', requirements: '', precautions: '', wordCount: 800 });
      } else {
        alert('添加失败：' + data.error);
      }
    } catch (error) {
      console.error('添加章节失败:', error);
      alert('添加失败');
    } finally {
      setSavingSection(false);
    }
  }, [newSectionTitle, newParentId, sectionFormData, sections, projectId, updateSections]);

  // 删除章节
  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (!confirm('确定要删除该章节吗？删除后无法恢复。')) return;

    try {
      const deleteSection = (sections: Section[]): Section[] => {
        return sections
          .filter(s => s.id !== sectionId)
          .map(s => {
            if (s.children) {
              return { ...s, children: deleteSection(s.children) };
            }
            return s;
          });
      };

      const updatedSections = deleteSection(sections);
      
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: { sections: updatedSections } }),
      });
      
      const data = await res.json();
      if (data.success) {
        updateSections(updatedSections);
      } else {
        alert('删除失败：' + data.error);
      }
    } catch (error) {
      console.error('删除章节失败:', error);
      alert('删除失败');
    }
  }, [sections, projectId, updateSections]);

  // 选择章节
  const handleSelectSection = useCallback((section: Section) => {
    setSelectedSection(section);
    setDetailPanelOpen(true);
  }, []);

  // 执行校验
  const handleValidate = useCallback(async () => {
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
      } else {
        alert('校验失败：' + data.error);
      }
    } catch (error) {
      console.error('校验失败:', error);
      alert('校验失败');
    } finally {
      setValidating(false);
    }
  }, [projectId, fetchProjectData]);

  // 导出文档
  const handleExport = useCallback(async (format: 'markdown' | 'html' | 'docx') => {
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
  }, [projectId]);

  // 选择知识库文档
  const handleOpenKnowledgeFileSelect = useCallback(() => {
    if (sections.length === 0) {
      alert('请先生成大纲');
      return;
    }
    setSelectedDocumentIds([]);
    setKnowledgeFileSelectOpen(true);
  }, [sections.length]);

  // 确认选择文档
  const handleDocumentSelectConfirm = useCallback(async (documents: Array<{ id: string; knowledgeBaseId?: string }>) => {
    setSelectedDocumentIds(documents.map(d => d.id));
    setKnowledgeFileSelectOpen(false);
  }, []);

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 项目不存在
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
              <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/extract`)}>
                <FileSearch className="h-4 w-4 mr-2" />
                招标分析
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

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 工作流导航 */}
        <WorkflowNav
          steps={workflowState.steps}
          currentStep={workflowState.currentStep}
          progressPercent={workflowState.progressPercent}
          onStepChange={workflowState.setCurrentStep}
          canGoToStep={workflowState.canGoToStep}
        />

        {/* 快捷统计 */}
        <QuickStats
          summary={summary}
          validationResult={validationResult}
          coverageReport={coverageReport}
        />

        {/* 当前阶段内容 */}
        {workflowState.currentStep === 'upload' && (
          <UploadStage
            projectId={projectId}
            uploadedDocument={uploadedDocument}
            extracting={extracting}
            taskId={taskId}
            isNewUpload={isNewUpload}
            extractionResult={extractionResult}
            onUploadComplete={handleUploadComplete}
            onTaskComplete={handleTaskComplete}
            onTaskFailed={handleTaskFailed}
            onReextract={() => setReextractDialogOpen(true)}
            onUploadNew={() => {
              setUploadedDocument(null);
              setTaskId(null);
            }}
            onClearDocument={() => {
              setUploadedDocument(null);
            }}
            onNext={() => workflowState.setCurrentStep('outline')}
          />
        )}

        {workflowState.currentStep === 'outline' && (
          <OutlineStage
            projectId={projectId}
            sections={sections}
            hasUploadedDoc={!!uploadedDocument?.extracted}
            generating={generatingOutline}
            onGenerateOutline={handleGenerateOutline}
            onEditSection={handleEditSection}
            onAddChild={handleAddChild}
            onDeleteSection={handleDeleteSection}
            onAddTopLevel={handleAddTopLevel}
            onSelectSection={handleSelectSection}
            selectedSectionId={selectedSection?.id || null}
            onNext={() => workflowState.setCurrentStep('generate')}
          />
        )}

        {workflowState.currentStep === 'generate' && (
          <GenerateStage
            projectId={projectId}
            knowledgeBaseId={project?.knowledge_base_id || null}
            sections={sections}
            hasOutline={sections.length > 0}
            generating={generatingContent !== null}
            generatingSectionId={generatingContent}
            onSectionGenerated={handleSectionGenerated}
            onViewSection={handleViewSection}
            onSelectKnowledgeBase={handleOpenKnowledgeFileSelect}
            onNext={() => workflowState.setCurrentStep('export')}
          />
        )}

        {workflowState.currentStep === 'export' && (
          <ExportStage
            projectId={projectId}
            hasContent={sections.some(s => s.content)}
            validationResult={validationResult}
            validating={validating}
            exporting={exporting}
            scoringItems={scoringItems}
            risks={risks}
            extractionResult={extractionResult}
            onValidate={handleValidate}
            onExport={handleExport}
          />
        )}
      </main>

      {/* 详情面板 */}
      <DetailPanel
        isOpen={detailPanelOpen}
        onClose={() => setDetailPanelOpen(false)}
        selectedSection={selectedSection}
        scoringItems={scoringItems}
        risks={risks}
        onViewSection={handleViewSection}
      />

      {/* 章节配置弹窗 */}
      <Dialog open={sectionEditDialogOpen} onOpenChange={setSectionEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>配置生成参数</DialogTitle>
            <DialogDescription>
              为【{editingSection?.title}】设置 AI 生成规则
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>章节名称</Label>
              <Input
                value={sectionFormData.title}
                onChange={e => setSectionFormData({ ...sectionFormData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>生成要点</Label>
              <Textarea
                placeholder="告诉 AI 这段内容重点写什么..."
                value={sectionFormData.requirements}
                onChange={e => setSectionFormData({ ...sectionFormData, requirements: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>注意事项</Label>
                <Textarea
                  placeholder="需要避免的内容..."
                  value={sectionFormData.precautions}
                  onChange={e => setSectionFormData({ ...sectionFormData, precautions: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>预计字数</Label>
                <Input
                  type="number"
                  value={sectionFormData.wordCount}
                  onChange={e => setSectionFormData({ ...sectionFormData, wordCount: parseInt(e.target.value) || 800 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveSectionConfig} disabled={savingSection}>
              {savingSection && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加章节弹窗 */}
      <Dialog open={addSectionDialogOpen} onOpenChange={setAddSectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newParentId ? '添加子章节' : '添加一级章节'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>章节名称</Label>
              <Input
                value={newSectionTitle}
                onChange={e => setNewSectionTitle(e.target.value)}
                placeholder="请输入章节名称"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSectionDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmAddSection} disabled={savingSection}>
              {savingSection && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 知识库文件选择 */}
      <KnowledgeDocumentSelector
        isOpen={knowledgeFileSelectOpen}
        onOpenChange={(open) => setKnowledgeFileSelectOpen(open)}
        onConfirm={handleDocumentSelectConfirm}
        selectedIds={selectedDocumentIds}
      />

      {/* 重新提取弹窗 */}
      <ReextractDialog
        isOpen={reextractDialogOpen}
        onOpenChange={(open) => setReextractDialogOpen(open)}
        projectId={projectId}
        extractionResult={uploadedDocument ? {
          documentUrl: uploadedDocument.url,
          documentName: uploadedDocument.name,
        } : undefined}
        onReextractComplete={() => {
          setReextractDialogOpen(false);
          fetchProjectData();
        }}
      />
    </div>
  );
}
