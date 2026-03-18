'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TenderExtractionResultView } from '@/components/tender/tender-extraction-result-view';
import { ExtractionDiffView } from '@/components/tender/extraction-diff-view';
import { TenderDocumentExtractionResult } from '@/types/tender-extraction';
import {
  History,
  GitCompare,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  FileText,
  ChevronRight,
} from 'lucide-react';

interface Version {
  id: string;
  version_number: number;
  is_current: boolean;
  is_approved: boolean;
  extraction_metadata: {
    extraction_time: string;
    document_name: string;
    confidence_score: number;
  };
  field_count: number;
  total_fields: number;
  completeness_score: number;
  notes: string | null;
  created_at: string;
}

interface Modification {
  id: string;
  field_path: string;
  field_name: string;
  old_value: any;
  new_value: any;
  old_value_text: string;
  new_value_text: string;
  reason: string | null;
  review_status: string;
  modified_at: string;
}

export default function ExtractionManagementPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // 状态
  const [versions, setVersions] = useState<Version[]>([]);
  const [currentVersion, setCurrentVersion] = useState<Version | null>(null);
  const [extractionResult, setExtractionResult] = useState<TenderDocumentExtractionResult | null>(null);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('result');

  // 对比相关状态
  const [compareMode, setCompareMode] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [selectedBestVersion, setSelectedBestVersion] = useState<string | null>(null);

  // 编辑相关状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<{ path: string; name: string; value: any } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 加载版本列表
      const versionsRes = await fetch(`/api/projects/${projectId}/extraction-versions`);
      const versionsData = await versionsRes.json();
      
      if (versionsData.success) {
        setVersions(versionsData.data.versions);
        
        // 获取当前版本
        const current = versionsData.data.versions.find((v: Version) => v.is_current);
        if (current) {
          setCurrentVersion(current);
          
          // 加载当前版本的提取结果
          const resultRes = await fetch(`/api/projects/${projectId}/extract-tender`);
          const resultData = await resultRes.json();
          
          if (resultData.success && resultData.data.hasResult) {
            setExtractionResult(resultData.data.extractionResult);
          }
          
          // 加载修改历史
          const modRes = await fetch(`/api/projects/${projectId}/extraction-modifications?versionId=${current.id}`);
          const modData = await modRes.json();
          
          if (modData.success) {
            setModifications(modData.data);
          }
        }
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 切换当前版本
  const handleSwitchVersion = async (versionId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-versions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, action: 'set_current' }),
      });
      
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error('切换版本失败:', error);
    }
  };

  // 删除版本
  const handleDeleteVersion = async (versionId: string) => {
    if (!confirm('确定要删除此版本吗？此操作不可恢复。')) return;
    
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-versions?versionId=${versionId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error('删除版本失败:', error);
    }
  };

  // 开始对比
  const handleStartCompare = () => {
    setCompareMode(true);
    setSelectedVersions([]);
    setComparisonResult(null);
    setActiveTab('compare');
  };

  // 选择对比版本
  const handleSelectCompareVersion = (versionId: string) => {
    if (selectedVersions.includes(versionId)) {
      setSelectedVersions(selectedVersions.filter(id => id !== versionId));
    } else if (selectedVersions.length < 2) {
      setSelectedVersions([...selectedVersions, versionId]);
    }
  };

  // 执行对比
  const handleCompare = async () => {
    if (selectedVersions.length !== 2) return;
    
    try {
      const res = await fetch(
        `/api/projects/${projectId}/extraction-comparison?versionAId=${selectedVersions[0]}&versionBId=${selectedVersions[1]}`
      );
      const data = await res.json();
      
      if (data.success) {
        setComparisonResult(data.data);
        setSelectedBestVersion(null);
      }
    } catch (error) {
      console.error('对比失败:', error);
    }
  };

  // 选择最佳版本
  const handleSelectBestVersion = async (versionId: string) => {
    setSelectedBestVersion(versionId);
  };

  // 确认选择最佳版本
  const handleConfirmBestVersion = async () => {
    if (!selectedBestVersion) return;
    
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-comparison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedVersionId: selectedBestVersion }),
      });
      
      if (res.ok) {
        setCompareMode(false);
        setSelectedVersions([]);
        setComparisonResult(null);
        setSelectedBestVersion(null);
        loadData();
      }
    } catch (error) {
      console.error('选择版本失败:', error);
    }
  };

  // 打开编辑对话框
  const handleOpenEdit = (fieldPath: string, fieldName: string, currentValue: any) => {
    setEditingField({ path: fieldPath, name: fieldName, value: currentValue });
    setEditValue(typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : String(currentValue || ''));
    setEditReason('');
    setEditDialogOpen(true);
  };

  // 提交修改
  const handleSubmitEdit = async () => {
    if (!editingField || !currentVersion) return;
    
    try {
      let newValue = editValue;
      // 尝试解析JSON
      try {
        newValue = JSON.parse(editValue);
      } catch (e) {
        // 保持字符串
      }
      
      const res = await fetch(`/api/projects/${projectId}/extraction-modifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: currentVersion.id,
          fieldPath: editingField.path,
          newValue,
          reason: editReason,
        }),
      });
      
      if (res.ok) {
        setEditDialogOpen(false);
        loadData();
      }
    } catch (error) {
      console.error('提交修改失败:', error);
    }
  };

  // 撤销修改
  const handleUndoModification = async (modificationId: string) => {
    if (!confirm('确定要撤销此修改吗？')) return;
    
    try {
      const res = await fetch(
        `/api/projects/${projectId}/extraction-modifications?modificationId=${modificationId}`,
        { method: 'DELETE' }
      );
      
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error('撤销修改失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">提取结果管理</h1>
          <p className="text-muted-foreground">管理招标文档提取版本、修改历史和版本对比</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleStartCompare}
            disabled={versions.length < 2}
          >
            <GitCompare className="h-4 w-4 mr-2" />
            版本对比
          </Button>
          <Button onClick={() => router.push(`/projects/${projectId}/extract`)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重新提取
          </Button>
        </div>
      </div>

      {/* 版本概览 */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总版本数</p>
                <p className="text-2xl font-bold">{versions.length}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">当前版本</p>
                <p className="text-2xl font-bold">V{currentVersion?.version_number || '-'}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">完整度</p>
                <p className="text-2xl font-bold">{currentVersion?.completeness_score?.toFixed(1) || 0}%</p>
              </div>
              <Progress value={currentVersion?.completeness_score || 0} className="h-2 w-20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">修改记录</p>
                <p className="text-2xl font-bold">{modifications.length}</p>
              </div>
              <Edit2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 主内容区域 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="result">提取结果</TabsTrigger>
          <TabsTrigger value="versions">版本列表</TabsTrigger>
          <TabsTrigger value="history">修改历史</TabsTrigger>
          <TabsTrigger value="compare">版本对比</TabsTrigger>
        </TabsList>

        {/* 提取结果 */}
        <TabsContent value="result" className="mt-4">
          {extractionResult ? (
            <TenderExtractionResultView data={extractionResult} />
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无提取结果</p>
                  <Button className="mt-4" onClick={() => router.push(`/projects/${projectId}/extract`)}>
                    开始提取
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 版本列表 */}
        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>版本历史</CardTitle>
              <CardDescription>所有提取版本，可选择切换或删除</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>版本</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>完整度</TableHead>
                    <TableHead>置信度</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((version) => (
                    <TableRow key={version.id} className={version.is_current ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">V{version.version_number}</span>
                          {version.is_current && <Badge>当前</Badge>}
                          {version.is_approved && <Badge variant="outline">已审核</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(version.created_at).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={version.completeness_score || 0} className="h-2 w-16" />
                          <span className="text-sm">{version.completeness_score?.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {version.extraction_metadata?.confidence_score 
                          ? `${(version.extraction_metadata.confidence_score * 100).toFixed(0)}%`
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant={version.is_current ? 'default' : 'secondary'}>
                          {version.is_current ? '使用中' : '历史版本'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!version.is_current && (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleSwitchVersion(version.id)}
                              >
                                切换
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDeleteVersion(version.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 修改历史 */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>修改历史</CardTitle>
              <CardDescription>当前版本的所有人工修改记录</CardDescription>
            </CardHeader>
            <CardContent>
              {modifications.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>字段</TableHead>
                      <TableHead>旧值</TableHead>
                      <TableHead>新值</TableHead>
                      <TableHead>修改原因</TableHead>
                      <TableHead>修改时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modifications.map((mod) => (
                      <TableRow key={mod.id}>
                        <TableCell className="font-medium">{mod.field_name}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {mod.old_value_text || '(空)'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {mod.new_value_text || '(空)'}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {mod.reason || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(mod.modified_at).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={mod.review_status === 'approved' ? 'default' : 'secondary'}>
                            {mod.review_status === 'approved' ? '已审核' : '待审核'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleUndoModification(mod.id)}
                          >
                            撤销
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  暂无修改记录
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 版本对比 */}
        <TabsContent value="compare" className="mt-4">
          {!comparisonResult ? (
            <Card>
              <CardHeader>
                <CardTitle>选择对比版本</CardTitle>
                <CardDescription>请选择两个版本进行对比</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  {versions.map((version) => (
                    <Card 
                      key={version.id}
                      className={`cursor-pointer transition-all ${
                        selectedVersions.includes(version.id) 
                          ? 'ring-2 ring-primary' 
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => handleSelectCompareVersion(version.id)}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">V{version.version_number}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(version.created_at).toLocaleString('zh-CN')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">完整度 {version.completeness_score?.toFixed(0)}%</p>
                            {selectedVersions.includes(version.id) && (
                              <Badge className="mt-1">已选择</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="flex justify-center">
                  <Button 
                    onClick={handleCompare}
                    disabled={selectedVersions.length !== 2}
                  >
                    开始对比
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <ExtractionDiffView 
                comparison={comparisonResult}
                onSelectVersion={handleSelectBestVersion}
                selectedVersionId={selectedBestVersion || undefined}
              />
              {selectedBestVersion && (
                <div className="flex justify-center">
                  <Button onClick={handleConfirmBestVersion}>
                    确认选择此版本
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>修改字段</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>字段名称</Label>
              <Input value={editingField?.name || ''} disabled />
            </div>
            <div>
              <Label>当前值</Label>
              <div className="p-2 bg-muted rounded text-sm">
                {typeof editingField?.value === 'object' 
                  ? JSON.stringify(editingField?.value, null, 2)
                  : String(editingField?.value || '(空)')
                }
              </div>
            </div>
            <div>
              <Label>新值</Label>
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={4}
                placeholder="输入新值（如果是数组或对象，请输入JSON格式）"
              />
            </div>
            <div>
              <Label>修改原因（可选）</Label>
              <Input
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="说明修改原因"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitEdit}>
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
