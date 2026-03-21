'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, FileText, Clock, Trash2, Eye } from 'lucide-react';

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
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

export function KnowledgeBaseCard({
  knowledgeBase,
  compact = false,
  onView,
  onDelete,
}: KnowledgeBaseCardProps) {
  const { id, name, description, documentCount = 0, createdAt, type } = knowledgeBase;

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onView(id);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onView(id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">{name}</CardTitle>
          </div>
          {type && (
            <Badge variant="secondary">{type}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
        </div>
      </CardContent>
    </Card>
  );
}

export function KnowledgeBaseCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-muted animate-pulse rounded-lg" />
            <div className="w-24 h-5 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full h-4 bg-muted animate-pulse rounded mb-3" />
        <div className="w-2/3 h-4 bg-muted animate-pulse rounded mb-3" />
        <div className="flex items-center gap-3">
          <div className="w-16 h-4 bg-muted animate-pulse rounded" />
          <div className="w-16 h-4 bg-muted animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

export default KnowledgeBaseCard;
