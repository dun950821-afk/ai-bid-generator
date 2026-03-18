'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Edit2,
  Trash2,
  CheckCircle,
  RefreshCw,
  FileText,
  ChevronRight,
  Target,
  AlertTriangle,
} from 'lucide-react';

// 评分项接口
interface ScoringItem {
  id: string;
  item_name: string;
  item_type: string;
  max_score: number;
  scoring_rules: Array<{ rule: string; score: number }>;
  response_status: string;
}

// 风险项接口
interface Risk {
  id: string;
  risk_type: string;
  risk_description: string;
  source_text?: string;
  severity: string;
  response_status: string;
}

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
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('scoring');

  // 评分项和风险数据
  const [scoringItems, setScoringItems] = useState<ScoringItem[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);

  // 编辑相关状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<{ path: string; name: string; value: any } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 加载评分项
      const scoringRes = await fetch(`/api/projects/${projectId}/scoring-items`);
      const scoringData = await scoringRes.json();
      if (scoringData.success) {
        setScoringItems(scoringData.data.items || []);
      }

      // 加载风险项
      const risksRes = await fetch(`/api/projects/${projectId}/risks`);
      const risksData = await risksRes.json();
      if (risksData.success) {
        setRisks(risksData.data.risks || []);
      }

      // 加载版本列表
      const versionsRes = await fetch(`/api/projects/${projectId}/extraction-versions`);
      const versionsData = await versionsRes.json();
      
      if (versionsData.success) {
        setVersions(versionsData.data.versions);
        
        const current = versionsData.data.versions.find((v: Version) => v.is_current);
        if (current) {
          setCurrentVersion(current);
          
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

  // 提交修改
  const handleSubmitEdit = async () => {
    if (!editingField || !currentVersion) return;
    
    try {
      let newValue = editValue;
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
        <div className="h-12 w-full bg-muted animate-pulse rounded" />
        <div className="h-[600px] w-full bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">提取结果管理</h1>
          <p className="text-muted-foreground">管理招标文档提取的评分项和风险项</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
            返回项目
          </Button>
        </div>
      </div>

      {/* 版本概览 */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">评分项</p>
                <p className="text-2xl font-bold">{scoringItems.length}</p>
              </div>
              <Target className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">风险项</p>
                <p className="text-2xl font-bold">{risks.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总分值</p>
                <p className="text-2xl font-bold">{scoringItems.reduce((sum, item) => sum + item.max_score, 0)}分</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
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
          <TabsTrigger value="scoring">评分项</TabsTrigger>
          <TabsTrigger value="risks">风险项</TabsTrigger>
          <TabsTrigger value="versions">版本列表</TabsTrigger>
          <TabsTrigger value="history">修改历史</TabsTrigger>
        </TabsList>

        {/* 评分项列表 */}
        <TabsContent value="scoring" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>评分项列表</CardTitle>
              <CardDescription>
                技术 {scoringItems.filter(i => i.item_type === 'technical').length}项 · 
                商务 {scoringItems.filter(i => i.item_type === 'business').length}项 · 
                价格 {scoringItems.filter(i => i.item_type === 'price').length}项
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scoringItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无评分项</p>
                  <Button className="mt-4" onClick={() => router.push(`/projects/${projectId}`)}>
                    返回项目上传文档
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {scoringItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              item.item_type === 'technical' ? 'default' :
                              item.item_type === 'business' ? 'secondary' : 'outline'
                            }>
                              {item.item_type === 'technical' ? '技术' :
                               item.item_type === 'business' ? '商务' : '价格'}
                            </Badge>
                            <span className="font-medium">{item.item_name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <span>满分: {item.max_score}分</span>
                            {item.scoring_rules && item.scoring_rules.length > 0 && (
                              <span>· {item.scoring_rules.length}条细则</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 风险项列表 */}
        <TabsContent value="risks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>废标风险列表</CardTitle>
              <CardDescription>
                严重 {risks.filter(r => r.severity === 'critical').length}项 · 
                高 {risks.filter(r => r.severity === 'high').length}项 · 
                中 {risks.filter(r => r.severity === 'medium').length}项
              </CardDescription>
            </CardHeader>
            <CardContent>
              {risks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无风险项</p>
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
                              {risk.severity === 'critical' ? '严重' :
                               risk.severity === 'high' ? '高' : 
                               risk.severity === 'medium' ? '中' : '低'}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{risk.risk_type}</span>
                          </div>
                        </div>
                        <p className="text-sm">{risk.risk_description}</p>
                        {risk.source_text && (
                          <p className="text-xs text-muted-foreground mt-1">原文: {risk.source_text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 版本列表 */}
        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>版本历史</CardTitle>
              <CardDescription>所有提取版本，可选择切换或删除</CardDescription>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  暂无版本记录
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>版本</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>完整度</TableHead>
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
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(version.created_at).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          {version.completeness_score?.toFixed(0)}%
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
              )}
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
