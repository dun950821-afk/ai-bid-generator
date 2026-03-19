'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
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
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  type: string;
  document_count: number;
  chunk_count: number;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createKBOpen, setCreateKBOpen] = useState(false);

  // 统计总数
  const [projectTotal, setProjectTotal] = useState(0);
  const [knowledgeBaseTotal, setKnowledgeBaseTotal] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  // 删除相关状态
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteKBId, setDeleteKBId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 表单状态
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    projectNumber: '',
  });
  const [newKB, setNewKB] = useState({
    name: '',
    description: '',
    type: 'enterprise',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [projectsRes, kbRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects?limit=1000`), // 获取所有项目用于统计
        fetch(`${API_BASE}/api/bailian/knowledge-bases?limit=1000`), // 使用百炼API获取知识库
      ]);

      const projectsData = await projectsRes.json();
      const kbData = await kbRes.json();

      if (projectsData.success) {
        setProjects(projectsData.data.items.slice(0, 5)); // 列表只显示前5条
        setProjectTotal(projectsData.data.total); // 统计使用真实总数
        // 统计各状态数量
        const allProjects = projectsData.data.items;
        setProcessingCount(allProjects.filter((p: Project) => p.status === 'processing').length);
        setCompletedCount(allProjects.filter((p: Project) => p.status === 'completed').length);
      }
      if (kbData.success) {
        setKnowledgeBases(kbData.data.items.slice(0, 5)); // 列表只显示前5条
        setKnowledgeBaseTotal(kbData.data.total); // 统计使用真实总数
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });
      const data = await res.json();
      if (data.success) {
        setProjects([data.data, ...projects]);
        setCreateProjectOpen(false);
        setNewProject({ name: '', description: '', projectNumber: '' });
      }
    } catch (error) {
      console.error('创建项目失败:', error);
    }
  };

  const createKnowledgeBase = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bailian/knowledge-bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKB),
      });
      const data = await res.json();
      if (data.success) {
        setKnowledgeBases([data.data, ...knowledgeBases]);
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
        setProjects(projects.filter(p => p.id !== deleteProjectId));
        setDeleteProjectId(null);
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

        {/* 项目列表 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 最近项目 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>最近项目</CardTitle>
                <CardDescription>管理您的标书项目</CardDescription>
              </div>
              <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    新建项目
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>创建新项目</DialogTitle>
                    <DialogDescription>填写项目基本信息</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">项目名称</Label>
                      <Input
                        id="name"
                        value={newProject.name}
                        onChange={(e) =>
                          setNewProject({ ...newProject, name: e.target.value })
                        }
                        placeholder="请输入项目名称"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="number">项目编号</Label>
                      <Input
                        id="number"
                        value={newProject.projectNumber}
                        onChange={(e) =>
                          setNewProject({
                            ...newProject,
                            projectNumber: e.target.value,
                          })
                        }
                        placeholder="请输入项目编号"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">项目描述</Label>
                      <Textarea
                        id="description"
                        value={newProject.description}
                        onChange={(e) =>
                          setNewProject({
                            ...newProject,
                            description: e.target.value,
                          })
                        }
                        placeholder="请输入项目描述"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateProjectOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={createProject}>创建</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FolderKanban className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>暂无项目，点击上方按钮创建</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{project.name}</span>
                          {getStatusBadge(project.status)}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {project.description || '暂无描述'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteProjectId(project.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 知识库 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>知识库</CardTitle>
                <CardDescription>管理企业资质、案例等素材</CardDescription>
              </div>
              <Dialog open={createKBOpen} onOpenChange={setCreateKBOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    新建知识库
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>创建知识库</DialogTitle>
                    <DialogDescription>创建知识库用于存储企业素材</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="kb-name">知识库名称</Label>
                      <Input
                        id="kb-name"
                        value={newKB.name}
                        onChange={(e) =>
                          setNewKB({ ...newKB, name: e.target.value })
                        }
                        placeholder="请输入知识库名称"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="kb-description">描述</Label>
                      <Textarea
                        id="kb-description"
                        value={newKB.description}
                        onChange={(e) =>
                          setNewKB({ ...newKB, description: e.target.value })
                        }
                        placeholder="请输入知识库描述"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateKBOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={createKnowledgeBase}>创建</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {knowledgeBases.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>暂无知识库，点击上方按钮创建</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {knowledgeBases.map((kb) => (
                    <div
                      key={kb.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => router.push(`/knowledge-bases/${kb.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{kb.name}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                            {kb.type === 'bailian' ? '百炼知识库' : kb.type === 'enterprise' ? '企业知识库' : '项目知识库'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {kb.document_count || 0} 个文档 · {kb.chunk_count || 0} 个分块
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteKBId(kb.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
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
