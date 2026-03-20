'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ChunkUpload, ChunkUploadFile } from '@/components/ui/chunk-upload';
import DocumentPreviewDialog from '@/components/ui/document-preview-dialog';
import RetrievalPreviewDialog from '@/components/ui/retrieval-preview-dialog';
import SearchResultsDetailDialog, { SearchDetail } from '@/components/ui/search-results-detail-dialog';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Upload,
  FileText,
  Database,
  MoreVertical,
  Trash2,
  RefreshCw,
  Search,
  Eye,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Tag,
  Plus,
  X,
  FileSearch,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Settings,
  Calendar,
  Layers,
  Bot,
  Zap,
  FileStack,
  Filter,
} from 'lucide-react';

// 百炼知识库类型定义
interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  type: 'bailian';
  structureType: 'unstructured' | 'structured' | 'multimedia';
  status: 'creating' | 'active' | 'failed';
  embeddingModelName: string;
  rerankModelName?: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Document {
  id: string;
  name: string;
  original_name?: string;
  file_type: string;
  file_size: number;
  vector_status: string;
  vector_error?: string;
  chunk_count: number;
  tags?: Tag[];
  created_at: string;
  storage_path?: string;
}

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  document_count?: number;
}

interface SearchResult {
  content: string;
  source: string;
  score: number;
  metadata: any;
  chunkIndex?: number;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  results?: SearchResult[];
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kbId = params.id as string;

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // ========== 连续对话检索状态 ==========
  const [conversationMode, setConversationMode] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');

  // ========== 预览状态 ==========
  // 1. 文档预览状态（文档列表中预览按钮）
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  const [docPreviewData, setDocPreviewData] = useState<{
    id: string;
    name: string;
    originalName?: string;
    fileType: string;
    fileSize: number;
    status: string;
    chunkCount: number;
    tags?: Array<{ id: string; name: string; color: string }>;
    createdAt?: string;
  } | null>(null);

  // 2. 检索预览状态（单个检索结果快速预览）
  const [retrievalPreviewOpen, setRetrievalPreviewOpen] = useState(false);
  const [retrievalPreviewData, setRetrievalPreviewData] = useState<{
    documentName: string;
    score: number;
    content: string;
    chunkIndex?: number;
  } | null>(null);

  // 3. 搜索结果详细展示状态
  const [searchDetailOpen, setSearchDetailOpen] = useState(false);
  const [searchDetailIndex, setSearchDetailIndex] = useState(0);
  const [searchDetailResults, setSearchDetailResults] = useState<SearchDetail[]>([]);

  // 标签相关状态
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [selectedDocTags, setSelectedDocTags] = useState<string[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTagsDialogOpen, setEditTagsDialogOpen] = useState(false);

