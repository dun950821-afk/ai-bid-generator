/**
 * 章节内容页面
 * 支持引用溯源高亮显示和锁定状态
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Loader2,
  Lock,
  Unlock,
  Eye,
  FileText,
  Sparkles,
  RefreshCw,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  BookOpen,
  Quote,
} from 'lucide-react';

interface SectionData {
  id: string;
  title: string;
  content: string;
  status: string;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  lockExpiresAt: string | null;
}

interface Citation {
  id: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  citedText: string;
  sourceText: string;
  relevanceScore: number;
  offsets: {
    start: number;
    end: number;
  };
  createdAt: string;
}

interface CitationsData {
  total: number;
  documents: Array<{
    documentName: string;
    documentId: string;
    citations: Citation[];
  }>;
  citations: Citation[];
}

export default function SectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const sectionId = params.sectionId as string;

  const [section, setSection] = useState<SectionData | null>(null);
  const [citations, setCitations] = useState<CitationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [locking, setLocking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [saving, setSaving] = useState(false);

  // 当前用户信息（实际应用中应从认证系统获取）
  const currentUser = {
    id: 'current-user',
    name: '当前用户',
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 获取章节信息和锁定状态
      const [sectionRes, lockRes, citationsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/sections/${sectionId}`),
        fetch(`/api/projects/${projectId}/sections/${sectionId}/lock`),
        fetch(`/api/projects/${projectId}/sections/${sectionId}/citations`),
      ]);

      const sectionData = await sectionRes.json();
      const lockData = await lockRes.json();
      const citationsData = await citationsRes.json();

      if (sectionData.success) {
        setSection({
          ...sectionData.data,
          isLocked: lockData.data?.isLocked || false,
          lockedBy: lockData.data?.lockedBy || null,
          lockedAt: lockData.data?.lockedAt || null,
          lockExpiresAt: lockData.data?.lockExpiresAt || null,
        });
        setEditedContent(sectionData.data.content || '');
      }

      if (citationsData.success) {
        setCitations(citationsData.data);
      }
    } catch (error) {
      console.error('获取章节数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, sectionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 锁定章节
  const handleLock = async () => {
    setLocking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSection(prev => prev ? {
          ...prev,
          isLocked: true,
          lockedBy: currentUser.name,
          lockedAt: data.data.lockedAt,
          lockExpiresAt: data.data.lockExpiresAt,
        } : null);
        setEditing(true);
      } else {
        alert('锁定失败：' + data.error);
      }
    } catch (error) {
      console.error('锁定失败:', error);
      alert('锁定失败');
    } finally {
      setLocking(false);
    }
  };

  // 解锁章节
  const handleUnlock = async () => {
    setLocking(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sections/${sectionId}/lock?userId=${currentUser.id}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        setSection(prev => prev ? {
          ...prev,
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
          lockExpiresAt: null,
        } : null);
        setEditing(false);
      } else {
        alert('解锁失败：' + data.error);
      }
    } catch (error) {
      console.error('解锁失败:', error);
      alert('解锁失败');
    } finally {
      setLocking(false);
    }
  };

  // 生成内容
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipLockCheck: true }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert('生成失败：' + data.error);
      }
    } catch (error) {
      console.error('生成失败:', error);
      alert('生成失败');
    } finally {
      setGenerating(false);
    }
  };

  // 保存内容
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent }),
      });
      const data = await res.json();
      if (data.success) {
        setSection(prev => prev ? { ...prev, content: editedContent } : null);
        handleUnlock();
      } else {
        alert('保存失败：' + data.error);
      }
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 渲染带引用高亮的内容
  const renderContentWithCitations = (content: string) => {
    if (!content) return null;

    // 匹配引用标记 【引用:数字】
    const parts: React.ReactNode[] = [];
    const regex = /【引用[:：]\s*(\d+)】/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(content)) !== null) {
      // 添加引用前的内容
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++}>{content.substring(lastIndex, match.index)}</span>
        );
      }

      // 添加引用标记（高亮显示）
      const refIndex = parseInt(match[1]);
      parts.push(
        <span
          key={key++}
          className="bg-primary/20 text-primary px-1 rounded cursor-pointer hover:bg-primary/30"
          title={`引用来源 ${refIndex}`}
        >
          【引用:{refIndex}】
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // 添加最后的内容
    if (lastIndex < content.length) {
      parts.push(<span key={key++}>{content.substring(lastIndex)}</span>);
    }

    return parts;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!section) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">章节不存在</div>
      </div>
    );
  }

  const isLockedByOther = section.isLocked && section.lockedBy !== currentUser.name;

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{section.title}</h1>
                  {section.isLocked && (
                    <Badge variant={isLockedByOther ? "destructive" : "default"}>
                      <Lock className="h-3 w-3 mr-1" />
                      {isLockedByOther ? `被 ${section.lockedBy} 锁定` : '编辑中'}
                    </Badge>
                  )}
                  {section.content && (
                    <Badge variant="outline" className="text-green-600">已生成</Badge>
                  )}
                </div>
                {section.lockExpiresAt && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    锁定至 {new Date(section.lockExpiresAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {section.content ? (
                <>
                  {!editing ? (
                    <>
                      {section.isLocked && isLockedByOther ? (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <Button onClick={handleLock} disabled={locking}>
                          {locking ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Unlock className="h-4 w-4 mr-2" />
                          )}
                          编辑
                        </Button>
                      )}
                      <Button variant="outline" onClick={handleGenerate} disabled={generating}>
                        {generating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        重新生成
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={handleUnlock} disabled={locking}>
                        取消
                      </Button>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        保存
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  AI生成
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 锁定提示 */}
        {isLockedByOther && (
          <Alert className="mb-4">
            <Lock className="h-4 w-4" />
            <AlertTitle>章节已锁定</AlertTitle>
            <AlertDescription>
              该章节正被 {section.lockedBy} 编辑中，请等待其完成后再进行操作。
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="content" className="space-y-4">
          <TabsList>
            <TabsTrigger value="content">
              <FileText className="h-4 w-4 mr-2" />
              章节内容
            </TabsTrigger>
            <TabsTrigger value="citations">
              <Quote className="h-4 w-4 mr-2" />
              引用溯源 ({citations?.total || 0})
            </TabsTrigger>
          </TabsList>

          {/* 章节内容 */}
          <TabsContent value="content">
            <Card>
              <CardHeader>
                <CardTitle>章节内容</CardTitle>
                <CardDescription>
                  {editing 
                    ? '编辑模式下，引用标记会自动保留'
                    : '内容中的【引用:N】标记表示参考了知识库文档'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {editing ? (
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[500px] font-mono"
                    placeholder="输入章节内容..."
                  />
                ) : section.content ? (
                  <ScrollArea className="h-[600px]">
                    <div className="prose prose-sm max-w-none">
                      {renderContentWithCitations(section.content)}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-4">暂无内容，点击"AI生成"开始</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 引用溯源 */}
          <TabsContent value="citations">
            <Card>
              <CardHeader>
                <CardTitle>引用溯源</CardTitle>
                <CardDescription>
                  本章内容引用了 {citations?.total || 0} 处知识库文档
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!citations || citations.total === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>暂无引用记录</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-6">
                      {citations.documents.map((doc, docIdx) => (
                        <div key={docIdx} className="space-y-3">
                          <div className="flex items-center gap-2 text-lg font-semibold">
                            <FileText className="h-5 w-5" />
                            {doc.documentName}
                            <Badge variant="secondary">{doc.citations.length} 处引用</Badge>
                          </div>
                          
                          <div className="space-y-3 pl-7">
                            {doc.citations.map((citation, citeIdx) => (
                              <div 
                                key={citeIdx}
                                className="p-4 rounded-lg bg-muted/50 border"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline">引用 {citeIdx + 1}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    相关度: {(citation.relevanceScore * 100).toFixed(0)}%
                                  </span>
                                </div>
                                
                                <div className="mb-3">
                                  <p className="text-sm font-medium text-muted-foreground mb-1">
                                    引用内容：
                                  </p>
                                  <p className="text-sm bg-primary/10 p-2 rounded">
                                    {citation.citedText}
                                  </p>
                                </div>
                                
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground mb-1">
                                    来源原文：
                                  </p>
                                  <p className="text-sm bg-muted p-2 rounded">
                                    {citation.sourceText}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
