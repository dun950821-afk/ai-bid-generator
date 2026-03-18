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
import { FileUpload, UploadFile } from '@/components/ui/file-upload';
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
} from 'lucide-react';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  created_at: string;
}

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
  chunk_count: number;
  processing_error?: string;
  tags?: Tag[];
  created_at: string;
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
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [selectedDocTags, setSelectedDocTags] = useState<string[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  useEffect(() => {
    fetchKnowledgeBaseData();
  }, [kbId]);

  const fetchKnowledgeBaseData = async () => {
    try {
      const [kbRes, docsRes, statsRes, tagsRes] = await Promise.all([
        fetch(`/api/knowledge-bases/${kbId}`),
        fetch(`/api/knowledge-bases/${kbId}/documents`),
        fetch(`/api/knowledge-bases/${kbId}/stats`),
        fetch(`/api/knowledge-bases/${kbId}/tags`),
      ]);

      const kbData = await kbRes.json();
      const docsData = await docsRes.json();
      const statsData = await statsRes.json();
      const tagsData = await tagsRes.json();

      if (kbData.success) setKnowledgeBase(kbData.data);
      if (docsData.success) setDocuments(docsData.data.documents);
      if (statsData.success) setStats(statsData.data);
      if (tagsData.success) setTags(tagsData.data);
    } catch (error) {
      console.error('获取知识库数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (files: UploadFile[]) => {
    // 刷新数据
    fetchKnowledgeBaseData();
    // 延迟关闭对话框，让用户看到成功状态
    setTimeout(() => {
      setUploadDialogOpen(false);
    }, 1500);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          knowledgeBaseId: kbId,
          topK: 5,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data.results);
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await fetch(`/api/knowledge-bases/${kbId}/documents/${docId}`, {
        method: 'DELETE',
      });
      fetchKnowledgeBaseData();
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleReprocessDocument = async (docId: string) => {
    try {
      await fetch(`/api/knowledge-bases/${kbId}/documents/${docId}/reprocess`, {
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
      const res = await fetch(`/api/knowledge-bases/${kbId}/tags`, {
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
      await fetch(`/api/knowledge-bases/${kbId}/tags/${tagId}`, {
        method: 'DELETE',
      });
      setTags(tags.filter(t => t.id !== tagId));
    } catch (error) {
      console.error('删除标签失败:', error);
    }
  };

  const handleUpdateDocTags = async (docId: string, tagIds: string[]) => {
    try {
      await fetch(`/api/knowledge-bases/${kbId}/documents/${docId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds }),
      });
      fetchKnowledgeBaseData();
    } catch (error) {
      console.error('更新文档标签失败:', error);
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
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '等待处理',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!knowledgeBase) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">知识库不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">{knowledgeBase.name}</h1>
                <p className="text-sm text-gray-500">
                  {knowledgeBase.description || '暂无描述'}
                </p>
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
            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{stats.documentCount || 0}</p>
                    <p className="text-xs text-gray-500">文档数</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{stats.chunkCount || 0}</p>
                    <p className="text-xs text-gray-500">知识块</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      {stats.totalSize ? formatFileSize(stats.totalSize) : '0 B'}
                    </p>
                    <p className="text-xs text-gray-500">总大小</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      {knowledgeBase.chunk_size}
                    </p>
                    <p className="text-xs text-gray-500">分块大小</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 文档列表 */}
            <Card>
              <CardHeader>
                <CardTitle>文档列表</CardTitle>
                <CardDescription>
                  已上传的文档会自动分块并向量化存储
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>暂无文档，请上传</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-gray-400" />
                          <div>
                            <p className="font-medium">{doc.file_name}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{formatFileSize(doc.file_size)}</span>
                              <span>·</span>
                              <span>{doc.chunk_count} 个知识块</span>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                {getStatusIcon(doc.status)}
                                {getStatusLabel(doc.status)}
                              </span>
                            </div>
                            {doc.processing_error && (
                              <p className="text-xs text-red-500 mt-1">
                                {doc.processing_error}
                              </p>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setPreviewContent(`预览: ${doc.file_name}\n\n此处应显示文档内容...`);
                                setPreviewDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              预览
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
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 右侧：搜索测试 */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>检索测试</CardTitle>
                <CardDescription>
                  测试知识库的语义检索能力
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入查询内容..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button
                      size="icon"
                      onClick={handleSearch}
                      disabled={searching}
                    >
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-3">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50"
                          onClick={() => {
                            setPreviewContent(result.content);
                            setPreviewDialogOpen(true);
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500">
                              {result.source}
                            </span>
                            <span className="text-xs font-medium text-blue-600">
                              {(result.score * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-sm line-clamp-3">{result.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 配置信息 */}
            <Card>
              <CardHeader>
                <CardTitle>配置信息</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">嵌入模型</span>
                    <span className="font-medium">{knowledgeBase.embedding_model}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">分块大小</span>
                    <span className="font-medium">{knowledgeBase.chunk_size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">分块重叠</span>
                    <span className="font-medium">{knowledgeBase.chunk_overlap}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">创建时间</span>
                    <span className="font-medium">
                      {new Date(knowledgeBase.created_at).toLocaleDateString()}
                    </span>
                  </div>
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
                  <p className="text-sm text-gray-500 text-center py-4">
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
          <div className="flex-shrink-0 p-6 pb-4 border-b border-gray-100">
            <DialogHeader>
              <DialogTitle className="text-xl">上传文档</DialogTitle>
              <DialogDescription className="text-gray-500 mt-2">
                支持 PDF、Word、TXT 等格式，文件将自动处理并向量化
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* 内容区域 - 自适应高度，可滚动 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50/50">
            <FileUpload
              uploadUrl={`/api/knowledge-bases/${kbId}/documents`}
              accept=".pdf,.doc,.docx,.txt,.md"
              multiple={true}
              maxSize={50}
              maxFiles={10}
              fieldName="files"
              extraData={{ knowledgeBaseId: kbId }}
              onComplete={handleUploadComplete}
              hint="拖拽文件到此处或点击选择"
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

      {/* 预览对话框 */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>内容预览</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            <pre className="text-sm whitespace-pre-wrap">{previewContent}</pre>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