  // ========== 文档列表分页、搜索、过滤状态 ==========
  const [docPage, setDocPage] = useState(1);
  const [docPageSize] = useState(10);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docSearchInput, setDocSearchInput] = useState('');
  const [docFilterTags, setDocFilterTags] = useState<string[]>([]); // 文档列表标签过滤

  useEffect(() => {
    fetchKnowledgeBaseData();
  }, [kbId]);

  const fetchKnowledgeBaseData = async () => {
    try {
      const [kbRes, docsRes, statsRes, tagsRes] = await Promise.all([
        fetch(`/api/bailian/knowledge-bases/${kbId}`),
        fetch(`/api/bailian/knowledge-bases/${kbId}/documents`),
        fetch(`/api/bailian/knowledge-bases/${kbId}/stats`),
        fetch(`/api/bailian/knowledge-bases/${kbId}/tags`), // 使用百炼API
      ]);

      const kbData = await kbRes.json();
      const docsData = await docsRes.json();
      const statsData = await statsRes.json();
      const tagsData = await tagsRes.json();

      if (kbData.success) {
        setKnowledgeBase(kbData.data);
      } else {
        console.error('[Knowledge Base Detail] Failed to fetch knowledge base:', kbData.message);
      }
      if (docsData.success) setDocuments(docsData.data.documents);
      if (statsData.success) setStats(statsData.data);
      if (tagsData.success) setTags(tagsData.data);
    } catch (error) {
      console.error('获取知识库数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (files: ChunkUploadFile[]) => {
    // 先关闭对话框，再刷新数据（避免 DOM 状态冲突）
    setUploadDialogOpen(false);
    // 延迟刷新数据，让对话框关闭动画完成
    setTimeout(() => {
      fetchKnowledgeBaseData();
    }, 100);
  };

  const handleSearch = async () => {
    const query = currentQuestion.trim() || searchQuery.trim();
    if (!query) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/bailian/knowledge-bases/${kbId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          topK: 5,
          tags: selectedDocTags.length > 0 ? selectedDocTags : undefined,
          useConversationMode: conversationMode && conversationHistory.length > 0,
          conversationHistory: conversationMode ? conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content,
          })) : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const results = data.data.results;
        
        if (conversationMode) {
          // 连续对话模式：保存对话历史
          const userMsg: ConversationMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: query,
            timestamp: new Date(),
          };
          
          const assistantMsg: ConversationMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `找到 ${results.length} 个相关结果`,
            timestamp: new Date(),
            results,
          };
          
          setConversationHistory(prev => [...prev, userMsg, assistantMsg]);
          setCurrentQuestion('');
        } else {
          // 普通模式：直接显示结果
          setSearchResults(results);
        }
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setSearching(false);
    }
  };

  // 清空对话历史
  const handleClearConversation = () => {
    setConversationHistory([]);
  };

  // 切换对话模式
  const handleToggleConversationMode = () => {
    setConversationMode(!conversationMode);
    if (!conversationMode) {
      // 切换到连续对话模式时，清空普通搜索结果
      setSearchResults([]);
    } else {
      // 切换到普通模式时，清空对话历史
      setConversationHistory([]);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await fetch(`/api/bailian/knowledge-bases/${kbId}/documents/${docId}`, {
        method: 'DELETE',
      });
      fetchKnowledgeBaseData();
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleReprocessDocument = async (docId: string) => {
    try {
      await fetch(`/api/bailian/knowledge-bases/${kbId}/documents/${docId}/reprocess`, {
        method: 'POST',
      });
      fetchKnowledgeBaseData();
    } catch (error) {
      console.error('重新处理失败:', error);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const res = await fetch(`/api/bailian/knowledge-bases/${kbId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTags([...tags, data.data]);
        setNewTagName('');
        setNewTagColor('#3b82f6');
      }
    } catch (error) {
      console.error('创建标签失败:', error);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      await fetch(`/api/bailian/knowledge-bases/${kbId}/tags/${tagId}`, {
        method: 'DELETE',
      });
      setTags(tags.filter(t => t.id !== tagId));
    } catch (error) {
      console.error('删除标签失败:', error);
    }
  };

  const handleUpdateDocTags = async (docId: string, tagIds: string[]) => {
    try {
      await fetch(`/api/bailian/knowledge-bases/${kbId}/documents/${docId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds }),
      });
      fetchKnowledgeBaseData();
    } catch (error) {
      console.error('更新文档标签失败:', error);
    }
  };

  // 打开编辑标签对话框
  const openEditTagsDialog = (doc: Document) => {
    setEditingDocId(doc.id);
    setSelectedDocTags(doc.tags?.map(t => t.id) || []);
    setEditTagsDialogOpen(true);
  };

  // 保存文档标签
  const handleSaveDocTags = async () => {
    if (!editingDocId) return;
    await handleUpdateDocTags(editingDocId, selectedDocTags);
    setEditTagsDialogOpen(false);
    setEditingDocId(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '已上传',
      processing: '处理中',
      completed: '已完成',
      failed: '处理失败',
    };
    return statusMap[status] || status;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'processing':
        return 'secondary';
      case 'pending':
        return 'outline';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  // 百炼知识库状态显示
  const getKBStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />正常</Badge>;
      case 'creating':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />创建中</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />失败</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // 知识库类型显示
  const getStructureTypeLabel = (type: string) => {
    const typeMap: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
      unstructured: { label: '非结构化', icon: <FileText className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
      structured: { label: '结构化', icon: <Database className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
      multimedia: { label: '多模态', icon: <Layers className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700' },
    };
    return typeMap[type] || { label: type, icon: <FileText className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' };
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!knowledgeBase) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="text-muted-foreground">知识库不存在</div>
        <div className="text-sm text-muted-foreground/70">
          知识库ID: {kbId}
        </div>
        <Button variant="outline" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回首页
        </Button>
      </div>
    );
  }

  // ========== 文档列表过滤和分页计算 ==========
  // 过滤文档：根据搜索关键词和标签
  const filteredDocuments = documents.filter(doc => {
    // 名称搜索过滤
    const matchesSearch = !docSearchQuery || 
      doc.name?.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
      doc.original_name?.toLowerCase().includes(docSearchQuery.toLowerCase());
    
    // 标签过滤
    const matchesTags = docFilterTags.length === 0 || 
      (doc.tags && doc.tags.some(tag => docFilterTags.includes(tag.id)));
    
    return matchesSearch && matchesTags;
  });

  // 分页计算
  const docTotalPages = Math.ceil(filteredDocuments.length / docPageSize);
  const paginatedDocuments = filteredDocuments.slice(
    (docPage - 1) * docPageSize,
    docPage * docPageSize
  );

  // 重置页码当过滤条件改变时
  useEffect(() => {
    setDocPage(1);
  }, [docSearchQuery, docFilterTags]);

  const structureTypeInfo = getStructureTypeLabel(knowledgeBase.structureType);

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold">{knowledgeBase.name}</h1>
                    {getKBStatusBadge(knowledgeBase.status)}
                    <Badge className={structureTypeInfo.color}>
                      {structureTypeInfo.icon}
                      <span className="ml-1">{structureTypeInfo.label}</span>
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {knowledgeBase.description || '暂无描述'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                上传文档
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：文档列表 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 百炼知识库信息卡片 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  知识库配置
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Embedding模型 */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md">
                      <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Embedding 模型</p>
                      <p className="text-sm font-medium truncate" title={knowledgeBase.embeddingModelName}>
                        {knowledgeBase.embeddingModelName || '-'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Rerank模型 */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-md">
                      <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Rerank 模型</p>
                      <p className="text-sm font-medium truncate" title={knowledgeBase.rerankModelName}>
                        {knowledgeBase.rerankModelName || '-'}
                      </p>
                    </div>
                  </div>
                  
                  {/* 文档数量 */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-md">
                      <FileStack className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">文档数量</p>
                      <p className="text-sm font-medium">{knowledgeBase.documentCount || 0}</p>
                    </div>
                  </div>
                  
                  {/* 知识库ID */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-md">
                      <Database className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">知识库 ID</p>
                      <p className="text-sm font-medium font-mono truncate" title={knowledgeBase.id}>
                        {knowledgeBase.id.slice(0, 12)}...
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* 创建和更新时间 */}
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>创建时间：{formatDate(knowledgeBase.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>更新时间：{formatDate(knowledgeBase.updatedAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 文档列表 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>文档列表</CardTitle>
                    <CardDescription>
                      已上传的文档会自动分块并向量化存储
                    </CardDescription>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    共 {filteredDocuments.length} / {documents.length} 个文档
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* 搜索和过滤栏 */}
                <div className="space-y-3 mb-4">
                  {/* 搜索框 */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="搜索文档名称..."
                        value={docSearchInput}
                        onChange={(e) => setDocSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setDocSearchQuery(docSearchInput);
                          }
                        }}
                        className="pl-9"
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setDocSearchQuery(docSearchInput)}
                    >
                      搜索
                    </Button>
                    {docSearchQuery && (
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          setDocSearchQuery('');
                          setDocSearchInput('');
                        }}
                      >
                        清除
                      </Button>
                    )}
                  </div>

                  {/* 标签过滤 */}
                  {tags.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Filter className="h-3.5 w-3.5" />
                        <span>标签过滤：</span>
                      </div>
                      {tags.map((tag) => {
                        const isSelected = docFilterTags.includes(tag.id);
                        return (
                          <Badge
                            key={tag.id}
                            style={{
                              backgroundColor: isSelected ? tag.color : tag.color + '20',
                              color: isSelected ? '#fff' : tag.color,
                              borderColor: tag.color,
                              border: `1px solid ${tag.color}`,
                            }}
                            className="cursor-pointer px-2 py-0.5 text-xs transition-all hover:opacity-80"
                            onClick={() => {
                              if (isSelected) {
                                setDocFilterTags(docFilterTags.filter(id => id !== tag.id));
                              } else {
                                setDocFilterTags([...docFilterTags, tag.id]);
                              }
                            }}
                          >
                            {tag.name}
                            {isSelected && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        );
                      })}
                      {docFilterTags.length > 0 && (
                        <Badge
                          variant="outline"
                          className="cursor-pointer px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                          onClick={() => setDocFilterTags([])}
                        >
                          清除全部
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* 文档列表 */}
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>暂无文档，请上传</p>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>未找到匹配的文档</p>
                    <Button 
                      variant="link" 
                      onClick={() => {
                        setDocSearchQuery('');
                        setDocSearchInput('');
                        setDocFilterTags([]);
                      }}
                    >
                      清除筛选条件
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {paginatedDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.name || doc.original_name}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                                <span>{formatFileSize(doc.file_size)}</span>
                                <span>·</span>
                                <span>{doc.chunk_count || 0} 个知识块</span>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  {getStatusIcon(doc.vector_status)}
                                  {getStatusLabel(doc.vector_status)}
                                </span>
                              </div>
                              {/* 标签显示 */}
                              {doc.tags && doc.tags.length > 0 && (
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  {doc.tags.map((tag) => (
                                    <Badge
                                      key={tag.id}
                                      style={{ backgroundColor: tag.color + '20', color: tag.color }}
                                      className="text-xs px-1.5 py-0 h-5"
                                    >
                                      {tag.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {doc.vector_error && (
                                <p className="text-xs text-red-500 mt-1 truncate" title={doc.vector_error}>
                                  错误: {doc.vector_error}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* 失败或待处理状态显示重新处理按钮 */}
                            {(doc.vector_status === 'failed' || doc.vector_status === 'pending') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReprocessDocument(doc.id)}
                                title="重新处理"
                              >
                                <RefreshCw className="h-4 w-4 mr-1" />
                                {doc.vector_status === 'failed' ? '重试' : '处理'}
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDocPreviewData({
                                      id: doc.id,
                                      name: doc.name || '',
                                      originalName: doc.original_name,
                                      fileType: doc.file_type,
                                      fileSize: doc.file_size,
                                      status: doc.vector_status,
                                      chunkCount: doc.chunk_count,
                                      tags: doc.tags,
                                      createdAt: doc.created_at,
                                    });
                                    setDocPreviewOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  预览
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openEditTagsDialog(doc)}
                                >
                                  <Tag className="h-4 w-4 mr-2" />
                                  编辑标签
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleReprocessDocument(doc.id)}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  重新处理
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  删除
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 分页控件 */}
                    {docTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                          第 {docPage} / {docTotalPages} 页，共 {filteredDocuments.length} 条
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDocPage(Math.max(1, docPage - 1))}
                            disabled={docPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            上一页
                          </Button>
                          <div className="flex items-center gap-1">
                            {/* 页码按钮 */}
                            {Array.from({ length: Math.min(5, docTotalPages) }, (_, i) => {
                              let pageNum;
                              if (docTotalPages <= 5) {
                                pageNum = i + 1;
                              } else if (docPage <= 3) {
                                pageNum = i + 1;
                              } else if (docPage >= docTotalPages - 2) {
                                pageNum = docTotalPages - 4 + i;
                              } else {
                                pageNum = docPage - 2 + i;
                              }
                              return (
                                <Button
                                  key={pageNum}
                                  variant={docPage === pageNum ? "default" : "outline"}
                                  size="sm"
                                  className="w-8 h-8 p-0"
                                  onClick={() => setDocPage(pageNum)}
                                >
                                  {pageNum}
                                </Button>
                              );
                            })}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDocPage(Math.min(docTotalPages, docPage + 1))}
                            disabled={docPage === docTotalPages}
                          >
                            下一页
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 右侧：知识库检索 */}
          <div className="space-y-6">
            <Card className="border-blue-100">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border-b border-blue-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-600 text-white rounded-lg">
                      <FileSearch className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">材料知识库检索</CardTitle>
                      <CardDescription>
                        基于 RAG 的语义向量检索
                      </CardDescription>
                    </div>
                  </div>
                  {/* 对话模式切换按钮 */}
                  <Button
                    variant={conversationMode ? "default" : "outline"}
                    size="sm"
                    onClick={handleToggleConversationMode}
                    className={conversationMode ? "bg-blue-600" : ""}
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    {conversationMode ? '对话模式' : '普通模式'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  {/* 标签过滤选择器 */}
                  {tags.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500 flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        按标签过滤
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => {
                          const isSelected = selectedDocTags.includes(tag.id);
                          return (
                            <Badge
                              key={tag.id}
                              style={{
                                backgroundColor: isSelected ? tag.color : tag.color + '20',
                                color: isSelected ? '#fff' : tag.color,
                                borderColor: tag.color,
                                border: `1px solid ${tag.color}`,
                              }}
                              className="cursor-pointer px-2 py-0.5 text-xs transition-all hover:opacity-80"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedDocTags(selectedDocTags.filter(id => id !== tag.id));
                                } else {
                                  setSelectedDocTags([...selectedDocTags, tag.id]);
                                }
                              }}
                            >
                              {tag.name}
                            </Badge>
                          );
                        })}
                        {selectedDocTags.length > 0 && (
                          <Badge
                            variant="outline"
                            className="cursor-pointer px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                            onClick={() => setSelectedDocTags([])}
                          >
                            清除
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 连续对话历史展示 */}
                  {conversationMode && conversationHistory.length > 0 && (
                    <div className="max-h-64 overflow-y-auto space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      {conversationHistory.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex gap-2",
                            msg.role === 'user' ? "justify-end" : "justify-start"
                          )}
                        >
                          {msg.role === 'assistant' && (
                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                              <Sparkles className="w-3 h-3 text-white" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                              msg.role === 'user'
                                ? "bg-blue-600 text-white"
                                : "bg-white border border-slate-200"
                            )}
                          >
                            <p>{msg.content}</p>
                            {msg.results && msg.results.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {msg.results.slice(0, 2).map((r, i) => (
                                  <div
                                    key={i}
                                    className="text-xs p-2 rounded bg-slate-100 cursor-pointer hover:bg-slate-200"
                                    onClick={() => {
                                      const details: SearchDetail[] = msg.results!.map((r) => ({
                                        documentName: r.source || '搜索结果',
                                        score: r.score,
                                        content: r.content,
                                        chunkIndex: r.chunkIndex,
                                        metadata: r.metadata,
                                      }));
                                      setSearchDetailResults(details);
                                      setSearchDetailIndex(i);
                                      setSearchDetailOpen(true);
                                    }}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="truncate font-medium">{r.source}</span>
                                      <span className="text-blue-600">{(r.score * 100).toFixed(1)}%</span>
                                    </div>
                                    <p className="truncate text-slate-500 mt-0.5">{r.content}</p>
                                  </div>
                                ))}
                                {msg.results.length > 2 && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="w-full text-xs h-auto py-1"
                                    onClick={() => {
                                      const details: SearchDetail[] = msg.results!.map((r) => ({
                                        documentName: r.source || '搜索结果',
                                        score: r.score,
                                        content: r.content,
                                        chunkIndex: r.chunkIndex,
                                        metadata: r.metadata,
                                      }));
                                      setSearchDetailResults(details);
                                      setSearchDetailIndex(0);
                                      setSearchDetailOpen(true);
                                    }}
                                  >
                                    查看全部 {msg.results.length} 个结果
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                          {msg.role === 'user' && (
                            <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center shrink-0 text-xs font-medium">
                              我
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 搜索输入框 */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder={conversationMode ? "输入追问或新问题..." : "输入问题或关键词进行语义检索..."}
                        value={conversationMode ? currentQuestion : searchQuery}
                        onChange={(e) => conversationMode ? setCurrentQuestion(e.target.value) : setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="pl-9"
                      />
                    </div>
                    <Button
                      onClick={handleSearch}
                      disabled={searching || (conversationMode ? !currentQuestion.trim() : !searchQuery.trim())}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* 连续对话模式下的清空按钮 */}
                  {conversationMode && conversationHistory.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearConversation}
                      className="w-full text-xs text-slate-500"
                    >
                      清空对话历史
                    </Button>
                  )}

                  {/* 普通模式搜索结果 */}
                  {!conversationMode && searchResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">
                          找到 {searchResults.length} 个相关结果
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-blue-600 h-6"
                          onClick={() => {
                            const details: SearchDetail[] = searchResults.map((r) => ({
                              documentName: r.source || '搜索结果',
                              score: r.score,
                              content: r.content,
                              chunkIndex: r.chunkIndex,
                              metadata: r.metadata,
                            }));
                            setSearchDetailResults(details);
                            setSearchDetailIndex(0);
                            setSearchDetailOpen(true);
                          }}
                        >
                          查看全部详情
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {searchResults.slice(0, 3).map((result, index) => {
                          const scorePercent = (result.score * 100).toFixed(1);
                          const isHighScore = result.score >= 0.7;
                          return (
                            <div
                              key={index}
                              className="group p-3 rounded-lg border border-slate-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                              onClick={() => {
                                // 点击展开详细预览
                                const details: SearchDetail[] = searchResults.map((r) => ({
                                  documentName: r.source || '搜索结果',
                                  score: r.score,
                                  content: r.content,
                                  chunkIndex: r.chunkIndex,
                                  metadata: r.metadata,
                                }));
                                setSearchDetailResults(details);
                                setSearchDetailIndex(index);
                                setSearchDetailOpen(true);
                              }}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                  <span className="text-xs text-slate-600 truncate font-medium">
                                    {result.source}
                                  </span>
                                  {result.chunkIndex !== undefined && (
                                    <Badge variant="outline" className="text-xs font-mono shrink-0">
                                      #{result.chunkIndex + 1}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-full rounded-full',
                                        isHighScore ? 'bg-green-500' : 'bg-blue-400'
                                      )}
                                      style={{ width: `${scorePercent}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    'text-xs font-mono font-medium',
                                    isHighScore ? 'text-green-600' : 'text-blue-600'
                                  )}>
                                    {scorePercent}%
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-slate-600 line-clamp-2 group-hover:text-slate-800">
                                {result.content}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-slate-400">
                                  点击查看详情
                                </span>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {searchResults.length > 3 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => {
                            const details: SearchDetail[] = searchResults.map((r) => ({
                              documentName: r.source || '搜索结果',
                              score: r.score,
                              content: r.content,
                              chunkIndex: r.chunkIndex,
                              metadata: r.metadata,
                            }));
                            setSearchDetailResults(details);
                            setSearchDetailIndex(0);
                            setSearchDetailOpen(true);
                          }}
                        >
                          查看全部 {searchResults.length} 个结果
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 标签管理 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>标签管理</CardTitle>
                    <CardDescription>管理文档分类标签</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTagDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    新建
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无标签，点击上方按钮创建
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        style={{ backgroundColor: tag.color + '20', color: tag.color }}
                        className="flex items-center gap-1 pr-1"
                      >
                        <Tag className="h-3 w-3" />
                        {tag.name}
                        <span className="text-xs opacity-70">({tag.document_count || 0})</span>
                        <button
                          className="ml-1 hover:opacity-70"
                          onClick={() => handleDeleteTag(tag.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* 上传对话框 */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-xl h-[480px] p-0 overflow-hidden border-0 shadow-2xl flex flex-col">
          {/* 标题区域 - 固定高度 */}
          <div className="flex-shrink-0 p-6 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-xl">上传文档</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-2">
                支持 PDF、Word、TXT 等格式，文件将自动处理并向量化
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* 内容区域 - 自适应高度，可滚动 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50/50">
            <ChunkUpload
              knowledgeBaseId={kbId}
              accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.csv,.json"
              multiple={true}
              maxSize={2048}
              maxFiles={10}
              onComplete={handleUploadComplete}
              hint="拖拽文件到此处或点击选择（支持最大 2GB 文件）"
              tags={tags}
              selectedTags={selectedDocTags}
              onTagsChange={setSelectedDocTags}
              useBailian={true}
            />
          </div>

          {/* 底部按钮 - 固定高度 */}
          <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-slate-50/50">
            <Button variant="outline" className="w-full" onClick={() => setUploadDialogOpen(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== 三处预览对话框 ========== */}

      {/* 1. 文档预览对话框 - 文档列表中预览按钮触发 */}
      <DocumentPreviewDialog
        isOpen={docPreviewOpen}
        onOpenChange={setDocPreviewOpen}
        document={docPreviewData}
        knowledgeBaseId={kbId}
      />

      {/* 2. 检索预览对话框 - 单个检索结果快速预览（保留用于其他场景） */}
      {retrievalPreviewData && (
        <RetrievalPreviewDialog
          isOpen={retrievalPreviewOpen}
          onOpenChange={setRetrievalPreviewOpen}
          documentName={retrievalPreviewData.documentName}
          score={retrievalPreviewData.score}
          content={retrievalPreviewData.content}
          chunkIndex={retrievalPreviewData.chunkIndex}
        />
      )}

      {/* 3. 搜索结果详细展示对话框 - 导航浏览所有搜索结果 */}
      <SearchResultsDetailDialog
        isOpen={searchDetailOpen}
        onOpenChange={setSearchDetailOpen}
        results={searchDetailResults}
        currentIndex={searchDetailIndex}
        onNavigate={setSearchDetailIndex}
      />

      {/* 新建标签对话框 */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建标签</DialogTitle>
            <DialogDescription>
              创建标签用于分类管理文档
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">标签名称</Label>
              <Input
                id="tag-name"
                placeholder="输入标签名称"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-color">标签颜色</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="tag-color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <Input
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => {
              handleCreateTag();
              setTagDialogOpen(false);
            }}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑文档标签对话框 */}
      <Dialog open={editTagsDialogOpen} onOpenChange={setEditTagsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑文档标签</DialogTitle>
            <DialogDescription>
              选择要关联的标签
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {tags.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                <p>暂无标签</p>
                <Button
                  variant="link"
                  onClick={() => {
                    setEditTagsDialogOpen(false);
                    setTagDialogOpen(true);
                  }}
                >
                  创建标签
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = selectedDocTags.includes(tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      style={{
                        backgroundColor: isSelected ? tag.color : tag.color + '20',
                        color: isSelected ? '#fff' : tag.color,
                        borderColor: tag.color,
                        border: `1px solid ${tag.color}`,
                      }}
                      className="cursor-pointer px-3 py-1 text-sm transition-all hover:opacity-80"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDocTags(selectedDocTags.filter(id => id !== tag.id));
                        } else {
                          setSelectedDocTags([...selectedDocTags, tag.id]);
                        }
                      }}
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTagsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveDocTags}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
