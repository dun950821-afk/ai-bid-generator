'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Database,
  MoreVertical,
  Trash2,
  ExternalLink,
  Cpu,
  Sparkles,
  Scissors,
  FolderOpen,
  Server,
  MessageSquare,
  Settings2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * 知识库信息接口
 */
export interface KnowledgeBaseInfo {
  // 基础信息
  id: string;
  name: string;
  description?: string;
  type: string;
  structureType?: 'unstructured' | 'structured' | 'multimedia';
  status: 'creating' | 'active' | 'failed';
  
  // 模型配置
  embeddingModelName?: string;
  rerankModelName?: string;
  rerankMinScore?: number;
  enableRewrite?: boolean;
  
  // 切分配置
  chunkSize?: number;
  overlapSize?: number;
  separator?: string;
  
  // 数据源配置
  sourceType?: string;
  documentIds?: string[];
  documentCount: number;
  
  // 向量存储配置
  sinkType?: string;
  sinkInstanceId?: string;
  sinkRegion?: string;
  
  // 配置模式
  configModel?: 'recommend' | 'custom';
  
  // 时间信息
  createdAt?: string;
  updatedAt?: string;
}

interface KnowledgeBaseCardProps {
  knowledgeBase: KnowledgeBaseInfo;
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
  compact?: boolean; // 紧凑模式，用于首页
}

/**
 * 知识库卡片组件
 * @description 展示知识库的完整信息，包括模型配置、切分配置、数据源等
 */
export function KnowledgeBaseCard({
  knowledgeBase,
  onView,
  onDelete,
  compact = false,
}: KnowledgeBaseCardProps) {
  const {
    id,
    name,
    description,
    structureType,
    status,
    embeddingModelName,
    rerankModelName,
    rerankMinScore,
    enableRewrite,
    chunkSize,
    overlapSize,
    separator,
    sourceType,
    documentCount,
    sinkType,
    configModel,
    createdAt,
  } = knowledgeBase;

  // 状态映射
  const statusMap = {
    creating: { label: '创建中', color: 'bg-yellow-100 text-yellow-700' },
    active: { label: '活跃', color: 'bg-green-100 text-green-700' },
    failed: { label: '失败', color: 'bg-red-100 text-red-700' },
  };

  // 类型映射
  const typeMap = {
    unstructured: { label: '非结构化', color: 'bg-blue-100 text-blue-700' },
    structured: { label: '结构化', color: 'bg-purple-100 text-purple-700' },
    multimedia: { label: '多模态', color: 'bg-pink-100 text-pink-700' },
  };

  const statusInfo = statusMap[status] || statusMap.active;
  const typeInfo = structureType ? typeMap[structureType] || typeMap.unstructured : null;

  // 紧凑模式（首页）
  if (compact) {
    return (
      <div
        className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => onView?.(id)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
            <span className="font-medium text-sm truncate">{name}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${statusInfo.color}`}>
              {documentCount}
            </span>
          </div>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{description}</p>
          )}
          {/* 显示关键配置 */}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            {embeddingModelName && (
              <span className="flex items-center gap-0.5">
                <Cpu className="h-3 w-3" />
                {embeddingModelName.replace('text-embedding-', 'v')}
              </span>
            )}
            {rerankModelName && (
              <span className="flex items-center gap-0.5">
                <Sparkles className="h-3 w-3" />
                rerank
              </span>
            )}
            {enableRewrite && (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                改写
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <ExternalLink className="h-4 w-4 text-gray-400" />
        </div>
      </div>
    );
  }

  // 完整模式（详情页）
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50">
              <Database className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
                {typeInfo && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                )}
                {configModel && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    {configModel === 'recommend' ? '推荐配置' : '自定义'}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView?.(id)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                查看详情
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => onDelete?.(id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {description && (
          <CardDescription className="mt-2">{description}</CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* 模型配置 */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <Cpu className="h-4 w-4 text-blue-500" />
            模型配置
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-gray-500">Embedding</span>
              <span className="font-medium text-xs">{embeddingModelName || '-'}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-gray-500">Rerank</span>
              <span className="font-medium text-xs">{rerankModelName || '-'}</span>
            </div>
            {rerankMinScore !== undefined && (
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-gray-500">相似度阈值</span>
                <span className="font-medium text-xs">{rerankMinScore}</span>
              </div>
            )}
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-gray-500">多轮对话改写</span>
              <Badge variant={enableRewrite ? 'default' : 'secondary'} className="text-xs">
                {enableRewrite ? '已开启' : '未开启'}
              </Badge>
            </div>
          </div>
        </div>
        
        {/* 切分配置 */}
        {(chunkSize || overlapSize || separator) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Scissors className="h-4 w-4 text-purple-500" />
              切分配置
            </h4>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {chunkSize && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500 text-xs">分段长度</span>
                  <span className="font-medium text-xs">{chunkSize}</span>
                </div>
              )}
              {overlapSize && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500 text-xs">重叠长度</span>
                  <span className="font-medium text-xs">{overlapSize}</span>
                </div>
              )}
              {separator && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500 text-xs">分隔符</span>
                  <span className="font-medium text-xs font-mono">
                    {separator.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* 数据源与存储 */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <FolderOpen className="h-4 w-4 text-green-500" />
            数据源
          </h4>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              {sourceType && (
                <Badge variant="outline" className="text-xs">
                  {sourceType.replace('DATA_CENTER_', '').replace('_', ' ')}
                </Badge>
              )}
              <span className="text-gray-500">
                文档: <span className="font-medium text-gray-900">{documentCount}</span> 个
              </span>
            </div>
            {sinkType && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Server className="h-3.5 w-3.5" />
                {sinkType}
              </div>
            )}
          </div>
        </div>
        
        {/* 底部信息 */}
        {createdAt && (
          <div className="flex items-center justify-between pt-3 border-t text-xs text-gray-400">
            <span>
              创建于 {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: zhCN })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onView?.(id)}
            >
              查看详情
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 知识库卡片骨架屏
 */
export function KnowledgeBaseCardSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 animate-pulse">
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
        <div className="h-4 w-4 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gray-200">
            <div className="h-5 w-5"></div>
          </div>
          <div className="flex-1">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-10 bg-gray-100 rounded"></div>
            <div className="h-10 bg-gray-100 rounded"></div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-10 bg-gray-100 rounded"></div>
            <div className="h-10 bg-gray-100 rounded"></div>
            <div className="h-10 bg-gray-100 rounded"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
