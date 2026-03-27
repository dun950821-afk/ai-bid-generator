'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, FileText, Clock, Trash2, ArrowRight } from 'lucide-react';

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount?: number;
  createdAt?: string;
  type?: string;
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
  const { id, name, description, documentCount = 0, createdAt, type } = knowledgeBase;

  const handleClick = () => {
    router.push(`/knowledge-bases/${id}`);
  };

  if (compact) {
    return (
      <div
        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={handleClick}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="font-medium">{name}</h4>
            <p className="text-sm text-muted-foreground">
              {documentCount} 文档
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <ArrowRight className="h-4 w-4 text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer border rounded-lg p-4 hover:border-primary/50 transition-colors"
      onClick={handleClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-medium text-base">{name}</h3>
        </div>
        {type && (
          <Badge variant="secondary">{type}</Badge>
        )}
      </div>
      {description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {description}
        </p>
      )}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {documentCount} 文档
          </span>
          {createdAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
}

export function KnowledgeBaseCardSkeleton() {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-muted animate-pulse rounded-lg" />
          <div className="w-24 h-5 bg-muted animate-pulse rounded" />
        </div>
      </div>
      <div className="w-full h-4 bg-muted animate-pulse rounded mb-3" />
      <div className="w-2/3 h-4 bg-muted animate-pulse rounded mb-3" />
      <div className="flex items-center gap-3">
        <div className="w-16 h-4 bg-muted animate-pulse rounded" />
        <div className="w-16 h-4 bg-muted animate-pulse rounded" />
      </div>
    </div>
  );
}

export default KnowledgeBaseCard;
