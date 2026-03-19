'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Download,
  Copy,
  Check,
  ExternalLink,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useState, useCallback } from 'react';

export interface MarkdownPreviewProps {
  content: string;
  title?: string;
  description?: string;
  className?: string;
  showActions?: boolean;
  maxHeight?: string;
}

/**
 * 专业 Markdown 预览组件
 * 支持表格、列表、标题等富文本格式的完美渲染
 */
export function MarkdownPreview({
  content,
  title,
  description,
  className,
  showActions = true,
  maxHeight = '70vh',
}: MarkdownPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, [content]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 标题栏 */}
      {(title || showActions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <>
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-800 truncate">{title}</h3>
              </>
            )}
            {description && (
              <Badge variant="outline" className="text-xs text-slate-500 bg-white">
                {description}
              </Badge>
            )}
          </div>
          {showActions && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1 text-green-500" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    复制
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Markdown 渲染区 */}
      <ScrollArea style={{ maxHeight }} className="flex-1">
        <div className="p-6">
          <article className="prose prose-sm prose-slate max-w-none dark:prose-invert
            prose-headings:text-slate-800 prose-headings:font-bold
            prose-h1:text-2xl prose-h1:pb-3 prose-h1:border-b prose-h1:border-slate-200
            prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-100
            prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-slate-700 prose-p:leading-relaxed prose-p:my-3
            prose-ul:my-4 prose-ol:my-4
            prose-li:my-1.5 prose-li:text-slate-700
            prose-li:marker:text-blue-500
            prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:my-4 prose-blockquote:not-italic prose-blockquote:text-slate-700
            prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-blue-600 prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:my-4 prose-pre:p-4
            prose-table:my-6 prose-table:border-collapse prose-table:w-full
            prose-thead:bg-slate-50 prose-thead:border-b prose-thead:border-slate-200
            prose-th:text-slate-700 prose-th:text-xs prose-th:font-semibold prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:border-b prose-th:border-slate-200
            prose-td:text-sm prose-td:text-slate-600 prose-td:px-4 prose-td:py-3 prose-td:border-b prose-td:border-slate-100
            prose-tr:hover:bg-slate-50/50
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-hr:border-slate-200 prose-hr:my-6
            prose-img:rounded-lg prose-img:shadow-sm prose-img:my-4
          ">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                // 自定义表格渲染
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4 rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-slate-50">{children}</thead>
                ),
                tbody: ({ children }) => (
                  <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-slate-50/50 transition-colors">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-3 text-sm text-slate-600">{children}</td>
                ),
                // 自定义标题渲染
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold text-slate-800 pb-3 mb-4 border-b border-slate-200">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4 pb-2 border-b border-slate-100">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold text-slate-800 mt-6 mb-3">
                    {children}
                  </h3>
                ),
                // 自定义列表渲染
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-1.5 my-4 text-slate-700">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-1.5 my-4 text-slate-700">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-slate-700 leading-relaxed">{children}</li>
                ),
                // 自定义段落渲染
                p: ({ children }) => (
                  <p className="text-slate-700 leading-relaxed my-3">{children}</p>
                ),
                // 自定义引用块渲染
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-blue-500 bg-blue-50/50 py-2 px-4 my-4 text-slate-700 not-italic rounded-r">
                    {children}
                  </blockquote>
                ),
                // 自定义代码渲染
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="bg-slate-100 text-blue-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                // 自定义链接渲染
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                  >
                    {children}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ),
                // 自定义分隔线渲染
                hr: () => <hr className="border-slate-200 my-6" />,
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Markdown 预览对话框组件
 * 用于全屏预览文档内容
 */
export interface MarkdownPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  title?: string;
  description?: string;
}

export function MarkdownPreviewDialog({
  open,
  onOpenChange,
  content,
  title = '内容预览',
  description,
}: MarkdownPreviewDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'transition-all duration-300',
          isFullscreen
            ? 'w-screen h-screen max-w-none m-0 rounded-none'
            : 'max-w-4xl max-h-[85vh]'
        )}
      >
        <DialogHeader className={cn(isFullscreen && 'sr-only')}>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-400" />
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-hidden -mx-6 -mb-6">
          <MarkdownPreview
            content={content}
            maxHeight={isFullscreen ? 'calc(100vh - 60px)' : '60vh'}
          />
        </div>
        {/* 全屏切换按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-12"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default MarkdownPreview;
