/**
 * 版本差异高亮显示组件
 * 用于对比两个版本的提取结果差异
 */

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowRight, 
  Plus, 
  Minus, 
  RefreshCw, 
  Check, 
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

interface FieldDiff {
  fieldPath: string;
  fieldName: string;
  valueA: any;
  valueB: any;
  diffType: DiffType;
  displayValueA: string;
  displayValueB: string;
}

interface ComparisonResult {
  versionA: {
    id: string;
    versionNumber: number;
    createdAt: string;
    completenessScore: number;
  };
  versionB: {
    id: string;
    versionNumber: number;
    createdAt: string;
    completenessScore: number;
  };
  differences: FieldDiff[];
  summary: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  comparedAt: string;
}

interface ExtractionDiffViewProps {
  comparison: ComparisonResult;
  onSelectVersion?: (versionId: string) => void;
  selectedVersionId?: string;
}

export function ExtractionDiffView({ 
  comparison, 
  onSelectVersion,
  selectedVersionId 
}: ExtractionDiffViewProps) {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set(['项目基本信息', '时间节点']));

  // 按分组组织差异
  const groupedDiffs = React.useMemo(() => {
    const groups: Record<string, FieldDiff[]> = {};

    for (const diff of comparison.differences) {
      const groupName = getGroupName(diff.fieldPath);
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(diff);
    }

    return groups;
  }, [comparison.differences]);

  // 统计各分组的差异数
  const groupStats = React.useMemo(() => {
    const stats: Record<string, { total: number; modified: number }> = {};

    for (const [group, diffs] of Object.entries(groupedDiffs)) {
      stats[group] = {
        total: diffs.length,
        modified: diffs.filter(d => d.diffType !== 'unchanged').length,
      };
    }

    return stats;
  }, [groupedDiffs]);

  const toggleGroup = (group: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group)) {
      newExpanded.delete(group);
    } else {
      newExpanded.add(group);
    }
    setExpandedGroups(newExpanded);
  };

  return (
    <div className="space-y-4">
      {/* 版本信息卡片 */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className={`cursor-pointer transition-all ${selectedVersionId === comparison.versionA.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => onSelectVersion?.(comparison.versionA.id)}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                版本 {comparison.versionA.versionNumber}
              </CardTitle>
              {selectedVersionId === comparison.versionA.id && (
                <Badge>已选择</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">创建时间</span>
                <span>{new Date(comparison.versionA.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">完整度</span>
                <span>{comparison.versionA.completenessScore?.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition-all ${selectedVersionId === comparison.versionB.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => onSelectVersion?.(comparison.versionB.id)}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                版本 {comparison.versionB.versionNumber}
              </CardTitle>
              {selectedVersionId === comparison.versionB.id && (
                <Badge>已选择</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">创建时间</span>
                <span>{new Date(comparison.versionB.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">完整度</span>
                <span>{comparison.versionB.completenessScore?.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 差异统计 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-700">+{comparison.summary.added}</Badge>
                <span className="text-sm text-muted-foreground">新增</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-red-100 text-red-700">-{comparison.summary.removed}</Badge>
                <span className="text-sm text-muted-foreground">删除</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-100 text-amber-700">~{comparison.summary.modified}</Badge>
                <span className="text-sm text-muted-foreground">修改</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{comparison.summary.unchanged}</Badge>
                <span className="text-sm text-muted-foreground">未变化</span>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              共 {comparison.summary.total} 处差异
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 筛选标签 */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="modified">仅差异</TabsTrigger>
          <TabsTrigger value="added">新增</TabsTrigger>
          <TabsTrigger value="removed">删除</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <DiffGroupsView 
            groupedDiffs={groupedDiffs} 
            groupStats={groupStats}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
          />
        </TabsContent>

        <TabsContent value="modified" className="mt-4">
          <DiffGroupsView 
            groupedDiffs={groupedDiffs} 
            groupStats={groupStats}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            filter="modified"
          />
        </TabsContent>

        <TabsContent value="added" className="mt-4">
          <DiffGroupsView 
            groupedDiffs={groupedDiffs} 
            groupStats={groupStats}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            filter="added"
          />
        </TabsContent>

        <TabsContent value="removed" className="mt-4">
          <DiffGroupsView 
            groupedDiffs={groupedDiffs} 
            groupStats={groupStats}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            filter="removed"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * 差异分组视图
 */
function DiffGroupsView({ 
  groupedDiffs, 
  groupStats,
  expandedGroups,
  toggleGroup,
  filter 
}: { 
  groupedDiffs: Record<string, FieldDiff[]>;
  groupStats: Record<string, { total: number; modified: number }>;
  expandedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  filter?: 'modified' | 'added' | 'removed';
}) {
  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-2">
        {Object.entries(groupedDiffs).map(([group, diffs]) => {
          const filteredDiffs = filter 
            ? diffs.filter(d => d.diffType === filter || (filter === 'modified' && d.diffType !== 'unchanged'))
            : diffs;

          if (filteredDiffs.length === 0) return null;

          const isExpanded = expandedGroups.has(group);
          const stats = groupStats[group];

          return (
            <Card key={group}>
              <CardHeader 
                className="py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => toggleGroup(group)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{group}</span>
                    {stats.modified > 0 && (
                      <Badge variant="secondary">{stats.modified} 处差异</Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {filteredDiffs.length} 个字段
                  </span>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">字段</TableHead>
                        <TableHead>
                          <div className="flex items-center gap-2">
                            版本 A 
                            <Badge variant="outline" className="text-xs">旧</Badge>
                          </div>
                        </TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>
                          <div className="flex items-center gap-2">
                            版本 B
                            <Badge variant="outline" className="text-xs">新</Badge>
                          </div>
                        </TableHead>
                        <TableHead className="w-[80px]">状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDiffs.map((diff, idx) => (
                        <TableRow key={idx} className={getRowClass(diff.diffType)}>
                          <TableCell className="font-medium">
                            {diff.fieldName}
                          </TableCell>
                          <TableCell className={getCellClass(diff.diffType, 'a')}>
                            <DiffValueDisplay value={diff.displayValueA} type={diff.diffType} side="a" />
                          </TableCell>
                          <TableCell className="text-center">
                            <DiffTypeIcon type={diff.diffType} />
                          </TableCell>
                          <TableCell className={getCellClass(diff.diffType, 'b')}>
                            <DiffValueDisplay value={diff.displayValueB} type={diff.diffType} side="b" />
                          </TableCell>
                          <TableCell>
                            <DiffTypeBadge type={diff.diffType} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/**
 * 差异值显示
 */
function DiffValueDisplay({ value, type, side }: { value: string; type: DiffType; side: 'a' | 'b' }) {
  const isHighlighted = 
    (type === 'added' && side === 'b') ||
    (type === 'removed' && side === 'a') ||
    type === 'modified';

  return (
    <div className={`text-sm ${isHighlighted ? 'font-medium' : 'text-muted-foreground'}`}>
      {value || <span className="italic">(空)</span>}
    </div>
  );
}

/**
 * 差异类型图标
 */
function DiffTypeIcon({ type }: { type: DiffType }) {
  switch (type) {
    case 'added':
      return <Plus className="h-4 w-4 text-green-600" />;
    case 'removed':
      return <Minus className="h-4 w-4 text-red-600" />;
    case 'modified':
      return <RefreshCw className="h-4 w-4 text-amber-600" />;
    default:
      return <ArrowRight className="h-4 w-4 text-muted-foreground" />;
  }
}

/**
 * 差异类型徽章
 */
function DiffTypeBadge({ type }: { type: DiffType }) {
  switch (type) {
    case 'added':
      return <Badge className="bg-green-100 text-green-700">新增</Badge>;
    case 'removed':
      return <Badge className="bg-red-100 text-red-700">删除</Badge>;
    case 'modified':
      return <Badge className="bg-amber-100 text-amber-700">修改</Badge>;
    default:
      return <Badge variant="outline">相同</Badge>;
  }
}

/**
 * 获取行样式
 */
function getRowClass(type: DiffType): string {
  switch (type) {
    case 'added':
      return 'bg-green-50';
    case 'removed':
      return 'bg-red-50';
    case 'modified':
      return 'bg-amber-50';
    default:
      return '';
  }
}

/**
 * 获取单元格样式
 */
function getCellClass(type: DiffType, side: 'a' | 'b'): string {
  if (type === 'added' && side === 'b') {
    return 'bg-green-100/50';
  }
  if (type === 'removed' && side === 'a') {
    return 'bg-red-100/50';
  }
  if (type === 'modified') {
    return side === 'a' ? 'bg-red-100/30' : 'bg-green-100/30';
  }
  return '';
}

/**
 * 获取分组名称
 */
function getGroupName(fieldPath: string): string {
  const firstPart = fieldPath.split('.')[0];
  const groupMap: Record<string, string> = {
    'project_basic_info': '项目基本信息',
    'time_schedule': '时间节点',
    'core_tech_demand': '技术需求',
    'business_requirements': '商务要求',
    'scoring_standard': '评分标准',
    'key_compliance_requirements': '合规要求',
    'bidding_document_requirements': '投标文件要求',
    'project_background': '项目背景',
    'extraction_metadata': '提取元数据',
  };
  return groupMap[firstPart] || firstPart;
}

export default ExtractionDiffView;
