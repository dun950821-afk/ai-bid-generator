'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, FileText, Clock, Trash2, ChevronRight, FolderOpen } from 'lucide-react';

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount?: number;
  createdAt?: string;
  type?: string;
  _provider?: 'bailian' | 'ima' | 'coze';
  status?: string;
}

interface KnowledgeBaseCardProps {
  knowledgeBase: KnowledgeBase;
  compact?: boolean;
  onDelete: (id: string) => void;
}

export function KnowledgeBaseCard({
  knowledgeBase,
  compact = false,
  onDelete,
}: KnowledgeBaseCardProps) {
  const router = useRouter();
  const { id, name, description, documentCount = 0, createdAt, type, _provider, status } = knowledgeBase;

  const handleClick = () => {
    router.push(`/knowledge-bases/${id}`);
  };

  const getProviderColor = () => {
    switch (_provider) {
      case 'ima': return 'text-sky-600';
      case 'coze': return 'text-amber-600';
      default: return 'text-primary';
    }
  };

  const getProviderBg = () => {
    switch (_provider) {
      case 'ima': return 'bg-sky-50 dark:bg-sky-950/50';
      case 'coze': return 'bg-amber-50 dark:bg-amber-950/50';
      default: return 'bg-primary/5';
    }
  };

  const getProviderBorder = () => {
    switch (_provider) {
      case 'ima': return 'border-sky-200 dark:border-sky-800';
      case 'coze': return 'border-amber-200 dark:border-amber-800';
      default: return 'border-primary/20';
    }
  };

  const getProviderBadge = () => {
    switch (_provider) {
      case 'ima': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300';
      case 'coze': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
      default: return 'bg-primary/10 text-primary';
    }
  };

  const getStatusLabel = () => {
    if (status === 'indexing') return { text: '处理中', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' };
    if (status === 'active') return { text: '就绪', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
    return null;
  };

  if (compact) {
    return (
      <div
        className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 cursor-pointer"
        onClick={handleClick}
      >
        {/* 图标 */}
        <div className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg ${getProviderBg()} ${getProviderBorder()} border`}>
          <FolderOpen className={`h-4 w-4 ${getProviderColor()}`} />
        </div>

        {/* 名称和统计 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{name}</h4>
            {_provider && (
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 font-medium rounded ${getProviderBadge()}`}>
                {_provider === 'ima' ? 'IMA' : _provider === 'coze' ? 'Coze' : _provider}
              </Badge>
            )}
            {getStatusLabel() && (
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 font-medium rounded ${getStatusLabel()?.className}`}>
                {getStatusLabel()?.text}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {documentCount} 份文档
            {createdAt && <span className="ml-2">· {new Date(createdAt).toLocaleDateString()}</span>}
          </p>
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="group cursor-pointer rounded-xl border border-border/60 bg-card p-5 hover:border-primary/30 hover:shadow-sm transition-all duration-200"
      onClick={handleClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${getProviderBg()} ${getProviderBorder()} border`}>
            <Database className={`h-5 w-5 ${getProviderColor()}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">{name}</h3>
              {_provider && (
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 font-medium rounded ${getProviderBadge()}`}>
                  {_provider === 'ima' ? 'IMA' : _provider === 'coze' ? 'Coze' : _provider}
                </Badge>
              )}
            </div>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                {description}
              </p>
            )}
          </div>
        </div>
        {type && (
          <Badge variant="secondary">{type}</Badge>
        )}
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {documentCount} 文档
          </span>
          {createdAt && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {new Date(createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
      </div>
    </div>
  );
}

export function KnowledgeBaseCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-muted animate-pulse rounded-lg" />
        <div className="flex-1">
          <div className="w-32 h-5 bg-muted animate-pulse rounded mb-2" />
          <div className="w-48 h-4 bg-muted animate-pulse rounded" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-16 h-4 bg-muted animate-pulse rounded" />
        <div className="w-20 h-4 bg-muted animate-pulse rounded" />
      </div>
    </div>
  );
}

export default KnowledgeBaseCard;
