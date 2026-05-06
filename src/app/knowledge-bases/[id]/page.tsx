'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ChunkUpload, ChunkUploadFile } from '@/components/ui/chunk-upload';
import FilePreviewDialog from '@/components/ui/file-preview-dialog';
import FileDetailDialog from '@/components/ui/file-detail-dialog';
import RetrievalPreviewDialog from '@/components/ui/retrieval-preview-dialog';
import SearchResultsDetailDialog, { SearchDetail } from '@/components/ui/search-results-detail-dialog';
import EditTagsDialog from '@/components/ui/edit-tags-dialog';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Upload,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Presentation,
  File,
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
  Info,
  Link,
  FolderOpen,
  Globe,
  Users,
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
  chunk_count?: number;
  tags?: Tag[];
  created_at: string;
  storage_path?: string;
  // 百炼额外字段
  progress?: number;
  error_message?: string;
  source_type?: string;
  category_id?: string;
  file_id?: string;
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
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // ========== IMA 知识库状态 ==========
  const [knowledgeSource, setKnowledgeSource] = useState<'bailian' | 'ima'>('bailian');
  const [imaConnected, setImaConnected] = useState(false);
  const [imaSettings, setImaSettings] = useState<any>(null);

  // ========== 连续对话检索状态 ==========
  const [conversationMode, setConversationMode] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  
  // 对话历史容器引用，用于自动滚动
  const conversationContainerRef = useRef<HTMLDivElement>(null);

  // ========== 预览状态 ==========
  // 1. 文档预览状态（文档列表中预览按钮）
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  const [docPreviewData, setDocPreviewData] = useState<{
    id: string;
    name: string;
    fileType: string;
    previewUrl?: string;
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

  // 4. 文件详情对话框状态
  const [fileDetailOpen, setFileDetailOpen] = useState(false);
  const [fileDetailDocId, setFileDetailDocId] = useState<string | null>(null);

  // 标签相关状态
  const [selectedDocTags, setSelectedDocTags] = useState<string[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTagsDialogOpen, setEditTagsDialogOpen] = useState(false);
  const [historyTags, setHistoryTags] = useState<Array<{id: string; name: string; documentCount?: number}>>([]); // 历史标签列表

  // ========== 文档列表分页、搜索、过滤状态（前端） ==========
  const [docPage, setDocPage] = useState(1);
  const [docPageSize] = useState(10);
  const [docSearchInput, setDocSearchInput] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState(''); // 实际搜索词
  const [docStatusFilter, setDocStatusFilter] = useState<string>('ALL'); // 状态过滤
  const [docTagFilters, setDocTagFilters] = useState<string[]>([]); // 标签过滤（多选）
  const [docsLoading, setDocsLoading] = useState(false);

  // ========== IMA 知识库专用状态 ==========
  const [imaInfo, setImaInfo] = useState<any>(null);
  const [imaSearchQuery, setImaSearchQuery] = useState('');
  const [imaSearchResults, setImaSearchResults] = useState<any[]>([]);
  const [imaSearching, setImaSearching] = useState(false);
  const [imaBrowsePath, setImaBrowsePath] = useState<string>('');
  const [imaImportUrlOpen, setImaImportUrlOpen] = useState(false);
  const [imaImportUrl, setImaImportUrl] = useState('');
  const [imaImporting, setImaImporting] = useState(false);

  // ========== 前端筛选与分页（useMemo） ==========
  // 筛选后的文档列表
  const filteredDocuments = useMemo(() => {
    let result = documents;

    // 状态过滤
    if (docStatusFilter && docStatusFilter !== 'ALL') {
      result = result.filter(doc => doc.vector_status === docStatusFilter);
    }

    // 标签过滤（多选，OR逻辑：文档包含任一选中标签即可）
    if (docTagFilters.length > 0) {
      result = result.filter(doc => {
        const docTags = doc.tags?.map(t => t.name) || [];
        return docTagFilters.some(tag => docTags.includes(tag));
      });
    }

    // 名称搜索（模糊匹配）
    if (docSearchQuery) {
      const query = docSearchQuery.toLowerCase();
      result = result.filter(doc => 
        (doc.name || doc.original_name || '').toLowerCase().includes(query)
      );
    }

    return result;
  }, [documents, docStatusFilter, docTagFilters, docSearchQuery]);

  // 分页后的文档列表
  const paginatedDocuments = useMemo(() => {
    const start = (docPage - 1) * docPageSize;
    return filteredDocuments.slice(start, start + docPageSize);
  }, [filteredDocuments, docPage, docPageSize]);

  // 总页数
  const docTotalPages = useMemo(() => {
    return Math.ceil(filteredDocuments.length / docPageSize);
  }, [filteredDocuments.length, docPageSize]);

  useEffect(() => {
    fetchKnowledgeBaseData();
  }, [kbId]);

  // 对话历史自动滚动到底部（仅滚动容器内部，不影响页面滚动）
  useEffect(() => {
    if (conversationHistory.length > 0 && conversationContainerRef.current) {
      // 使用 setTimeout 确保 DOM 更新后再滚动
      setTimeout(() => {
        const container = conversationContainerRef.current;
        if (container) {
          // 只滚动容器内部，不影响页面滚动
          container.scrollTop = container.scrollHeight;
        }
      }, 100);
    }
  }, [conversationHistory]);

  // 获取所有文档（前端分页模式）
  const fetchDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      if (knowledgeSource === 'ima') {
        // IMA 知识库：浏览知识库内容
        const res = await fetch(`/api/ima/knowledge-bases/${kbId}/browse`);
        const data = await res.json();
        if (data.success && data.data) {
          const docs = (data.data.items || []).map((item: any) => ({
            id: item.knowledge_id || item.id || '',
            name: item.title || item.name || '',
            original_name: item.title || item.name || '',
            file_type: item.type || item.file_type || 'unknown',
            file_size: item.file_size || 0,
            vector_status: 'completed' as string,
            chunk_count: item.chunk_count,
            tags: [],
            created_at: item.create_time ? new Date(item.create_time * 1000).toISOString() : '',
            source_type: item.type,
          }));
          setDocuments(docs);
        } else {
          setDocuments([]);
        }
      } else {
        // 百炼知识库：获取所有文档（前端分页）
        const res = await fetch(`/api/bailian/knowledge-bases/${kbId}/documents?all=true`);
        const data = await res.json();
        
        if (data.success && data.data) {
          // 规范化文档数据
          const docs = (data.data.documents || []).map((doc: any) => ({
            id: doc.documentId || doc.id || '',
            name: doc.documentName || doc.name || '',
            original_name: doc.original_name || doc.documentName || doc.name || '',
            file_type: doc.fileType || doc.file_type || '',
            file_size: doc.sizeInBytes || doc.file_size || 0,
            vector_status: doc.status || doc.vector_status || 'pending',
            vector_error: doc.errorMessage || doc.vector_error,
            chunk_count: doc.chunk_count,
            tags: Array.isArray(doc.tags) ? doc.tags.map((t: any) => ({
              id: typeof t === 'string' ? t : t.id || t.name,
              name: typeof t === 'string' ? t : t.name || t.id,
              color: typeof t === 'string' ? '#3b82f6' : t.color || '#3b82f6',
            })) : [],
            created_at: doc.gmtCreate || doc.created_at || '',
            storage_path: doc.storage_path,
            progress: doc.progress,
            error_message: doc.errorMessage || doc.error_message,
            source_type: doc.sourceType || doc.source_type,
            category_id: doc.categoryId || doc.category_id,
            file_id: doc.fileId || doc.file_id,
          }));
          setDocuments(docs);
        } else {
          setDocuments([]);
        }
      }
    } catch (error) {
      console.error('获取文档列表失败:', error);
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, [kbId, knowledgeSource]);

  // 初始加载时获取文档
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // 筛选条件变化时重置页码
  useEffect(() => {
    setDocPage(1);
  }, [docSearchQuery, docStatusFilter, docTagFilters]);

  const fetchKnowledgeBaseData = async () => {
    try {
      if (knowledgeSource === 'ima') {
        // IMA 知识库：先获取详情，再浏览内容
        const [infoRes, browseRes] = await Promise.all([
          fetch(`/api/ima/knowledge-bases/${kbId}/info`),
          fetch(`/api/ima/knowledge-bases/${kbId}/browse?limit=50`),
        ]);
        const infoData = await infoRes.json();
        const browseData = await browseRes.json();
        
        if (infoData.success) {
          const info = infoData.data;
          setImaInfo(info);
          setKnowledgeBase({
            id: info.id || kbId,
            name: info.name || 'IMA知识库',
            description: info.description || '',
            type: 'ima' as any,
            structureType: 'unstructured',
            status: 'active',
            embeddingModelName: 'IMA',
            documentCount: info.contentCount || 0,
            createdAt: '',
            updatedAt: '',
          });
          setStats({ documentCount: info.contentCount || 0 });
        }
        
        if (browseData.success) {
          // 映射IMA知识条目为统一文档格式
          const imaDocs = (browseData.data?.items || []).map((item: any) => ({
            id: item.knowledge_id || item.id || '',
            name: item.title || item.name || '',
            original_name: item.title || item.name || '',
            file_type: item.type || item.file_type || 'unknown',
            file_size: item.file_size || 0,
            vector_status: 'completed' as string,
            chunk_count: item.chunk_count,
            tags: [],
            created_at: item.create_time ? new Date(item.create_time * 1000).toISOString() : '',
            source_type: item.type,
          }));
          setDocuments(imaDocs);
        }
      } else {
        // 百炼知识库：原有逻辑
        const [kbRes, statsRes, historyTagsRes] = await Promise.all([
          fetch(`/api/bailian/knowledge-bases/${kbId}`),
          fetch(`/api/bailian/knowledge-bases/${kbId}/stats`),
          fetch(`/api/bailian/tags`), // 获取全局历史标签
        ]);

        const kbData = await kbRes.json();
        const statsData = await statsRes.json();
        const historyTagsData = await historyTagsRes.json();

        if (kbData.success) {
          setKnowledgeBase(kbData.data);
        } else {
          console.error('[Knowledge Base Detail] Failed to fetch knowledge base:', kbData.message);
        }
        if (statsData.success) setStats(statsData.data);
        if (historyTagsData.success) setHistoryTags(historyTagsData.data || []);
      }
    } catch (error) {
      console.error('获取知识库数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取 IMA 知识库配置及当前引擎
  const fetchIMASettings = useCallback(async () => {
    try {
      const [settingsRes, providerRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/knowledge-provider'),
      ]);
      const settingsData = await settingsRes.json();
      const providerData = await providerRes.json();

      if (settingsData.success && settingsData.data?.ima_knowledge_base) {
        setImaSettings(settingsData.data.ima_knowledge_base);
      }

      // 根据后端配置的活跃引擎自动设置
      if (providerData.success) {
        setKnowledgeSource(providerData.data.activeProvider);
        if (providerData.data.activeProvider === 'ima') {
          setImaConnected(true);
        }
      }
    } catch (error) {
      console.error('获取IMA设置失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchIMASettings();
  }, [fetchIMASettings]);

  const handleUploadComplete = (files: ChunkUploadFile[]) => {
    // 先关闭对话框，再刷新数据（避免 DOM 状态冲突）
    setUploadDialogOpen(false);
    // 延迟刷新数据，让对话框关闭动画完成
    setTimeout(() => {
      fetchKnowledgeBaseData();
    }, 100);
  };

  // ========== IMA 专用处理函数 ==========
  const handleIMASearch = async () => {
    if (!imaSearchQuery.trim()) return;
    setImaSearching(true);
    setImaSearchResults([]);
    try {
      const res = await fetch(`/api/ima/knowledge-bases/${kbId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: imaSearchQuery.trim(), topK: 10 }),
      });
      const data = await res.json();
      if (data.success) {
        setImaSearchResults(data.data?.results || []);
      }
    } catch (err) {
      console.error('IMA搜索失败:', err);
    } finally {
      setImaSearching(false);
    }
  };

  const handleIMABrowseFolder = async (folderId: string) => {
    setImaBrowsePath(folderId);
    setDocsLoading(true);
    try {
      const res = await fetch(`/api/ima/knowledge-bases/${kbId}/browse?parent_id=${folderId}&limit=50`);
      const data = await res.json();
      if (data.success) {
        const imaDocs = (data.data?.items || []).map((item: any) => ({
          id: item.knowledge_id || item.id || '',
          name: item.title || item.name || '',
          original_name: item.title || item.name || '',
          file_type: item.type || item.file_type || 'unknown',
          file_size: item.file_size || 0,
          vector_status: 'completed' as string,
          chunk_count: item.chunk_count,
          tags: [],
          created_at: item.create_time ? new Date(item.create_time * 1000).toISOString() : '',
          source_type: item.type,
        }));
        setDocuments(imaDocs);
      }
    } catch (err) {
      console.error('IMA浏览失败:', err);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleIMAImportUrl = async () => {
    if (!imaImportUrl.trim()) return;
    setImaImporting(true);
    try {
      const res = await fetch(`/api/ima/knowledge-bases/${kbId}/import-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [imaImportUrl.trim()] }),
      });
      const data = await res.json();
      if (data.success) {
        setImaImportUrlOpen(false);
        setImaImportUrl('');
        // 刷新知识库数据
        fetchKnowledgeBaseData();
      } else {
        alert(data.error || '导入URL失败');
      }
    } catch (err) {
      console.error('IMA导入URL失败:', err);
      alert('导入URL失败');
    } finally {
      setImaImporting(false);
    }
  };

  const handleIMABackToRoot = () => {
    setImaBrowsePath('');
    fetchKnowledgeBaseData();
  };

  const handleSearch = async () => {
    const query = currentQuestion.trim() || searchQuery.trim();
    if (!query) return;

    setSearching(true);
    try {
      let results = [];

      if (knowledgeSource === 'ima') {
        // IMA 知识库搜索（API内部自动获取配置）
        const res = await fetch(`/api/ima/knowledge-bases/${kbId}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            topK: 5,
          }),
        });

        const data = await res.json();
        if (data.success) {
          results = data.data.results || [];
        }
      } else {
        // 百炼知识库搜索（默认）
        const res = await fetch(`/api/bailian/knowledge-bases/${kbId}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            topK: 5,
            useConversationMode: conversationMode && conversationHistory.length > 0,
            conversationHistory: conversationMode ? conversationHistory.map(msg => ({
              role: msg.role,
              content: msg.content,
            })) : undefined,
          }),
        });

        const data = await res.json();
        if (data.success) {
          results = data.data.results || [];
        }
      }

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

  const handleUpdateDocTags = async (fileId: string, tags: string[]) => {
    try {
      const response = await fetch(`/api/bailian/files/${fileId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '更新标签失败');
      }
      // 刷新文档列表和标签列表
      fetchDocuments();
      fetchKnowledgeBaseData();
    } catch (error) {
      console.error('更新文档标签失败:', error);
      throw error;
    }
  };

  // 打开编辑标签对话框
  const openEditTagsDialog = async (doc: Document) => {
    setEditingDocId(doc.id);
    setEditTagsDialogOpen(true);
    
    // 从 API 获取最新的文件标签
    try {
      const response = await fetch(`/api/bailian/files/${doc.id}/tags`);
      const result = await response.json();
      if (result.success && result.data?.tags) {
        setSelectedDocTags(result.data.tags);
      } else {
        // 如果 API 调用失败，从文档对象中提取标签
        const docTags = doc.tags?.map(t => typeof t === 'string' ? t : t.name || t.id) || [];
        setSelectedDocTags(docTags);
      }
    } catch (error) {
      console.error('获取文件标签失败:', error);
      // 出错时从文档对象中提取标签
      const docTags = doc.tags?.map(t => typeof t === 'string' ? t : t.name || t.id) || [];
      setSelectedDocTags(docTags);
    }
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

  // 根据文件后缀获取对应图标
  const getFileIcon = (fileName: string, fileType: string) => {
    // 优先使用 fileType，如果 fileType 无效则从文件名提取后缀
    let ext: string = fileType?.toLowerCase() || 'unknown';
    
    // 如果 fileType 无效（unknown 或空），尝试从文件名提取后缀
    if (ext === 'unknown' || ext === '') {
      const parts = fileName.split('.');
      if (parts.length > 1) {
        ext = parts.pop()?.toLowerCase() || 'unknown';
      }
    }
    
    const iconConfig: Record<string, { icon: React.ReactNode; color: string }> = {
      // PDF
      pdf: { icon: <FileText className="h-5 w-5" />, color: 'text-red-500' },
      
      // Word
      doc: { icon: <FileText className="h-5 w-5" />, color: 'text-blue-600' },
      docx: { icon: <FileText className="h-5 w-5" />, color: 'text-blue-600' },
      
      // Excel
      xls: { icon: <FileSpreadsheet className="h-5 w-5" />, color: 'text-green-600' },
      xlsx: { icon: <FileSpreadsheet className="h-5 w-5" />, color: 'text-green-600' },
      
      // PowerPoint
      ppt: { icon: <Presentation className="h-5 w-5" />, color: 'text-orange-500' },
      pptx: { icon: <Presentation className="h-5 w-5" />, color: 'text-orange-500' },
      
      // 图片
      png: { icon: <FileImage className="h-5 w-5" />, color: 'text-purple-500' },
      jpg: { icon: <FileImage className="h-5 w-5" />, color: 'text-purple-500' },
      jpeg: { icon: <FileImage className="h-5 w-5" />, color: 'text-purple-500' },
      gif: { icon: <FileImage className="h-5 w-5" />, color: 'text-purple-500' },
      svg: { icon: <FileImage className="h-5 w-5" />, color: 'text-purple-500' },
      webp: { icon: <FileImage className="h-5 w-5" />, color: 'text-purple-500' },
      bmp: { icon: <FileImage className="h-5 w-5" />, color: 'text-purple-500' },
      
      // 视频
      mp4: { icon: <FileVideo className="h-5 w-5" />, color: 'text-pink-500' },
      avi: { icon: <FileVideo className="h-5 w-5" />, color: 'text-pink-500' },
      mov: { icon: <FileVideo className="h-5 w-5" />, color: 'text-pink-500' },
      mkv: { icon: <FileVideo className="h-5 w-5" />, color: 'text-pink-500' },
      wmv: { icon: <FileVideo className="h-5 w-5" />, color: 'text-pink-500' },
      
      // 音频
      mp3: { icon: <FileAudio className="h-5 w-5" />, color: 'text-cyan-500' },
      wav: { icon: <FileAudio className="h-5 w-5" />, color: 'text-cyan-500' },
      flac: { icon: <FileAudio className="h-5 w-5" />, color: 'text-cyan-500' },
      aac: { icon: <FileAudio className="h-5 w-5" />, color: 'text-cyan-500' },
      
      // 代码
      js: { icon: <FileCode className="h-5 w-5" />, color: 'text-yellow-500' },
      jsx: { icon: <FileCode className="h-5 w-5" />, color: 'text-yellow-500' },
      ts: { icon: <FileCode className="h-5 w-5" />, color: 'text-blue-500' },
      tsx: { icon: <FileCode className="h-5 w-5" />, color: 'text-blue-500' },
      py: { icon: <FileCode className="h-5 w-5" />, color: 'text-green-500' },
      java: { icon: <FileCode className="h-5 w-5" />, color: 'text-red-500' },
      go: { icon: <FileCode className="h-5 w-5" />, color: 'text-cyan-400' },
      rs: { icon: <FileCode className="h-5 w-5" />, color: 'text-orange-400' },
      cpp: { icon: <FileCode className="h-5 w-5" />, color: 'text-blue-400' },
      c: { icon: <FileCode className="h-5 w-5" />, color: 'text-blue-400' },
      h: { icon: <FileCode className="h-5 w-5" />, color: 'text-purple-400' },
      json: { icon: <FileCode className="h-5 w-5" />, color: 'text-yellow-600' },
      xml: { icon: <FileCode className="h-5 w-5" />, color: 'text-orange-400' },
      html: { icon: <FileCode className="h-5 w-5" />, color: 'text-orange-500' },
      css: { icon: <FileCode className="h-5 w-5" />, color: 'text-blue-400' },
      sql: { icon: <FileCode className="h-5 w-5" />, color: 'text-blue-300' },
      
      // 压缩文件
      zip: { icon: <FileArchive className="h-5 w-5" />, color: 'text-amber-500' },
      rar: { icon: <FileArchive className="h-5 w-5" />, color: 'text-amber-500' },
      '7z': { icon: <FileArchive className="h-5 w-5" />, color: 'text-amber-500' },
      tar: { icon: <FileArchive className="h-5 w-5" />, color: 'text-amber-500' },
      gz: { icon: <FileArchive className="h-5 w-5" />, color: 'text-amber-500' },
      
      // 文本
      txt: { icon: <FileText className="h-5 w-5" />, color: 'text-gray-500' },
      md: { icon: <FileText className="h-5 w-5" />, color: 'text-gray-500' },
      markdown: { icon: <FileText className="h-5 w-5" />, color: 'text-gray-500' },
      rtf: { icon: <FileText className="h-5 w-5" />, color: 'text-gray-500' },
    };
    
    const config = iconConfig[ext];
    if (config) {
      return <span className={`shrink-0 ${config.color}`}>{config.icon}</span>;
    }
    
    // 默认图标
    return <File className="h-5 w-5 text-gray-400 shrink-0" />;
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
                  {knowledgeSource === 'ima' && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      <Database className="h-3 w-3 mr-1" />
                      IMA知识库
                    </Badge>
                  )}
                  <Button onClick={() => {
                    if (knowledgeSource === 'ima') {
                      setImaImportUrlOpen(true);
                    } else {
                      setUploadDialogOpen(true);
                    }
                  }}>
                    {knowledgeSource === 'ima' ? (
                      <>
                        <Link className="h-4 w-4 mr-2" />
                        导入URL
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        上传文档
                      </>
                    )}
                  </Button>
                </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {knowledgeSource === 'ima' ? (
          /* ========== IMA 知识库详情视图 ========== */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：IMA知识库内容浏览 */}
            <div className="lg:col-span-2 space-y-6">
              {/* IMA知识库信息卡片 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    知识库信息
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md">
                        <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">内容数量</p>
                        <p className="text-lg font-semibold">{imaInfo?.contentCount || stats.documentCount || 0}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-md">
                        <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">成员数量</p>
                        <p className="text-lg font-semibold">{imaInfo?.memberCount || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-md">
                        <Globe className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">类型</p>
                        <p className="text-sm font-semibold">{imaInfo?.baseType === 'private' ? '私有' : imaInfo?.baseType === 'team' ? '团队' : imaInfo?.baseType || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-md">
                        <FileText className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">创建者</p>
                        <p className="text-sm font-semibold truncate max-w-[100px]">{imaInfo?.creator || '-'}</p>
                      </div>
                    </div>
                  </div>
                  {imaInfo?.description && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground">{imaInfo.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* IMA 文件浏览 */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      知识库内容
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {imaBrowsePath && (
                        <Button variant="ghost" size="sm" onClick={handleIMABackToRoot}>
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          返回上级
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => fetchKnowledgeBaseData()}>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        刷新
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setImaImportUrlOpen(true)}>
                        <Globe className="h-4 w-4 mr-1" />
                        导入URL
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {docsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">加载中...</span>
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="text-center py-12">
                      <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">暂无内容</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setImaImportUrlOpen(true)}>
                        <Globe className="h-4 w-4 mr-1" />
                        导入URL添加内容
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => {
                            if (doc.file_type === 'folder' || doc.source_type === 'folder') {
                              handleIMABrowseFolder(doc.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`p-1.5 rounded ${
                              doc.file_type === 'folder' || doc.source_type === 'folder'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                                : doc.file_type === 'pdf'
                                  ? 'bg-red-100 dark:bg-red-900/30'
                                  : doc.file_type === 'docx' || doc.file_type === 'doc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30'
                                    : 'bg-gray-100 dark:bg-gray-900/30'
                            }`}>
                              {(doc.file_type === 'folder' || doc.source_type === 'folder') ? (
                                <FolderOpen className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                              ) : doc.file_type === 'pdf' ? (
                                <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                              ) : (
                                <File className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{doc.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{doc.file_type?.toUpperCase() || '未知类型'}</span>
                                {doc.created_at && (
                                  <>
                                    <span>·</span>
                                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          {(doc.file_type === 'folder' || doc.source_type === 'folder') && (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 右侧：IMA 搜索 */}
            <div className="space-y-6">
              {/* 搜索面板 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    搜索知识库
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入搜索关键词..."
                      value={imaSearchQuery}
                      onChange={(e) => setImaSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleIMASearch()}
                    />
                    <Button onClick={handleIMASearch} disabled={imaSearching}>
                      {imaSearching ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {imaSearchResults.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">找到 {imaSearchResults.length} 条结果</p>
                      {imaSearchResults.map((result: any, idx: number) => (
                        <div
                          key={result.knowledge_id || idx}
                          className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => {
                            setRetrievalPreviewOpen(true);
                            setRetrievalPreviewData({
                              content: result.content || result.text || '',
                              score: result.score || 0,
                              documentName: result.title || '搜索结果',
                            });
                          }}
                        >
                          <p className="text-sm line-clamp-3">{result.content || result.text || result.title || '无内容'}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {result.title && <span className="truncate max-w-[150px]">{result.title}</span>}
                            {result.score != null && (
                              <>
                                <span>·</span>
                                <span>相关度: {(result.score * 100).toFixed(1)}%</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 操作面板 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    快捷操作
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" onClick={() => setImaImportUrlOpen(true)}>
                    <Globe className="h-4 w-4 mr-2" />
                    导入网页URL
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => fetchKnowledgeBaseData()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新知识库
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
        /* ========== 百炼知识库详情视图 ========== */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：知识库配置与文档列表 - 占2列 */}
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
                      <p className="text-sm font-medium">{stats.documentCount || 0}</p>
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
                    共 {documents.length} 个文档{filteredDocuments.length !== documents.length && `，筛选后 ${filteredDocuments.length} 个`}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* 搜索和过滤栏 */}
                <div className="space-y-3 mb-4">
                  {/* 搜索和状态过滤 */}
                  <div className="flex gap-2 flex-wrap items-center">
                    {/* 状态过滤 */}
                    <Select value={docStatusFilter} onValueChange={setDocStatusFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="全部状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">全部状态</SelectItem>
                        <SelectItem value="FINISH">已完成</SelectItem>
                        <SelectItem value="RUNNING">处理中</SelectItem>
                        <SelectItem value="INSERT_ERROR">处理失败</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* 搜索框 */}
                    <div className="relative flex-1 min-w-[200px]">
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
                    {(docSearchQuery || docStatusFilter !== 'ALL' || docTagFilters.length > 0) && (
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          setDocSearchQuery('');
                          setDocSearchInput('');
                          setDocStatusFilter('ALL');
                          setDocTagFilters([]);
                        }}
                      >
                        清除
                      </Button>
                    )}
                  </div>
                  
                  {/* 标签过滤（多选） */}
                  {historyTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Tag className="w-4 h-4" />
                        标签筛选:
                      </span>
                      {historyTags.map((tag) => (
                        <Badge
                          key={tag.id || tag.name}
                          variant={docTagFilters.includes(tag.name) ? "default" : "outline"}
                          className="cursor-pointer hover:bg-primary/80 transition-colors"
                          onClick={() => {
                            if (docTagFilters.includes(tag.name)) {
                              setDocTagFilters(docTagFilters.filter(t => t !== tag.name));
                            } else {
                              setDocTagFilters([...docTagFilters, tag.name]);
                            }
                          }}
                        >
                          {tag.name}
                          {tag.documentCount !== undefined && (
                            <span className="ml-1 text-xs opacity-70">({tag.documentCount})</span>
                          )}
                          {docTagFilters.includes(tag.name) && (
                            <X className="w-3 h-3 ml-1" />
                          )}
                        </Badge>
                      ))}
                      {docTagFilters.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setDocTagFilters([])}
                        >
                          清除选中
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* 文档列表 */}
                {docsLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground">加载中...</p>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{documents.length === 0 ? '暂无文档，请上传' : '没有匹配的文档'}</p>
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
                            {getFileIcon(doc.name || doc.original_name || '', doc.file_type)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.name || doc.original_name}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                                <span>{formatFileSize(doc.file_size)}</span>
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
                                      fileType: doc.file_type,
                                      previewUrl: doc.storage_path || '',
                                    });
                                    setDocPreviewOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  预览
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setFileDetailDocId(doc.id);
                                    setFileDetailOpen(true);
                                  }}
                                >
                                  <Info className="h-4 w-4 mr-2" />
                                  查看详情
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
            <Card className="border-blue-100 shadow-sm h-full flex flex-col">
              <CardHeader className="bg-gradient-to-r from-blue-50 via-blue-100/50 to-indigo-50/50 border-b border-blue-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md">
                      <FileSearch className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">材料知识库检索</CardTitle>
                      <CardDescription className="mt-0.5">
                        基于 RAG 的智能语义向量检索
                      </CardDescription>
                    </div>
                  </div>
                  {/* 对话模式切换按钮 */}
                  <Button
                    variant={conversationMode ? "default" : "outline"}
                    size="sm"
                    onClick={handleToggleConversationMode}
                    className={conversationMode ? "bg-blue-600 shadow-sm" : "border-blue-200 hover:bg-blue-50"}
                  >
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    {conversationMode ? '对话模式' : '普通模式'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 flex-1 flex flex-col">
                <div className="space-y-4 flex-1 flex flex-col">
                  {/* 连续对话历史展示 */}
                  {conversationMode && conversationHistory.length > 0 && (
                    <div 
                      ref={conversationContainerRef}
                      className="flex-1 min-h-[200px] max-h-[400px] overflow-y-auto space-y-3 p-4 bg-gradient-to-b from-slate-50 to-slate-100/50 rounded-xl border border-slate-200 shadow-inner"
                    >
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
                    <div className="flex-1 space-y-3 overflow-y-auto">
                      <div className="flex items-center justify-between sticky top-0 bg-white py-1">
                        <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-blue-500" />
                          找到 {searchResults.length} 个相关结果
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-blue-600 hover:bg-blue-50"
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
                      <div className="space-y-3">
                        {searchResults.map((result, index) => {
                          const scorePercent = (result.score * 100).toFixed(1);
                          const isHighScore = result.score >= 0.7;
                          return (
                            <div
                              key={index}
                              className="group p-4 rounded-xl border border-slate-200 bg-white cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
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
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="p-1.5 bg-blue-50 rounded-md">
                                    <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                  </div>
                                  <span className="text-sm text-slate-700 truncate font-medium">
                                    {result.source}
                                  </span>
                                  {result.chunkIndex !== undefined && (
                                    <Badge variant="outline" className="text-xs font-mono shrink-0 border-blue-200 text-blue-600">
                                      #{result.chunkIndex + 1}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all',
                                        isHighScore ? 'bg-green-500' : 'bg-blue-500'
                                      )}
                                      style={{ width: `${scorePercent}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    'text-xs font-mono font-semibold min-w-[40px] text-right',
                                    isHighScore ? 'text-green-600' : 'text-blue-600'
                                  )}>
                                    {scorePercent}%
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-slate-600 line-clamp-3 group-hover:text-slate-800 leading-relaxed">
                                {result.content}
                              </p>
                              <div className="flex items-center justify-end mt-3 pt-2 border-t border-slate-100">
                                <span className="text-xs text-blue-500 font-medium flex items-center gap-1 group-hover:text-blue-600">
                                  点击查看详情
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )}{/* end of 百炼/IMA condition */}
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
              tags={historyTags.map(tag => ({ id: tag.id || tag.name, name: tag.name, color: '#3b82f6' }))}
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
      <FilePreviewDialog
        isOpen={docPreviewOpen}
        onOpenChange={setDocPreviewOpen}
        categoryName="知识库文档"
        documentName={docPreviewData?.name}
        fileExtension={docPreviewData?.fileType?.replace('.', '') || 'pdf'}
        previewUrl={docPreviewData?.previewUrl}
        documentId={docPreviewData?.id}
        indexId={kbId}
      />

      {/* 1.5 文件详情对话框 - 查看文件详细信息 */}
      <FileDetailDialog
        isOpen={fileDetailOpen}
        onOpenChange={setFileDetailOpen}
        documentId={fileDetailDocId}
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

      {/* 编辑文档标签对话框 */}
      <EditTagsDialog
        isOpen={editTagsDialogOpen}
        onOpenChange={setEditTagsDialogOpen}
        initialTags={selectedDocTags}
        historyTags={historyTags.map(t => t.name)}
        onSave={async (tags) => {
          if (editingDocId) {
            try {
              await handleUpdateDocTags(editingDocId, tags);
              setEditingDocId(null);
            } catch (error) {
              // 错误已在 handleUpdateDocTags 中处理
            }
          }
        }}
      />

      {/* IMA 导入URL对话框 */}
      <Dialog open={imaImportUrlOpen} onOpenChange={setImaImportUrlOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入网页URL</DialogTitle>
            <DialogDescription>
              支持导入网页、微信公众号文章到知识库，每行一个URL
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <textarea
              className="w-full h-32 p-3 rounded-lg border border-border bg-muted/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="https://example.com/article1&#10;https://example.com/article2"
              id="ima-url-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImaImportUrlOpen(false)}>取消</Button>
            <Button onClick={async () => {
              const input = document.getElementById('ima-url-input') as HTMLTextAreaElement;
              const urls = input?.value.split('\n').map(u => u.trim()).filter(u => u) || [];
              if (urls.length === 0) return;
              try {
                const res = await fetch(`/api/ima/knowledge-bases/${kbId}/import-urls`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ urls }),
                });
                const data = await res.json();
                if (data.success) {
                  setImaImportUrlOpen(false);
                  fetchKnowledgeBaseData();
                } else {
                  alert(data.error || '导入失败');
                }
              } catch (err) {
                alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'));
              }
            }}>
              开始导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
