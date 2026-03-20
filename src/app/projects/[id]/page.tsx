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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload, UploadFile } from '@/components/ui/file-upload';
import { TenderExtractionView } from '@/components/tender-extraction-view';
import { ExtractionProgress, TaskStatus } from '@/components/extraction-progress';
import KnowledgeDocumentSelector from '@/components/ui/knowledge-document-selector';
import ReextractDialog from '@/components/ui/reextract-dialog';
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
  ChevronDown,
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
  Lightbulb,
  Search,
  Edit2,
  Trash2,
  GripVertical,
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

interface ContentGuide {
  mainPoints: string[];
  materialSuggestions: string[];
  knowledgeBaseQueries: string[];
}

// AI生成配置参数
interface AIConfig {
  requirements: string;      // 生成要点
  precautions: string;       // 注意事项/避坑指南
  wordCount: number;         // 预计字数
  referenceFiles?: string[]; // 依赖的参考文件ID
}

interface Section {
  id: string;
  title: string;
  level?: number;
  order: number;
  parent_id?: string;
  isRequired?: boolean;
  sectionType?: 'technical' | 'business' | 'price' | 'basic';
  content?: string;
  status: string;
  scoring_item_ids?: string[];
  riskIds?: string[];
  contentGuide?: ContentGuide;
  aiConfig?: AIConfig;       // AI生成配置参数
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

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 递归渲染章节组件
 * 支持嵌套章节结构，展示 contentGuide（编写要点、素材建议、知识库检索关键词）
 * 支持编辑、添加子章节、删除等操作
 */
const SectionItem: React.FC<{
  section: Section;
  depth?: number;
  onEdit?: (section: Section) => void;
  onAddChild?: (parentId: string) => void;
  onDelete?: (sectionId: string) => void;
}> = ({ section, depth = 0, onEdit, onAddChild, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = section.children && section.children.length > 0;
  const indentStyle = depth > 0 ? { marginLeft: `${depth * 24}px` } : {};

  return (
    <div className="space-y-2">
      {/* 当前章节 - 添加 group 类名用于 hover 控制操作按钮 */}
      <div
        className="group p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
        style={indentStyle}
      >
        {/* 章节标题行 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1">
            {hasChildren && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-0.5 hover:bg-muted rounded"
              >
                <ChevronRight className={cn(
                  "h-4 w-4 transition-transform text-muted-foreground",
                  isExpanded && "rotate-90"
                )} />
              </button>
            )}
            {!hasChildren && <div className="w-5" />}
            
            {section.level && section.level > 1 ? (
              <FileText className="h-4 w-4 text-muted-foreground" />
            ) : (
              <FolderOpen className="h-4 w-4 text-primary" />
            )}
            
            <span className={cn(
              "text-foreground",
              depth === 0 ? "font-semibold" : "font-medium"
            )}>
              {section.order}. {section.title}
            </span>
            
            {section.isRequired && (
              <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                必须
              </Badge>
            )}
            
            {section.sectionType && (
              <Badge variant="secondary" className="text-xs">
                {section.sectionType === 'technical' ? '技术' :
                 section.sectionType === 'business' ? '商务' :
                 section.sectionType === 'price' ? '报价' : '基础'}
              </Badge>
            )}
            
            {/* 如果配置了 AI 参数，显示一个微小的提示灯 */}
            {section.aiConfig && (
              <span className="w-2 h-2 rounded-full bg-blue-500 ml-1" title="已配置生成参数" />
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* 操作按钮组：默认透明，hover 时显示 */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild?.(section.id);
                }}
                title="添加子章节"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(section);
                }}
                title="配置生成参数"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-muted-foreground hover:text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(section.id);
                }}
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <div className="w-[1px] h-4 bg-border mx-1" />
            </div>
            
            <Badge variant={section.status === 'completed' ? 'default' : 'secondary'}>
              {section.status === 'completed' ? '已完成' : '待生成'}
            </Badge>
          </div>
        </div>

        {/* 编写要点 */}
        {section.contentGuide?.mainPoints && section.contentGuide.mainPoints.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              编写要点
            </div>
            <ul className="space-y-0.5 ml-5">
              {section.contentGuide.mainPoints.map((point, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 素材建议 */}
        {section.contentGuide?.materialSuggestions && section.contentGuide.materialSuggestions.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
              <Database className="h-3.5 w-3.5 text-blue-500" />
              素材建议
            </div>
            <div className="flex flex-wrap gap-1.5 ml-5">
              {section.contentGuide.materialSuggestions.map((suggestion, idx) => (
                <Badge key={idx} variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 知识库查询关键词 */}
        {section.contentGuide?.knowledgeBaseQueries && section.contentGuide.knowledgeBaseQueries.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
              <Search className="h-3.5 w-3.5 text-green-500" />
              知识库检索关键词
            </div>
            <div className="flex flex-wrap gap-1.5 ml-5">
              {section.contentGuide.knowledgeBaseQueries.map((query, idx) => (
                <Badge key={idx} variant="outline" className="text-xs bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  {query}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* AI 配置预览 */}
        {section.aiConfig && (section.aiConfig.requirements || section.aiConfig.precautions || section.aiConfig.wordCount) && (
          <div className="mt-2 pt-2 border-t border-dashed">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {section.aiConfig.wordCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  约 {section.aiConfig.wordCount} 字
                </Badge>
              )}
              {section.aiConfig.requirements && (
                <span className="truncate max-w-[200px]" title={section.aiConfig.requirements}>
                  {section.aiConfig.requirements.substring(0, 30)}...
                </span>
              )}
            </div>
          </div>
        )}

        {/* 关联评分项 */}
        {section.scoring_item_ids && section.scoring_item_ids.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Target className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm text-muted-foreground">
              关联 {section.scoring_item_ids.length} 个评分项
            </span>
          </div>
        )}
      </div>

      {/* 递归渲染子章节 */}
      {hasChildren && isExpanded && (
        <div className="border-l-2 border-muted ml-3 pl-1">
          {section.children!.map((child) => (
            <SectionItem
              key={child.id}
              section={child}
              depth={depth + 1}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * AI生成内容章节组件
 * 用于AI生成内容阶段和章节内容选项卡，支持嵌套章节结构
 * 显示生成状态，提供生成/查看/重新生成按钮
 */
const SectionContentItem: React.FC<{
  section: Section;
  depth?: number;
  generatingContent: string | null;
  onGenerate: (sectionId: string) => void;
  onView: (sectionId: string) => void;
  projectId: string;
}> = ({ section, depth = 0, generatingContent, onGenerate, onView, projectId }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = section.children && section.children.length > 0;
  const indentStyle = depth > 0 ? { marginLeft: `${depth * 24}px` } : {};
  const isGenerating = generatingContent === section.id;
  const hasContent = section.content && section.content.trim().length > 0;

  return (
    <div className="space-y-2">
      <div
        className="group p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all"
        style={indentStyle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            {hasChildren && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-0.5 hover:bg-muted rounded"
              >
                <ChevronRight className={cn(
                  "h-4 w-4 transition-transform text-muted-foreground",
                  isExpanded && "rotate-90"
                )} />
              </button>
            )}
            {!hasChildren && <div className="w-5" />}
            
            {section.level && section.level > 1 ? (
              <FileText className="h-4 w-4 text-muted-foreground" />
            ) : (
              <FolderOpen className="h-4 w-4 text-primary" />
            )}
            
            <span className={cn(
              "text-foreground",
              depth === 0 ? "font-semibold" : "font-medium"
            )}>
              {section.order}. {section.title}
            </span>
            
            {hasContent && (
              <Badge variant="outline" className="text-green-600 border-green-200">
                已生成
              </Badge>
            )}
            
            {section.scoring_item_ids && section.scoring_item_ids.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {section.scoring_item_ids.length} 个评分项
              </Badge>
            )}
          </div>
          
          <div className="flex gap-2">
            {hasContent ? (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onView(section.id)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  查看
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onGenerate(section.id)}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
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
                onClick={() => onGenerate(section.id)}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                AI生成
              </Button>
            )}
          </div>
        </div>
        
        {hasContent && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {section.content!.substring(0, 150)}...
          </p>
        )}
      </div>

      {/* 递归渲染子章节 */}
      {hasChildren && isExpanded && (
        <div className="border-l-2 border-muted ml-3 pl-1">
          {section.children!.map((child) => (
            <SectionContentItem
              key={child.id}
              section={child}
              depth={depth + 1}
              generatingContent={generatingContent}
              onGenerate={onGenerate}
              onView={onView}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

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
  
  // 大纲编辑相关状态
  const [sectionEditDialogOpen, setSectionEditDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionFormData, setSectionFormData] = useState({
    title: '',
    requirements: '',
    precautions: '',
    wordCount: 800,
  });
  const [savingSection, setSavingSection] = useState(false);
  
  // 新增章节相关状态
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [addSectionDialogOpen, setAddSectionDialogOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  
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
  
  // 阶段选项卡状态
  const [activeStage, setActiveStage] = useState<'upload' | 'outline' | 'content' | 'validate'>('upload');

  // 知识库文件选择相关状态
  const [knowledgeFileSelectOpen, setKnowledgeFileSelectOpen] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  // 重新提取弹窗状态
  const [reextractDialogOpen, setReextractDialogOpen] = useState(false);

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
      // 修复：大纲数据在 outlineData.data.outline.sections 中
      if (outlineData.success && outlineData.data.outline?.sections) {
        setSections(outlineData.data.outline.sections);
      }
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
    const uploadId = uploadFile.response?.uploadId; // 获取uploadId用于百炼文件缓存
    
    setUploadedDocument({
      name: uploadFile.file.name,
      url: fileUrl,
      extracted: false,
    });
    
    // 标记为新上传
    setIsNewUpload(true);
    
    // 启动后台提取任务，传入uploadId
    await startExtractionTask(fileUrl, uploadFile.file.name, uploadId);
  };

  // 启动后台提取任务
  const startExtractionTask = async (fileUrl: string, fileName: string, uploadId?: string) => {
    setExtracting(true);
    
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentUrl: fileUrl,
          documentName: fileName,
          uploadId, // 传递uploadId，用于获取百炼file_id
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
        body: JSON.stringify({}),  // 添加空请求体
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

  // 打开知识库文件选择对话框
  const handleOpenKnowledgeFileSelect = () => {
    if (sections.length === 0) {
      alert('请先生成大纲');
      return;
    }
    setSelectedDocumentIds([]);
    setKnowledgeFileSelectOpen(true);
  };

  // 处理选择文档确认
  const handleDocumentSelectConfirm = (documents: Array<{ id: string }>) => {
    setSelectedDocumentIds(documents.map(d => d.id));
    // 自动开始生成
    handleGenerateAllContent(documents.map(d => d.id));
  };

  // 执行一键生成所有内容（带选中的参考文档）
  const handleGenerateAllContent = async (documentIds: string[] = selectedDocumentIds) => {
    setGeneratingContent('all');
    setKnowledgeFileSelectOpen(false);
    
    try {
      // 递归收集所有章节（包括子章节）
      const collectAllSections = (sections: Section[]): Section[] => {
        const result: Section[] = [];
        for (const section of sections) {
          result.push(section);
          if (section.children && section.children.length > 0) {
            result.push(...collectAllSections(section.children));
          }
        }
        return result;
      };

      const allSections = collectAllSections(sections);
      let generatedCount = 0;

      // 逐个生成章节内容
      for (const section of allSections) {
        if (!section.content) {
          const res = await fetch(`/api/projects/${projectId}/sections/${section.id}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              useKnowledge: true,
              referenceDocumentIds: documentIds.length > 0 ? documentIds : undefined,
            }),
          });
          const data = await res.json();
          if (data.success) {
            generatedCount++;
          }
        }
      }
      
      fetchProjectData();
      alert(`内容生成完成！共生成 ${generatedCount} 个章节`);
    } catch (error) {
      console.error('批量生成失败:', error);
      alert('批量生成失败');
    } finally {
      setGeneratingContent(null);
    }
  };

  // 打开章节编辑弹窗
  const handleEditSection = (section: Section) => {
    setEditingSection(section);
    setSectionFormData({
      title: section.title,
      requirements: section.aiConfig?.requirements || '',
      precautions: section.aiConfig?.precautions || '',
      wordCount: section.aiConfig?.wordCount || 800,
    });
    setSectionEditDialogOpen(true);
  };

  // 保存章节配置
  const handleSaveSectionConfig = async () => {
    if (!editingSection) return;
    
    setSavingSection(true);
    try {
      // 递归更新章节
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
      
      // 调用API保存大纲
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: { sections: updatedSections },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setSections(updatedSections);
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
  };

  // 打开添加子章节弹窗
  const handleAddChild = (parentId: string) => {
    setNewParentId(parentId);
    setNewSectionTitle('');
    // 重置表单数据
    setSectionFormData({
      title: '',
      requirements: '',
      precautions: '',
      wordCount: 800,
    });
    setAddSectionDialogOpen(true);
  };

  // 添加新章节
  const handleAddNewSection = async () => {
    if (!newSectionTitle.trim()) {
      alert('请输入章节名称');
      return;
    }

    setSavingSection(true);
    try {
      // 生成新章节ID
      const newId = `section-${Date.now()}`;
      
      // 递归添加子章节
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
            };
            return { ...s, children: [...children, newSection] };
          }
          if (s.children) {
            return { ...s, children: addSection(s.children, parentId) };
          }
          return s;
        });
      };

      const updatedSections = addSection(sections, newParentId!);
      
      // 调用API保存大纲
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: { sections: updatedSections },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setSections(updatedSections);
        setAddSectionDialogOpen(false);
        setNewParentId(null);
        setNewSectionTitle('');
      } else {
        alert('添加失败：' + data.error);
      }
    } catch (error) {
      console.error('添加章节失败:', error);
      alert('添加失败');
    } finally {
      setSavingSection(false);
    }
  };

  // 添加一级章节
  const handleAddTopLevelSection = () => {
    setNewParentId(null);
    setNewSectionTitle('');
    // 重置表单数据
    setSectionFormData({
      title: '',
      requirements: '',
      precautions: '',
      wordCount: 800,
    });
    setAddSectionDialogOpen(true);
  };

  // 确认添加章节（支持一级和子章节，支持配置AI参数）
  const handleConfirmAddSection = async () => {
    if (!newSectionTitle.trim()) {
      alert('请输入章节名称');
      return;
    }

    setSavingSection(true);
    try {
      const newId = `section-${Date.now()}`;
      let updatedSections: Section[];

      // 构建 AI 配置对象
      const aiConfig: AIConfig = {
        requirements: sectionFormData.requirements,
        precautions: sectionFormData.precautions,
        wordCount: sectionFormData.wordCount,
      };

      if (newParentId) {
        // 添加子章节
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
                aiConfig: aiConfig.requirements || aiConfig.precautions || aiConfig.wordCount !== 800 ? aiConfig : undefined,
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
        // 添加一级章节
        const newSection: Section = {
          id: newId,
          title: newSectionTitle,
          level: 1,
          order: sections.length + 1,
          status: 'pending',
          children: [],
          aiConfig: aiConfig.requirements || aiConfig.precautions || aiConfig.wordCount !== 800 ? aiConfig : undefined,
        };
        updatedSections = [...sections, newSection];
      }
      
      // 调用API保存大纲
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: { sections: updatedSections },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setSections(updatedSections);
        setAddSectionDialogOpen(false);
        setNewParentId(null);
        setNewSectionTitle('');
        // 重置表单数据
        setSectionFormData({
          title: '',
          requirements: '',
          precautions: '',
          wordCount: 800,
        });
      } else {
        alert('添加失败：' + data.error);
      }
    } catch (error) {
      console.error('添加章节失败:', error);
      alert('添加失败');
    } finally {
      setSavingSection(false);
    }
  };

  // 删除章节
  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm('确定要删除该章节吗？删除后无法恢复。')) {
      return;
    }

    try {
      // 递归删除章节
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
      
      // 调用API保存大纲
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: { sections: updatedSections },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setSections(updatedSections);
      } else {
        alert('删除失败：' + data.error);
      }
    } catch (error) {
      console.error('删除章节失败:', error);
      alert('删除失败');
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
    const hasUploadedDoc = uploadedDocument !== null;
    const hasScoringItems = scoringItems.length > 0;
    const hasOutline = sections.length > 0;
    const hasContent = sections.some(s => s.content);
    const hasValidation = validationResult !== null;

    // 阶段1：上传文档 - 需要上传文档就算完成（提取结果会在后台保存）
    const uploadComplete = hasUploadedDoc;
    
    // 阶段2：生成大纲 - 需要上传完成且有章节才算完成
    const outlineComplete = uploadComplete && hasOutline;
    
    // 阶段3：AI生成 - 需要大纲完成且有内容才算完成
    const contentComplete = outlineComplete && hasContent;
    
    // 阶段4：校验导出 - 需要内容完成且有校验结果才算完成
    const validateComplete = contentComplete && hasValidation;

    return {
      upload: uploadComplete ? 'completed' : hasUploadedDoc ? 'uploaded' : 'pending',
      outline: outlineComplete ? 'completed' : uploadComplete ? 'current' : 'pending',
      content: contentComplete ? 'completed' : outlineComplete ? 'current' : 'pending',
      validate: validateComplete ? 'completed' : contentComplete ? 'current' : 'pending',
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 阶段选项卡 */}
        <Tabs value={activeStage} onValueChange={(v) => setActiveStage(v as any)} className="mb-6">
          <TabsList className="grid w-full grid-cols-4">
            {[
              { key: 'upload', label: '上传文档', icon: Upload, status: stepStatus.upload },
              { key: 'outline', label: '生成大纲', icon: FolderOpen, status: stepStatus.outline },
              { key: 'content', label: 'AI生成', icon: Sparkles, status: stepStatus.content },
              { key: 'validate', label: '校验导出', icon: ShieldCheck, status: stepStatus.validate },
            ].map((step, idx) => (
              <TabsTrigger key={step.key} value={step.key} className="flex items-center gap-2">
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  step.status === 'completed' 
                    ? "bg-green-500 text-white" 
                    : "bg-blue-500 text-white"
                )}>{idx + 1}</span>
                <step.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{step.label}</span>
                {step.status === 'completed' && (
                  <CheckCircle className="w-4 h-4 text-green-500 ml-1" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* 上传文档阶段 */}
          <TabsContent value="upload" className="mt-4">
            {stepStatus.upload === 'pending' ? (
              <Card className="border-dashed">
                <CardContent className="py-8">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Upload className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">上传招标文档</h3>
                      <p className="text-sm text-muted-foreground mt-1">支持 PDF、Word、图片等格式，自动提取评分项和风险</p>
                    </div>
                    <div className="flex justify-center gap-3">
                      <Button onClick={() => setUploadFileDialogOpen(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        上传文件
                      </Button>
                      <Button variant="outline" onClick={() => setExtractDialogOpen(true)}>
                        粘贴文本
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
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
          </TabsContent>

          {/* 生成大纲阶段 */}
          <TabsContent value="outline" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>生成标书大纲</CardTitle>
                    <CardDescription>根据招标文档自动生成标书章节结构</CardDescription>
                  </div>
                  <Button 
                    onClick={handleGenerateOutline} 
                    disabled={!uploadedDocument || generatingOutline}
                  >
                    {generatingOutline ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FolderOpen className="h-4 w-4 mr-2" />
                    )}
                    生成大纲
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!uploadedDocument ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-2">请先上传招标文档并完成提取</p>
                    <Button variant="outline" onClick={() => setActiveStage('upload')}>
                      前往上传
                    </Button>
                  </div>
                ) : sections.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-2">文档已提取完成</p>
                    <p className="text-sm">点击上方按钮生成标书大纲</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sections.map((section) => (
                      <SectionItem 
                        key={section.id} 
                        section={section}
                        onEdit={handleEditSection}
                        onAddChild={handleAddChild}
                        onDelete={handleDeleteSection}
                      />
                    ))}
                    
                    {/* 底部添加一级章节按钮 */}
                    <Button 
                      variant="outline" 
                      className="w-full border-dashed text-muted-foreground hover:text-primary hover:border-primary/50"
                      onClick={handleAddTopLevelSection}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      添加一级章节
                    </Button>
                    
                    <div className="pt-4 text-center">
                      <Button onClick={() => setActiveStage('content')}>
                        下一步：AI生成内容
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI生成阶段 */}
          <TabsContent value="content" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>AI生成内容</CardTitle>
                    <CardDescription>使用AI自动生成各章节内容</CardDescription>
                  </div>
                  {sections.length > 0 && (
                    <Button onClick={handleOpenKnowledgeFileSelect} disabled={generatingContent === 'all'}>
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
                    <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-2">请先生成标书大纲</p>
                    <Button variant="outline" onClick={() => setActiveStage('outline')}>
                      前往生成大纲
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {sections.map((section) => (
                        <SectionContentItem
                          key={section.id}
                          section={section}
                          generatingContent={generatingContent}
                          onGenerate={handleGenerateSectionContent}
                          onView={(sectionId) => router.push(`/projects/${projectId}/sections/${sectionId}`)}
                          projectId={projectId}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
                {sections.length > 0 && sections.some(s => s.content) && (
                  <div className="pt-4 text-center">
                    <Button onClick={() => setActiveStage('validate')}>
                      下一步：校验导出
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 校验导出阶段 */}
          <TabsContent value="validate" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>校验与导出</CardTitle>
                    <CardDescription>校验标书内容质量并导出文档</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleValidate} 
                      disabled={!sections.some(s => s.content) || validating}
                    >
                      {validating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 mr-2" />
                      )}
                      执行校验
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!sections.some(s => s.content) ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-2">请先生成章节内容</p>
                    <Button variant="outline" onClick={() => setActiveStage('content')}>
                      前往AI生成
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 校验结果 */}
                    {validationResult ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="text-sm text-muted-foreground">总体得分</div>
                          <div className="text-2xl font-bold">{validationResult.overallScore.toFixed(0)}</div>
                        </div>
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="text-sm text-muted-foreground">严重问题</div>
                          <div className="text-2xl font-bold text-red-500">
                            {validationResult.criticalIssues + validationResult.highIssues}
                          </div>
                        </div>
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="text-sm text-muted-foreground">中等问题</div>
                          <div className="text-2xl font-bold text-yellow-500">
                            {validationResult.mediumIssues}
                          </div>
                        </div>
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="text-sm text-muted-foreground">轻微问题</div>
                          <div className="text-2xl font-bold text-blue-500">
                            {validationResult.lowIssues}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>点击"执行校验"按钮开始校验</p>
                      </div>
                    )}

                    {/* 导出选项 */}
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-3">导出文档</h4>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => handleExport('markdown')} 
                          disabled={exporting}
                        >
                          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Markdown
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => handleExport('html')} 
                          disabled={exporting}
                        >
                          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          HTML
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => handleExport('docx')} 
                          disabled={exporting}
                        >
                          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Word (DOCX)
                        </Button>
                      </div>
                    </div>

                    {/* 快捷链接 */}
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-3">更多功能</h4>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => router.push(`/projects/${projectId}/validation`)}
                        >
                          <ShieldCheck className="h-4 w-4 mr-2" />
                          查看完整校验报告
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => router.push(`/projects/${projectId}/extraction-management`)}
                        >
                          <FileSearch className="h-4 w-4 mr-2" />
                          提取结果管理
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
        <Tabs defaultValue="extraction" className="space-y-4">
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
            <TenderExtractionView extractionResult={extractionResult} showCompact={true} />
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
                    <Button onClick={handleOpenKnowledgeFileSelect} disabled={generatingContent === 'all'}>
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
                    <Button onClick={handleGenerateOutline} disabled={!uploadedDocument || generatingOutline}>
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
                        <SectionContentItem
                          key={section.id}
                          section={section}
                          generatingContent={generatingContent}
                          onGenerate={handleGenerateSectionContent}
                          onView={(sectionId) => router.push(`/projects/${projectId}/sections/${sectionId}`)}
                          projectId={projectId}
                        />
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
                <CardTitle>评分标准</CardTitle>
                <CardDescription>
                  技术 {summary.technicalCount}项({summary.technicalScore}分) · 
                  商务 {summary.businessCount}项({summary.businessScore}分) · 
                  价格 {summary.priceCount}项({summary.priceScore}分)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!uploadedDocument ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>请先上传招标文档并完成提取</p>
                  </div>
                ) : scoringItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>文档已提取，但未识别到评分项</p>
                    <p className="text-sm mt-1">可能是招标文档中未包含评分标准</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    {/* 按类型分组显示评分标准 */}
                    {(['technical', 'business', 'price'] as const).map((type) => {
                      const typeItems = scoringItems.filter(item => item.item_type === type);
                      if (typeItems.length === 0) return null;
                      
                      const totalScore = typeItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
                      const typeLabel = type === 'technical' ? '技术评分' : type === 'business' ? '商务评分' : '价格评分';
                      const typeColor = type === 'technical' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' :
                                       type === 'business' ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' :
                                       'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
                      const badgeVariant = type === 'technical' ? 'default' : type === 'business' ? 'secondary' : 'outline';
                      
                      return (
                        <Card key={type} className={`mb-4 overflow-hidden ${typeColor}`}>
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Target className="h-4 w-4" />
                                <span className="font-semibold">{typeLabel}</span>
                                <Badge variant={badgeVariant} className="text-xs">
                                  {typeItems.length}项
                                </Badge>
                              </div>
                              <Badge variant="destructive">{totalScore}分</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="py-2 px-4">
                            <div className="space-y-2">
                              {typeItems.map((item, idx) => (
                                <div key={item.id} className="py-2 border-b last:border-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{item.item_name}</span>
                                      {item.chapter_id && (
                                        <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                                          已关联章节
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="font-semibold text-sm">{item.max_score}分</span>
                                  </div>
                                  {item.scoring_rules && item.scoring_rules.length > 0 && (
                                    <div className="mt-1.5">
                                      {item.scoring_rules.slice(0, 3).map((rule: any, ruleIdx: number) => (
                                        <p key={ruleIdx} className="text-xs text-muted-foreground line-clamp-1 mb-0.5">
                                          • {typeof rule === 'string' ? rule : rule.rule || rule.description || JSON.stringify(rule)}
                                        </p>
                                      ))}
                                      {item.scoring_rules.length > 3 && (
                                        <p className="text-xs text-muted-foreground">...共 {item.scoring_rules.length} 条细则</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
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
                          <Button 
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              setUploadFileDialogOpen(false);
                              setReextractDialogOpen(true);
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            重新提取
                          </Button>
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
                  {!uploadedDocument.extracted && !extracting && (
                    <div className="flex gap-2 mt-2">
                      {uploadedDocument.extractError && (
                        <Button 
                          size="sm"
                          onClick={() => {
                            setUploadFileDialogOpen(false);
                            setReextractDialogOpen(true);
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          重新提取
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

      {/* 章节配置弹窗 - 优化设计 */}
      <Dialog open={sectionEditDialogOpen} onOpenChange={setSectionEditDialogOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden border-slate-200 shadow-lg">
          {/* 弹窗头部 */}
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/80">
            <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              配置生成参数
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1.5">
              为【{editingSection?.title || sectionFormData.title}】设置具体的 AI 生成规则，帮助大模型更精准地输出。
            </DialogDescription>
          </div>
          
          {/* 弹窗表单主体 */}
          <div className="px-6 py-6 flex flex-col gap-6 bg-white">
            {/* 章节名称 */}
            <div className="space-y-2.5">
              <Label className="text-sm font-medium text-slate-700">章节名称</Label>
              <Input 
                value={sectionFormData.title} 
                onChange={e => setSectionFormData({...sectionFormData, title: e.target.value})}
                className="h-10 border-slate-200 focus-visible:ring-blue-100 focus-visible:border-blue-400 transition-all shadow-sm" 
                placeholder="请输入章节名称"
              />
            </div>

            {/* 生成要点 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  生成要点 (Prompt)
                </Label>
                <span className="text-xs text-slate-400 font-normal">告诉 AI 这段内容重点写什么</span>
              </div>
              <Textarea 
                placeholder="例如：重点突出我司在金融行业的落地经验，强调系统的微服务架构和高可用性..."
                className="min-h-[140px] resize-none border-slate-200 bg-slate-50/50 focus-visible:bg-white focus-visible:ring-blue-100 focus-visible:border-blue-400 text-sm leading-relaxed shadow-sm transition-all"
                value={sectionFormData.requirements}
                onChange={e => setSectionFormData({...sectionFormData, requirements: e.target.value})}
              />
            </div>

            {/* 约束条件区 (8:4 网格布局) */}
            <div className="grid grid-cols-12 gap-6">
              {/* 注意事项 (占 8 列) */}
              <div className="col-span-12 sm:col-span-8 space-y-2.5">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-red-500" />
                  注意事项 / 避坑指南
                </Label>
                <Textarea 
                  placeholder="例如：绝不能提及开源软件，不能出现竞品名称..."
                  className="min-h-[100px] resize-none border-slate-200 focus-visible:ring-red-100 focus-visible:border-red-400 text-sm shadow-sm transition-all"
                  value={sectionFormData.precautions}
                  onChange={e => setSectionFormData({...sectionFormData, precautions: e.target.value})}
                />
              </div>

              {/* 预计字数 (占 4 列) */}
              <div className="col-span-12 sm:col-span-4 space-y-2.5">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-400" />
                  预计生成字数
                </Label>
                <div className="relative shadow-sm rounded-md">
                  <Input 
                    type="number" 
                    step="100"
                    min="100"
                    max="10000"
                    className="h-10 pr-12 border-slate-200 focus-visible:ring-blue-100 focus-visible:border-blue-400 transition-all"
                    value={sectionFormData.wordCount}
                    onChange={e => setSectionFormData({...sectionFormData, wordCount: parseInt(e.target.value) || 800})}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <span className="text-sm text-slate-400 font-medium">字</span>
                  </div>
                </div>
                <p className="text-[11.5px] text-slate-400 leading-relaxed mt-1.5">
                  建议设置在 500-2000 字之间，防止大模型注水或截断。
                </p>
              </div>
            </div>
          </div>

          {/* 弹窗底部操作区 */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setSectionEditDialogOpen(false)}
              className="border-slate-200 text-slate-600 hover:bg-slate-100 bg-white shadow-sm"
            >
              取消
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium px-6" 
              onClick={handleSaveSectionConfig}
              disabled={savingSection}
            >
              {savingSection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              保存配置
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 添加章节弹窗 - 优化设计 */}
      <Dialog open={addSectionDialogOpen} onOpenChange={setAddSectionDialogOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden border-slate-200 shadow-lg">
          {/* 弹窗头部 */}
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/80">
            <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              {newParentId ? '添加子章节' : '添加一级章节'}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1.5">
              {newParentId 
                ? '在当前章节下添加新的子章节，并可配置 AI 生成参数' 
                : '在标书大纲中添加新的一级章节，并可配置 AI 生成参数'}
            </DialogDescription>
          </div>
          
          {/* 弹窗表单主体 */}
          <div className="px-6 py-6 flex flex-col gap-6 bg-white">
            {/* 章节名称 */}
            <div className="space-y-2.5">
              <Label className="text-sm font-medium text-slate-700">章节名称</Label>
              <Input 
                value={newSectionTitle}
                onChange={e => setNewSectionTitle(e.target.value)}
                placeholder="请输入章节名称"
                className="h-10 border-slate-200 focus-visible:ring-blue-100 focus-visible:border-blue-400 transition-all shadow-sm"
                autoFocus
              />
            </div>

            {/* 生成要点 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  生成要点 (Prompt)
                </Label>
                <span className="text-xs text-slate-400 font-normal">告诉 AI 这段内容重点写什么</span>
              </div>
              <Textarea 
                placeholder="例如：重点突出我司在金融行业的落地经验，强调系统的微服务架构和高可用性..."
                className="min-h-[140px] resize-none border-slate-200 bg-slate-50/50 focus-visible:bg-white focus-visible:ring-blue-100 focus-visible:border-blue-400 text-sm leading-relaxed shadow-sm transition-all"
                value={sectionFormData.requirements}
                onChange={e => setSectionFormData({...sectionFormData, requirements: e.target.value})}
              />
            </div>

            {/* 约束条件区 (8:4 网格布局) */}
            <div className="grid grid-cols-12 gap-6">
              {/* 注意事项 (占 8 列) */}
              <div className="col-span-12 sm:col-span-8 space-y-2.5">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-red-500" />
                  注意事项 / 避坑指南
                </Label>
                <Textarea 
                  placeholder="例如：绝不能提及开源软件，不能出现竞品名称..."
                  className="min-h-[100px] resize-none border-slate-200 focus-visible:ring-red-100 focus-visible:border-red-400 text-sm shadow-sm transition-all"
                  value={sectionFormData.precautions}
                  onChange={e => setSectionFormData({...sectionFormData, precautions: e.target.value})}
                />
              </div>

              {/* 预计字数 (占 4 列) */}
              <div className="col-span-12 sm:col-span-4 space-y-2.5">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-400" />
                  预计生成字数
                </Label>
                <div className="relative shadow-sm rounded-md">
                  <Input 
                    type="number" 
                    step="100"
                    min="100"
                    max="10000"
                    className="h-10 pr-12 border-slate-200 focus-visible:ring-blue-100 focus-visible:border-blue-400 transition-all"
                    value={sectionFormData.wordCount}
                    onChange={e => setSectionFormData({...sectionFormData, wordCount: parseInt(e.target.value) || 800})}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <span className="text-sm text-slate-400 font-medium">字</span>
                  </div>
                </div>
                <p className="text-[11.5px] text-slate-400 leading-relaxed mt-1.5">
                  建议设置在 500-2000 字之间，防止大模型注水或截断。
                </p>
              </div>
            </div>
          </div>

          {/* 弹窗底部操作区 */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setAddSectionDialogOpen(false)}
              className="border-slate-200 text-slate-600 hover:bg-slate-100 bg-white shadow-sm"
            >
              取消
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium px-6" 
              onClick={handleConfirmAddSection}
              disabled={savingSection || !newSectionTitle.trim()}
            >
              {savingSection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              添加章节
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 知识库文档选择器 */}
      <KnowledgeDocumentSelector
        isOpen={knowledgeFileSelectOpen}
        onOpenChange={setKnowledgeFileSelectOpen}
        defaultKnowledgeBaseId={project?.knowledge_base_id || undefined}
        onConfirm={handleDocumentSelectConfirm}
      />

      {/* 重新提取弹窗 */}
      <ReextractDialog
        isOpen={reextractDialogOpen}
        onOpenChange={setReextractDialogOpen}
        projectId={projectId}
        extractionResult={extractionResult}
        onReextractComplete={fetchProjectData}
      />
    </div>
  );
}
