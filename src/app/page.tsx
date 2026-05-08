'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from '@/components/ui/file-upload';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  KnowledgeBaseCard,
  KnowledgeBaseCardSkeleton,
} from '@/components/knowledge-base/knowledge-base-card';
import {
  FolderKanban,
  Database,
  FileText,
  Settings,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Globe,
  X,
  Upload,
  File,
  FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';

// API基础URL
const API_BASE = '';

interface Project {
  id: string;
  name: string;
  description: string;
  project_number: string;
  status: string;
  created_at: string;
  customer_industry?: string;
  service_type?: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  type: string;
  structureType?: 'unstructured' | 'structured' | 'multimedia';
  status: 'creating' | 'active' | 'failed';
  embeddingModelName?: string;
  rerankModelName?: string;
  rerankMinScore?: number;
  enableRewrite?: boolean;
  chunkSize?: number;
  overlapSize?: number;
  separator?: string;
  sourceType?: string;
  documentIds?: string[];
  documentCount: number;
  sinkType?: string;
  configModel?: 'recommend' | 'custom';
  createdAt?: string;
  updatedAt?: string;
}

interface DictionaryItem {
  id: string;
  type: string;
  label: string;
  value: string;
  sort_order: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createKBOpen, setCreateKBOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'bailian' | 'ima' | 'coze'>('bailian');

  // 统计总数
  const [projectTotal, setProjectTotal] = useState(0);
  const [knowledgeBaseTotal, setKnowledgeBaseTotal] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  // 删除相关状态
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteKBId, setDeleteKBId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 项目列表：分页和搜索
  const [projectPage, setProjectPage] = useState(1);
  const [projectPageSize] = useState(5);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectSearchInput, setProjectSearchInput] = useState('');
  const [projectTotalPages, setProjectTotalPages] = useState(1);

  // 筛选状态
  const [filterCustomerIndustry, setFilterCustomerIndustry] = useState<string>('');
  const [filterServiceType, setFilterServiceType] = useState<string>('');

  // 字典数据
  const [customerIndustries, setCustomerIndustries] = useState<DictionaryItem[]>([]);
  const [serviceTypes, setServiceTypes] = useState<DictionaryItem[]>([]);

  // 表单状态
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    projectNumber: '',
    customerIndustry: '',
    serviceType: '',
  });
  const [newKB, setNewKB] = useState({
    name: '',
    description: '',
    type: 'enterprise',
  });
  const [creatingKB, setCreatingKB] = useState(false);
  const [showCreateKBDlg, setShowCreateKBDlg] = useState(false);

  // Coze 知识库状态
  const [cozeDocuments, setCozeDocuments] = useState<Array<{ id: string; title: string; source_type: string; status: string; created_at: string }>>([]);
  const [cozeImportOpen, setCozeImportOpen] = useState(false);
  const [cozeImportMode, setCozeImportMode] = useState<'text' | 'url' | 'file'>('file');
  const [cozeImportTitle, setCozeImportTitle] = useState('');
  const [cozeImportContent, setCozeImportContent] = useState('');
  const [cozeImportUrl, setCozeImportUrl] = useState('');
  const [cozeImportLoading, setCozeImportLoading] = useState(false);
  const [cozeSearchQuery, setCozeSearchQuery] = useState('');
  const [cozeSearchResults, setCozeSearchResults] = useState<Array<{ content: string; score: number; doc_id?: string }>>([]);
  const [cozeSearching, setCozeSearching] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // IMA 创建知识库状态
  const [imaCreateOpen, setImaCreateOpen] = useState(false);
  const [imaNewKBName, setImaNewKBName] = useState('');
  const [imaNewKBDesc, setImaNewKBDesc] = useState('');
  const [imaCreatingKB, setImaCreatingKB] = useState(false);

  useEffect(() => {
    fetchData();
    fetchDictionaries();
  }, []);

  // 获取字典数据
  const fetchDictionaries = async () => {
    try {
      const [industryRes, serviceRes] = await Promise.all([
        fetch(`${API_BASE}/api/project-dictionaries?type=customer_industry`),
        fetch(`${API_BASE}/api/project-dictionaries?type=service_type`),
      ]);

      const industryData = await industryRes.json();
      const serviceData = await serviceRes.json();

      if (industryData.success) {
        setCustomerIndustries(industryData.data);
      }
      if (serviceData.success) {
        setServiceTypes(serviceData.data);
      }
    } catch (error) {
      console.error('获取字典数据失败:', error);
    }
  };

  // 项目列表数据获取（分页+搜索+筛选）
  const fetchProjects = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(projectPageSize),
        offset: String((projectPage - 1) * projectPageSize),
        orderBy: 'created_at',
        order: 'desc',
      });
      
      if (projectSearch) {
        params.append('search', projectSearch);
      }
      
      if (filterCustomerIndustry) {
        params.append('customerIndustry', filterCustomerIndustry);
      }
      
      if (filterServiceType) {
        params.append('serviceType', filterServiceType);
      }
      
      const res = await fetch(`${API_BASE}/api/projects?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setProjects(data.data.items);
        setProjectTotal(data.data.total);
        setProjectTotalPages(Math.ceil(data.data.total / projectPageSize));
        
        // 统计各状态数量（需要获取所有项目）
        if (!projectSearch && !filterCustomerIndustry && !filterServiceType && projectPage === 1) {
          // 只在第一页且无筛选时更新统计
          const allRes = await fetch(`${API_BASE}/api/projects?limit=1000`);
          const allData = await allRes.json();
          if (allData.success) {
            const allProjects = allData.data.items;
            setProcessingCount(allProjects.filter((p: Project) => p.status === 'processing').length);
            setCompletedCount(allProjects.filter((p: Project) => p.status === 'completed').length);
          }
        }
      }
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  }, [projectPage, projectPageSize, projectSearch, filterCustomerIndustry, filterServiceType]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取当前引擎
      const providerRes = await fetch(`${API_BASE}/api/knowledge-provider`);
      const providerData = await providerRes.json();
      const currentProvider = providerData.success ? providerData.data.activeProvider : 'bailian';
      setActiveProvider(currentProvider);

      if (currentProvider === 'coze') {
        // Coze 知识库：获取文档列表
        const docsRes = await fetch(`${API_BASE}/api/coze-knowledge/documents`);
        const docsData = await docsRes.json();
        if (docsData.success) {
          setCozeDocuments(docsData.data?.documents || []);
          setKnowledgeBaseTotal(docsData.data?.total || 0);
        }
        setKnowledgeBases([]);
      } else {
        // 百炼/IMA：获取知识库列表
        const kbRes = await fetch(`${API_BASE}/api/knowledge-bases?limit=5`);
        const kbData = await kbRes.json();
        
        if (kbData.success) {
          const kbItems = kbData.data?.KnowledgeBases || kbData.data?.items || [];
          const knowledgeBases = kbItems.slice(0, 5);
        
          // 并行获取每个知识库的文档数量
          const statsPromises = knowledgeBases.map((kb: KnowledgeBase) => {
            if (currentProvider === 'ima') {
              // IMA知识库已有documentCount
              return Promise.resolve({
                ...kb,
                documentCount: kb.documentCount || 0,
                _provider: 'ima' as const,
              });
            }
            return fetch(`${API_BASE}/api/bailian/knowledge-bases/${kb.id}/stats`)
              .then(res => res.json())
              .then(statsData => ({
                ...kb,
                documentCount: statsData.success ? statsData.data.documentCount : 0,
                _provider: 'bailian',
              }))
              .catch(() => ({
                ...kb,
                documentCount: 0,
                _provider: 'bailian',
              }));
          });
        
          const knowledgeBasesWithStats = await Promise.all(statsPromises);
          setKnowledgeBases(knowledgeBasesWithStats);
          setKnowledgeBaseTotal(kbData.data?.TotalCount || kbData.data?.total || 0);
        }
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 搜索处理
  const handleSearch = () => {
    setProjectSearch(projectSearchInput);
    setProjectPage(1); // 搜索时重置到第一页
  };

  // 清空搜索
  const handleClearSearch = () => {
    setProjectSearchInput('');
    setProjectSearch('');
    setProjectPage(1);
  };

  // 分页处理
  const handlePrevPage = () => {
    if (projectPage > 1) {
      setProjectPage(projectPage - 1);
    }
  };

  const handleNextPage = () => {
    if (projectPage < projectTotalPages) {
      setProjectPage(projectPage + 1);
    }
  };



  const handleCreateKB = async () => {
    if (!newKB.name.trim() || creatingKB) return;
    setCreatingKB(true);
    try {
      const res = await fetch(`${API_BASE}/api/bailian/knowledge-bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKB.name, description: newKB.description }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKB(prev => ({ ...prev, name: '', description: '' }));
        setShowCreateKBDlg(false);
        fetchData();
      }
    } catch {
      // error handled silently
    } finally {
      setCreatingKB(false);
    }
  };

  const handleImaCreateKB = async () => {
    if (!imaNewKBName.trim() || imaCreatingKB) return;
    setImaCreatingKB(true);
    try {
      const res = await fetch(`${API_BASE}/api/ima/knowledge-bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: imaNewKBName, description: imaNewKBDesc }),
      });
      const data = await res.json();
      if (data.success || data.data) {
        setImaNewKBName('');
        setImaNewKBDesc('');
        setImaCreateOpen(false);
        fetchData();
      }
    } catch {
      // error handled silently
    } finally {
      setImaCreatingKB(false);
    }
  };

  const handleCozeImport = async () => {
    if (cozeImportLoading) return;
    if (cozeImportMode === 'text' && !cozeImportContent.trim()) {
      toast.error('请输入文档内容');
      return;
    }
    if (cozeImportMode === 'url' && !cozeImportUrl.trim()) {
      toast.error('请输入网页链接');
      return;
    }

    setCozeImportLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/coze-knowledge/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: cozeImportContent.trim() || undefined,
          url: cozeImportUrl.trim() || undefined,
          title: cozeImportTitle.trim() || (cozeImportUrl.trim() ? new URL(cozeImportUrl).hostname : cozeImportContent.trim().substring(0, 50)),
          source_type: cozeImportUrl.trim() ? 'url' : 'text',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('文档导入成功，正在后台建立索引');
        setCozeImportContent('');
        setCozeImportUrl('');
        setCozeImportTitle('');
        setCozeImportOpen(false);
        fetchData();
      } else {
        toast.error(data.error || '导入失败，请重试');
      }
    } catch (err) {
      toast.error('网络错误，请检查连接后重试');
    } finally {
      setCozeImportLoading(false);
    }
  };

  const handleCozeSearch = async () => {
    if (!cozeSearchQuery.trim() || cozeSearching) return;
    setCozeSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/coze-knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cozeSearchQuery, top_k: 5 }),
      });
      const data = await res.json();
      if (data.success) {
        setCozeSearchResults(data.data?.chunks || []);
      }
    } catch {
      // error handled silently
    } finally {
      setCozeSearching(false);
    }
  };

  const handleCozeDeleteDoc = async (docId: string) => {
    setDeletingDocId(docId);
    try {
      const res = await fetch(`${API_BASE}/api/coze-knowledge/documents?id=${docId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('文档已删除');
        fetchData();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('删除失败，请重试');
    } finally {
      setDeletingDocId(null);
    }
  };

  const createProject = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProject.name,
          description: newProject.description,
          projectNumber: newProject.projectNumber,
          customerIndustry: newProject.customerIndustry,
          serviceType: newProject.serviceType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreateProjectOpen(false);
        setNewProject({ name: '', description: '', projectNumber: '', customerIndustry: '', serviceType: '' });
        // 刷新项目列表
        await fetchProjects();
      } else {
        alert('创建失败: ' + data.error);
      }
    } catch (error) {
      console.error('创建项目失败:', error);
      alert('创建项目失败');
    }
  };

  const createKnowledgeBase = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge-bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKB),
      });
      const data = await res.json();
      if (data.success) {
        // 新创建的知识库文档数量为0
        const newKnowledgeBase = {
          ...data.data,
          documentCount: data.data.documentCount || 0
        };
        setKnowledgeBases([newKnowledgeBase, ...knowledgeBases]);
        setCreateKBOpen(false);
        setNewKB({ name: '', description: '', type: 'enterprise' });
      } else {
        alert('创建失败: ' + (data.error || data.message));
      }
    } catch (error) {
      console.error('创建知识库失败:', error);
      alert('创建知识库失败');
    }
  };

  // 删除项目
  const deleteProject = async () => {
    if (!deleteProjectId) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects?id=${deleteProjectId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setDeleteProjectId(null);
        // 重新获取当前页数据
        fetchProjects();
      } else {
        alert('删除失败: ' + data.error);
      }
    } catch (error) {
      console.error('删除项目失败:', error);
      alert('删除项目失败');
    } finally {
      setDeleting(false);
    }
  };

  // 删除知识库
  const deleteKnowledgeBase = async () => {
    if (!deleteKBId) return;
    
    if (activeProvider === 'ima') {
      alert('IMA知识库暂不支持删除，请在IMA平台操作');
      setDeleteKBId(null);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/bailian/knowledge-bases/${deleteKBId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setKnowledgeBases(knowledgeBases.filter(kb => kb.id !== deleteKBId));
        setDeleteKBId(null);
      } else {
        alert('删除失败: ' + (data.error || data.message));
      }
    } catch (error) {
      console.error('删除知识库失败:', error);
      alert('删除知识库失败');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      draft: { label: '草稿', color: 'bg-gray-100 text-gray-700' },
      processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
      completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
      submitted: { label: '已提交', color: 'bg-purple-100 text-purple-700' },
    };
    const s = statusMap[status] || statusMap.draft;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>
        {s.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">AI-Bid</span>
              <span className="text-sm text-gray-500 ml-2">智能标书生成系统</span>
            </div>
            <nav className="flex items-center gap-4">
              <Link href="/settings">
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  设置
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 欢迎区 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">欢迎使用 AI-Bid</h1>
          <p className="text-gray-500 mt-1">
            基于AI的智能标书生成系统，通过评分驱动的自动化流程，快速生成高质量投标文件
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">项目总数</p>
                  <p className="text-2xl font-bold">{projectTotal}</p>
                </div>
                <FolderKanban className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">知识库数量</p>
                  <p className="text-2xl font-bold">{knowledgeBaseTotal}</p>
                </div>
                <Database className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">处理中</p>
                  <p className="text-2xl font-bold">{processingCount}</p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">已完成</p>
                  <p className="text-2xl font-bold">{completedCount}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 项目列表和知识库并排显示 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* 项目列表 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <CardTitle className="text-base">项目列表</CardTitle>
                <CardDescription className="text-xs">共 {projectTotal} 个项目</CardDescription>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 筛选器 */}
                <Select
                  value={filterCustomerIndustry}
                  onValueChange={(value) => {
                    setFilterCustomerIndustry(value === 'all' ? '' : value);
                    setProjectPage(1);
                  }}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue placeholder="行业" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    {customerIndustries.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filterServiceType}
                  onValueChange={(value) => {
                    setFilterServiceType(value === 'all' ? '' : value);
                    setProjectPage(1);
                  }}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue placeholder="类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    {serviceTypes.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* 搜索框 */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <Input
                    placeholder="搜索..."
                    value={projectSearchInput}
                    onChange={(e) => setProjectSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-28 pl-7 h-7 text-xs"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={handleSearch} className="h-7 px-2 text-xs">
                  搜索
                </Button>
                {(projectSearch || filterCustomerIndustry || filterServiceType) && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setProjectSearchInput('');
                    setProjectSearch('');
                    setFilterCustomerIndustry('');
                    setFilterServiceType('');
                    setProjectPage(1);
                  }} className="h-7 px-2 text-xs">
                    清空
                  </Button>
                )}
                {/* 新建按钮 */}
                <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-7 px-2 text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      新建
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[540px] p-0 gap-0 overflow-hidden">
                    {/* 头部区域 */}
                    <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-transparent px-6 pt-6 pb-5 border-b">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FolderKanban className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 pt-0.5">
                          <DialogTitle className="text-xl font-semibold mb-1">创建新项目</DialogTitle>
                          <DialogDescription className="text-muted-foreground">
                            填写项目基本信息，开始您的标书生成之旅
                          </DialogDescription>
                        </div>
                      </div>
                    </div>

                    {/* 表单区域 */}
                    <div className="p-6 space-y-5">
                      {/* 基本信息 */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary font-bold">1</div>
                          基本信息
                        </div>
                        <div className="grid gap-3 pl-7">
                          <div className="grid gap-1.5">
                            <Label htmlFor="name" className="text-xs text-muted-foreground">
                              项目名称 <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="name"
                              value={newProject.name}
                              onChange={(e) =>
                                setNewProject({ ...newProject, name: e.target.value })
                              }
                              placeholder="输入项目名称"
                              className="h-9"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="number" className="text-xs text-muted-foreground">
                              项目编号
                            </Label>
                            <Input
                              id="number"
                              value={newProject.projectNumber}
                              onChange={(e) =>
                                setNewProject({
                                  ...newProject,
                                  projectNumber: e.target.value,
                                })
                              }
                              placeholder="输入项目编号（可选）"
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 项目描述 */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary font-bold">2</div>
                          项目描述
                        </div>
                        <div className="pl-7">
                          <Textarea
                            id="description"
                            value={newProject.description}
                            onChange={(e) =>
                              setNewProject({
                                ...newProject,
                                description: e.target.value,
                              })
                            }
                            placeholder="描述项目的背景、目标和关键需求..."
                            className="min-h-[80px] resize-none text-sm"
                          />
                        </div>
                      </div>

                      {/* 分类信息 */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary font-bold">3</div>
                          分类信息
                        </div>
                        <div className="grid grid-cols-2 gap-3 pl-7">
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-muted-foreground">客户行业</Label>
                            <Select
                              value={newProject.customerIndustry}
                              onValueChange={(value) =>
                                setNewProject({ ...newProject, customerIndustry: value })
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="选择行业" />
                              </SelectTrigger>
                              <SelectContent>
                                {customerIndustries.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-muted-foreground">服务类型</Label>
                            <Select
                              value={newProject.serviceType}
                              onValueChange={(value) =>
                                setNewProject({ ...newProject, serviceType: value })
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="选择类型" />
                              </SelectTrigger>
                              <SelectContent>
                                {serviceTypes.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 底部按钮 */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 bg-muted/30 border-t">
                      <Button 
                        variant="outline" 
                        onClick={() => setCreateProjectOpen(false)}
                        className="px-4"
                      >
                        取消
                      </Button>
                      <Button 
                        onClick={createProject}
                        className="px-6 gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        创建项目
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {projects.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{projectSearch ? '未找到匹配的项目' : '暂无项目'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => router.push(`/projects/${project.id}`)}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{project.name}</span>
                            {getStatusBadge(project.status)}
                            {project.project_number && (
                              <span className="text-xs text-gray-400 font-mono">
                                #{project.project_number}
                              </span>
                            )}
                            {project.customer_industry && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                {customerIndustries.find(i => i.value === project.customer_industry)?.label || project.customer_industry}
                              </span>
                            )}
                            {project.service_type && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                                {serviceTypes.find(i => i.value === project.service_type)?.label || project.service_type}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {project.description || '暂无描述'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteProjectId(project.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* 分页 */}
                  {projectTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-500">
                        第 {projectPage} / {projectTotalPages} 页
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePrevPage}
                          disabled={projectPage <= 1}
                          className="h-7 px-2 text-xs"
                        >
                          <ChevronLeft className="h-3 w-3 mr-0.5" />
                          上页
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleNextPage}
                          disabled={projectPage >= projectTotalPages}
                          className="h-7 px-2 text-xs"
                        >
                          下页
                          <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 知识库 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <CardTitle className="text-base">知识库</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {activeProvider === 'coze' ? '扣子知识库 · 语义检索引擎' : activeProvider === 'ima' ? 'IMA 知识库' : '百炼知识库'}
                </CardDescription>
              </div>
              {activeProvider === 'coze' ? (
                <Dialog open={cozeImportOpen} onOpenChange={(open) => { setCozeImportOpen(open); if (!open) { setCozeImportMode('file'); setCozeImportContent(''); setCozeImportUrl(''); setCozeImportTitle(''); } }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 shadow-sm">
                      <Plus className="h-3.5 w-3.5" />
                      导入文档
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
                    {/* Header with gradient accent */}
                    <div className="relative px-6 pt-6 pb-4">
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/80 via-primary to-primary/60" />
                      <DialogTitle className="text-lg font-semibold">导入文档到知识库</DialogTitle>
                      <DialogDescription className="text-sm text-muted-foreground mt-1">
                        选择导入方式，系统将自动分块并向量化处理
                      </DialogDescription>
                    </div>

                    {/* Mode selector - card style */}
                    <div className="px-6 pb-4">
                      <div className="grid grid-cols-3 gap-3">
                        <button
                          type="button"
                          className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                            cozeImportMode === 'file'
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border hover:border-primary/40 hover:bg-muted/30'
                          }`}
                          onClick={() => setCozeImportMode('file')}
                        >
                          <div className={`p-2.5 rounded-lg transition-colors ${
                            cozeImportMode === 'file' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                          }`}>
                            <Upload className="h-5 w-5" />
                          </div>
                          <div className="text-center">
                            <p className={`text-sm font-medium ${cozeImportMode === 'file' ? 'text-primary' : 'text-foreground'}`}>文件上传</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Word, PDF, TXT</p>
                          </div>
                          {cozeImportMode === 'file' && (
                            <div className="absolute -top-px -right-px w-5 h-5 bg-primary rounded-bl-lg rounded-tr-xl flex items-center justify-center">
                              <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>

                        <button
                          type="button"
                          className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                            cozeImportMode === 'text'
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border hover:border-primary/40 hover:bg-muted/30'
                          }`}
                          onClick={() => setCozeImportMode('text')}
                        >
                          <div className={`p-2.5 rounded-lg transition-colors ${
                            cozeImportMode === 'text' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                          }`}>
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="text-center">
                            <p className={`text-sm font-medium ${cozeImportMode === 'text' ? 'text-primary' : 'text-foreground'}`}>文本内容</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">粘贴文档内容</p>
                          </div>
                          {cozeImportMode === 'text' && (
                            <div className="absolute -top-px -right-px w-5 h-5 bg-primary rounded-bl-lg rounded-tr-xl flex items-center justify-center">
                              <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>

                        <button
                          type="button"
                          className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                            cozeImportMode === 'url'
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border hover:border-primary/40 hover:bg-muted/30'
                          }`}
                          onClick={() => setCozeImportMode('url')}
                        >
                          <div className={`p-2.5 rounded-lg transition-colors ${
                            cozeImportMode === 'url' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                          }`}>
                            <Globe className="h-5 w-5" />
                          </div>
                          <div className="text-center">
                            <p className={`text-sm font-medium ${cozeImportMode === 'url' ? 'text-primary' : 'text-foreground'}`}>网页链接</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">在线网页内容</p>
                          </div>
                          {cozeImportMode === 'url' && (
                            <div className="absolute -top-px -right-px w-5 h-5 bg-primary rounded-bl-lg rounded-tr-xl flex items-center justify-center">
                              <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Content area - separator */}
                    <div className="mx-6 border-t" />

                    {/* Mode content */}
                    <div className="px-6 py-4 min-h-[220px] flex flex-col">
                      {cozeImportMode === 'file' ? (
                        <div className="flex-1 flex flex-col">
                          <FileUpload
                            uploadUrl={`${API_BASE}/api/coze-knowledge/upload`}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"
                            maxSize={50}
                            multiple
                            maxFiles={5}
                            hint="拖拽文件到此处，或点击选择文件"
                            onSuccess={(file) => {
                              toast.success(`"${file.file.name}" 上传成功，正在建立索引`);
                              fetchData();
                            }}
                            onError={(file, error) => {
                              toast.error(`"${file.file.name}" 上传失败: ${error}`);
                            }}
                            onComplete={() => {
                              setTimeout(() => setCozeImportOpen(false), 1500);
                            }}
                          />
                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Word/PDF</span>
                            <span className="flex items-center gap-1"><FileSpreadsheet className="h-3 w-3" /> Excel</span>
                            <span className="flex items-center gap-1"><File className="h-3 w-3" /> TXT/MD</span>
                            <span className="ml-auto">单文件最大 50MB</span>
                          </div>
                        </div>
                      ) : cozeImportMode === 'text' ? (
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">文档标题</Label>
                            <Input
                              placeholder="为文档命名，方便后续检索"
                              value={cozeImportTitle}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCozeImportTitle(e.target.value)}
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1.5 flex-1 flex flex-col">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">文档内容</Label>
                              <span className="text-xs text-muted-foreground">{cozeImportContent.length} 字</span>
                            </div>
                            <Textarea
                              placeholder="粘贴或输入文档内容...&#10;&#10;支持标书正文、技术方案、商务条款等文本内容"
                              rows={6}
                              value={cozeImportContent}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCozeImportContent(e.target.value)}
                              className="flex-1 resize-none min-h-[140px]"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">网页标题</Label>
                            <Input
                              placeholder="为网页命名，方便后续检索"
                              value={cozeImportTitle}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCozeImportTitle(e.target.value)}
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">网页链接</Label>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0">
                                <Globe className="h-4 w-4 text-primary" />
                              </div>
                              <Input
                                placeholder="https://example.com/article"
                                value={cozeImportUrl}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCozeImportUrl(e.target.value)}
                                className="h-10 flex-1"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">系统将自动抓取网页正文内容并导入知识库</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {cozeImportMode !== 'file' && (
                      <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-3">
                        <Button variant="outline" onClick={() => setCozeImportOpen(false)} className="h-9">
                          取消
                        </Button>
                        <Button
                          onClick={handleCozeImport}
                          disabled={cozeImportLoading || (cozeImportMode === 'text' ? !cozeImportContent.trim() : !cozeImportUrl.trim())}
                          className="h-9 min-w-[100px]"
                        >
                          {cozeImportLoading ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />导入中...</>
                          ) : (
                            <><ArrowRight className="h-4 w-4 mr-2" />开始导入</>
                          )}
                        </Button>
                      </div>
                    )}
                    {cozeImportMode === 'file' && (
                      <div className="px-6 pb-6 pt-2">
                        <p className="text-xs text-center text-muted-foreground">选择文件后将自动开始上传</p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              ) : activeProvider === 'ima' ? (
                <Dialog open={createKBOpen} onOpenChange={setImaCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      创建知识库
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>创建 IMA 知识库</DialogTitle>
                      <DialogDescription>创建一个新的知识库来管理你的文档</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>知识库名称</Label>
                        <Input placeholder="输入知识库名称" value={imaNewKBName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImaNewKBName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>描述（可选）</Label>
                        <Textarea placeholder="描述知识库的用途..." rows={3} value={imaNewKBDesc} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setImaNewKBDesc(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setImaCreateOpen(false)}>取消</Button>
                      <Button onClick={handleCreateKB} disabled={!imaNewKBName.trim() || creatingKB}>
                        {creatingKB ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />创建中...</> : '创建'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : null}
            </CardHeader>
            <CardContent>
              {activeProvider === 'coze' ? (
                /* 扣子知识库模式 */
                <div className="space-y-4">
                  {/* 搜索栏 */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索知识库内容..."
                      className="pl-9"
                      value={cozeSearchQuery}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCozeSearchQuery(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCozeSearch()}
                    />
                    <Button size="sm" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2 h-7" onClick={handleCozeSearch}>
                      搜索
                    </Button>
                  </div>

                  {/* 搜索结果 */}
                  {cozeSearchResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">找到 {cozeSearchResults.length} 条相关内容</p>
                      {cozeSearchResults.map((chunk, idx) => (
                        <div key={idx} className="p-3 rounded-lg border bg-muted/30 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-primary">相似度: {(chunk.score * 100).toFixed(1)}%</span>
                            {chunk.doc_id && <Badge variant="secondary" className="text-xs">{chunk.doc_id.slice(0, 8)}...</Badge>}
                          </div>
                          <p className="text-sm leading-relaxed">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 已导入文档列表 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">已导入文档</p>
                      {cozeDocuments.length > 0 && (
                        <Badge variant="secondary" className="text-xs">{cozeDocuments.length}</Badge>
                      )}
                    </div>
                    {cozeDocuments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                          <FileText className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-medium">暂无文档</p>
                        <p className="text-xs mt-1">点击上方「导入文档」添加知识库内容</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {cozeDocuments.map((doc) => (
                          <div key={doc.id} className="group flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors">
                            <div className={`shrink-0 p-1.5 rounded-md ${
                              doc.source_type === 'url' ? 'bg-blue-100 text-blue-600' :
                              doc.source_type === 'file' ? 'bg-amber-100 text-amber-600' :
                              'bg-orange-100 text-orange-600'
                            }`}>
                              {doc.source_type === 'url' ? <Globe className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{doc.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                  {doc.source_type === 'url' ? '网页' : doc.source_type === 'file' ? '文件' : '文本'}
                                </Badge>
                                <span className={`inline-flex items-center gap-0.5 text-[11px] ${
                                  doc.status === 'indexing' ? 'text-amber-600' :
                                  doc.status === 'ready' ? 'text-green-600' :
                                  'text-red-500'
                                }`}>
                                  {doc.status === 'indexing' && <><Clock className="h-3 w-3" />索引中</>}
                                  {doc.status === 'ready' && <><CheckCircle2 className="h-3 w-3" />就绪</>}
                                  {doc.status !== 'indexing' && doc.status !== 'ready' && <><AlertCircle className="h-3 w-3" />异常</>}
                                </span>
                                <span className="text-[11px] text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                              onClick={() => handleCozeDeleteDoc(doc.id)}
                              disabled={deletingDocId === doc.id}
                            >
                              {deletingDocId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* 百炼 / IMA 知识库模式 */
                <>
                  {knowledgeBases.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无知识库</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {knowledgeBases.map((kb) => (
                        <KnowledgeBaseCard
                          key={kb.id}
                          knowledgeBase={kb}
                          compact
                          onDelete={(id: string) => setDeleteKBId(id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 快速开始 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>快速开始</CardTitle>
            <CardDescription>三步完成标书生成</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-gray-200 bg-blue-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">
                    1
                  </span>
                  <span className="font-medium">上传招标文档</span>
                </div>
                <p className="text-sm text-gray-600">
                  上传招标文档，系统自动提取评分项和废标风险
                </p>
              </div>
              <div className="p-4 rounded-lg border border-gray-200 bg-green-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-green-500 text-white text-sm flex items-center justify-center">
                    2
                  </span>
                  <span className="font-medium">生成标书大纲</span>
                </div>
                <p className="text-sm text-gray-600">
                  基于评分项自动生成标书结构，确保100%覆盖
                </p>
              </div>
              <div className="p-4 rounded-lg border border-gray-200 bg-purple-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center">
                    3
                  </span>
                  <span className="font-medium">AI生成内容</span>
                </div>
                <p className="text-sm text-gray-600">
                  结合知识库素材，AI自动生成标书章节内容
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* 删除项目确认对话框 */}
      <AlertDialog open={!!deleteProjectId} onOpenChange={() => setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将永久删除该项目及其所有关联数据（评分项、章节内容、校验结果等），此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteProject}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除知识库确认对话框 */}
      <AlertDialog open={!!deleteKBId} onOpenChange={() => setDeleteKBId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除知识库</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将永久删除该知识库及其所有文档和分块数据。如果知识库被项目引用，需要先解除关联。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteKnowledgeBase}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
