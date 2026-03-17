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
  created_at: string;
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
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  useEffect(() => {
    fetchKnowledgeBaseData();
  }, [kbId]);

  const fetchKnowledgeBaseData = async () => {
    try {
      const [kbRes, docsRes, statsRes] = await Promise.all([
        fetch(`/api/knowledge-bases/${kbId}`),
        fetch(`/api/knowledge-bases/${kbId}/documents`),
        fetch(`/api/knowledge-bases/${kbId}/stats`),
      ]);

      const kbData = await kbRes.json();
      const docsData = await docsRes.json();
      const statsData = await statsRes.json();

      if (kbData.success) setKnowledgeBase(kbData.data);
      if (docsData.success) setDocuments(docsData.data.documents);
      if (statsData.success) setStats(statsData.data);
    } catch (error) {
      console.error('获取知识库数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList) => {
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('files', file);
      });

      const res = await fetch(`/api/knowledge-bases/${kbId}/documents`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        fetchKnowledgeBaseData();
        setUploadDialogOpen(false);
      }
    } catch (error) {
      console.error('上传失败:', error);
    } finally {
      setUploading(false);
    }
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
          </div>
        </div>
      </main>

      {/* 上传对话框 */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传文档</DialogTitle>
            <DialogDescription>
              支持 PDF、Word、TXT 等格式，文件将自动处理并向量化
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-500 mb-2">
                拖拽文件到此处或点击选择
              </p>
              <Input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md"
                className="hidden"
                id="file-upload"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files);
                  }
                }}
              />
              <Label htmlFor="file-upload" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>选择文件</span>
                </Button>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              取消
            </Button>
          </DialogFooter>
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
    </div>
  );
}
