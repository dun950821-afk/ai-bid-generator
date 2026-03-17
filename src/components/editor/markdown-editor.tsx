'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Link,
  Image,
  Table,
  Minus,
  Save,
  RefreshCw,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: (content: string) => Promise<void>;
  onGenerate?: () => Promise<void>;
  isGenerating?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

export function MarkdownEditor({
  content,
  onChange,
  onSave,
  onGenerate,
  isGenerating = false,
  readOnly = false,
  placeholder = '请输入内容...',
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview' | 'split'>('split');

  // 插入文本到光标位置
  const insertText = useCallback((before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea || readOnly) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText = content.substring(0, start) + before + selectedText + after + content.substring(end);

    onChange(newText);

    // 恢复光标位置
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  }, [content, onChange, readOnly]);

  // 格式化工具
  const tools = [
    { icon: Heading1, tooltip: '一级标题', action: () => insertText('# ', '') },
    { icon: Heading2, tooltip: '二级标题', action: () => insertText('## ', '') },
    { icon: Heading3, tooltip: '三级标题', action: () => insertText('### ', '') },
    { icon: Bold, tooltip: '粗体', action: () => insertText('**', '**') },
    { icon: Italic, tooltip: '斜体', action: () => insertText('*', '*') },
    { icon: List, tooltip: '无序列表', action: () => insertText('- ', '') },
    { icon: ListOrdered, tooltip: '有序列表', action: () => insertText('1. ', '') },
    { icon: Quote, tooltip: '引用', action: () => insertText('> ', '') },
    { icon: Code, tooltip: '代码块', action: () => insertText('```\n', '\n```') },
    { icon: Link, tooltip: '链接', action: () => insertText('[', '](url)') },
    { icon: Image, tooltip: '图片', action: () => insertText('![alt](', ')') },
    { icon: Table, tooltip: '表格', action: () => insertText('| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |', '') },
    { icon: Minus, tooltip: '分隔线', action: () => insertText('\n---\n', '') },
  ];

  // 保存
  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(content);
    } finally {
      setSaving(false);
    }
  };

  // 复制
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            handleSave();
            break;
          case 'b':
            e.preventDefault();
            insertText('**', '**');
            break;
          case 'i':
            e.preventDefault();
            insertText('*', '*');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, insertText]);

  // 简单的Markdown渲染
  const renderMarkdown = (text: string): string => {
    return text
      // 标题
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // 粗体和斜体
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // 代码块
      .replace(/```(\w*)\n([\s\S]+?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // 行内代码
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // 列表
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      // 引用
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      // 链接
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      // 分隔线
      .replace(/^---$/gm, '<hr />')
      // 段落
      .replace(/\n\n/g, '</p><p>')
      // 换行
      .replace(/\n/g, '<br />');
  };

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/50">
        <div className="flex items-center gap-1">
          {tools.map((tool, index) => (
            <Button
              key={index}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={tool.action}
              disabled={readOnly}
              title={tool.tooltip}
            >
              <tool.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* 视图切换 */}
          <div className="flex rounded-md border">
            <Button
              variant={previewMode === 'edit' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none rounded-l-md"
              onClick={() => setPreviewMode('edit')}
            >
              编辑
            </Button>
            <Button
              variant={previewMode === 'split' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none border-x"
              onClick={() => setPreviewMode('split')}
            >
              分屏
            </Button>
            <Button
              variant={previewMode === 'preview' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none rounded-r-md"
              onClick={() => setPreviewMode('preview')}
            >
              预览
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCopy}
            title="复制"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>

          {onGenerate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              AI生成
            </Button>
          )}

          {onSave && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving || readOnly}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              保存
            </Button>
          )}
        </div>
      </div>

      {/* 编辑区域 */}
      <div className="flex-1 flex">
        {/* 编辑器 */}
        {(previewMode === 'edit' || previewMode === 'split') && (
          <div className={`${previewMode === 'split' ? 'w-1/2 border-r' : 'w-full'} h-full`}>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={readOnly}
              className="h-full resize-none rounded-none border-0 focus-visible:ring-0 font-mono text-sm"
            />
          </div>
        )}

        {/* 预览 */}
        {(previewMode === 'preview' || previewMode === 'split') && (
          <div className={`${previewMode === 'split' ? 'w-1/2' : 'w-full'} h-full`}>
            <ScrollArea className="h-full">
              <div
                className="p-4 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: content ? renderMarkdown(content) : `<p class="text-muted-foreground">${placeholder}</p>`,
                }}
              />
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
