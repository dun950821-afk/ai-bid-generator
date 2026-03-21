'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { 
  Database, Search, FileText, CheckCircle2, X, Sparkles,
  Loader2, Check, FolderOpen, FileCheck,
  ChevronLeft, ChevronRight, Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ===== 类型定义 =====
interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount?: number;
}

interface DocumentTag {
  id: string;
  name: string;
  color?: string;
}

interface Document {
  id: string;
  name: string;
  originalName?: string;
  fileType: string;
  fileSize: number;
  status: string;
  chunkCount?: number;
  tags: DocumentTag[];
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  createdAt?: string;
}

interface TagInfo {
  id: string;
  name: string;
  documentCount: number;
}

interface KnowledgeDocumentSelectorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKnowledgeBaseId?: string;
  onConfirm: (documents: Document[]) => void;
  maxSelection?: number;
  selectedIds?: string[];
}

// ===== 工具函数 =====
function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(fileType: string): string {
  const type = fileType?.toLowerCase().replace('.', '') || '';
  if (['pdf'].includes(type)) return '📄';
  if (['doc', 'docx'].includes(type)) return '📝';
  if (['xls', 'xlsx'].includes(type)) return '📊';
  if (['ppt', 'pptx'].includes(type)) return '📽️';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)) return '🖼️';
  if (['mp4', 'avi', 'mov'].includes(type)) return '🎬';
  if (['mp3', 'wav'].includes(type)) return '🎵';
  if (['zip', 'rar', '7z'].includes(type)) return '📦';
  return '📄';
}

// ===== 主组件 =====
export default function KnowledgeDocumentSelector({
  isOpen,
  onOpenChange,
  defaultKnowledgeBaseId,
  onConfirm,
  maxSelection,
  selectedIds = [],
}: KnowledgeDocumentSelectorProps) {
  // ===== 状态管理 =====
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set(selectedIds));
  const [loadingKbs, setLoadingKbs] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  
  // 搜索和筛选
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  
  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5; // 每页5个

  // ===== 初始化加载 =====
  useEffect(() => {
    if (isOpen) {
      fetchKnowledgeBases();
      fetchAllTags();
      if (defaultKnowledgeBaseId) {
        setSelectedKbId(defaultKnowledgeBaseId);
      }
      // 重置状态
      setSearchKeyword('');
      setSelectedTags([]);
    }
  }, [isOpen, defaultKnowledgeBaseId]);

  // 当选中知识库变化时加载文档
  useEffect(() => {
    if (selectedKbId && isOpen) {
      fetchDocuments(selectedKbId);
    }
  }, [selectedKbId, isOpen]);

  // ===== API调用 =====
  const fetchKnowledgeBases = async () => {
    setLoadingKbs(true);
    try {
      const res = await fetch('/api/bailian/knowledge-bases?limit=100');
      const data = await res.json();
      if (data.success) {
        const kbs = data.data?.items || [];
        setKnowledgeBases(kbs);
        // 如果没有默认知识库，选中第一个
        if (!selectedKbId && kbs.length > 0) {
          setSelectedKbId(kbs[0].id);
        }
      }
    } catch (error) {
      console.error('获取知识库列表失败:', error);
    } finally {
      setLoadingKbs(false);
    }
  };

  const fetchDocuments = async (kbId: string) => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/bailian/knowledge-bases/${kbId}/documents?all=true`);
      const data = await res.json();
      if (data.success) {
        const docs = data.data?.documents || [];
        // 添加知识库信息
        const kb = knowledgeBases.find(k => k.id === kbId);
        const docsWithKbInfo = docs.map((doc: any) => ({
          ...doc,
          knowledgeBaseId: kbId,
          knowledgeBaseName: kb?.name || '未知知识库',
        }));
        setDocuments(docsWithKbInfo);
      }
    } catch (error) {
      console.error('获取文档列表失败:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchAllTags = async () => {
    try {
      const res = await fetch('/api/bailian/tags');
      const data = await res.json();
      if (data.success) {
        // 兼容字符串数组和对象数组两种格式
        const rawTags = data.data || [];
        const formattedTags = rawTags.map((tag: any) => {
          if (typeof tag === 'string') {
            return { id: tag, name: tag, documentCount: 0 };
          }
          return tag;
        });
        setAllTags(formattedTags);
      }
    } catch (error) {
      console.error('获取标签列表失败:', error);
    }
  };

  // ===== 筛选逻辑 =====
  const filteredDocuments = useMemo(() => {
    let result = documents;
    
    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(doc => 
        doc.name?.toLowerCase().includes(keyword) ||
        doc.originalName?.toLowerCase().includes(keyword)
      );
    }
    
    // 标签筛选
    if (selectedTags.length > 0) {
      result = result.filter(doc =>
        doc.tags?.some(tag => selectedTags.includes(tag.name))
      );
    }
    
    return result;
  }, [documents, searchKeyword, selectedTags]);

  // 分页后的文档列表
  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDocuments.slice(start, start + pageSize);
  }, [filteredDocuments, currentPage]);

  // 总页数
  const totalPages = useMemo(() => {
    return Math.ceil(filteredDocuments.length / pageSize);
  }, [filteredDocuments.length]);

  // 筛选条件变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, selectedTags]);

  // ===== 选择操作 =====
  const toggleDocument = useCallback((docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else if (!maxSelection || next.size < maxSelection) {
        next.add(docId);
      }
      return next;
    });
  }, [maxSelection]);

  const selectAll = useCallback(() => {
    setSelectedDocIds(new Set(filteredDocuments.map(d => d.id)));
  }, [filteredDocuments]);

  const clearSelection = useCallback(() => {
    setSelectedDocIds(new Set());
  }, []);

  const toggleTag = useCallback((tagName: string) => {
    setSelectedTags(prev => 
      prev.includes(tagName) 
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  }, []);

  const clearTagFilter = useCallback(() => {
    setSelectedTags([]);
  }, []);

  // ===== 确认操作 =====
  const handleConfirm = () => {
    const selectedDocs = documents.filter(d => selectedDocIds.has(d.id));
    onConfirm(selectedDocs);
    onOpenChange(false);
  };

  // ===== 获取选中知识库的文档数 =====
  const selectedKb = knowledgeBases.find(kb => kb.id === selectedKbId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[850px] h-[80vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Database className="h-5 w-5 text-blue-600" />
            </div>
            <span>选择参考文档</span>
            <span className="text-xs font-normal text-slate-500 ml-1">选择知识库中的文档作为AI生成内容的参考素材，支持搜索和标签筛选</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：知识库列表 - 占1份 */}
          <div className="flex-1 border-r border-slate-200 bg-slate-50/50 flex flex-col min-w-0">
            <div className="px-3 py-2 border-b border-slate-200 bg-white">
              <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                知识库列表
              </h4>
            </div>
            <ScrollArea className="flex-1" type="always">
              {loadingKbs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : knowledgeBases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 px-4">
                  <Database className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm text-center">暂无知识库</p>
                  <p className="text-xs text-center mt-1">请先创建知识库</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {knowledgeBases.map(kb => {
                    const isSelected = selectedKbId === kb.id;
                    return (
                      <button
                        key={kb.id}
                        onClick={() => setSelectedKbId(kb.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all duration-200",
                          isSelected
                            ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                            : "hover:bg-white text-slate-600 border border-transparent hover:shadow-sm"
                        )}
                      >
                        <div className={cn(
                          "p-1 rounded-md transition-colors",
                          isSelected ? "bg-blue-100" : "bg-slate-100"
                        )}>
                          <Database className={cn(
                            "h-3.5 w-3.5",
                            isSelected ? "text-blue-600" : "text-slate-400"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "font-medium truncate text-xs",
                            isSelected && "text-blue-700"
                          )}>
                            {kb.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {kb.documentCount || 0} 个文档
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-blue-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* 右侧：搜索标签选择和文档列表 - 占3份 */}
          <div className="flex-[3] flex flex-col min-w-0">
            {/* 搜索栏 */}
            <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="搜索文档..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 focus:bg-white"
                />
                {searchKeyword && (
                  <button
                    onClick={() => setSearchKeyword('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            
            {/* 标签筛选区（多选模式） */}
            {allTags.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
                    <Tag className="w-3 h-3" />
                    标签:
                  </span>
                  {allTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <Badge
                        key={tag.id}
                        variant={isSelected ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer transition-colors text-xs",
                          isSelected 
                            ? "bg-blue-500 text-white hover:bg-blue-600" 
                            : "hover:bg-slate-100"
                        )}
                        onClick={() => toggleTag(tag.name)}
                      >
                        {tag.name}
                        {tag.documentCount > 0 && (
                          <span className={cn(
                            "ml-1 text-[10px]",
                            isSelected ? "text-blue-100" : "text-slate-400"
                          )}>
                            {tag.documentCount}
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                  {selectedTags.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="cursor-pointer text-xs"
                      onClick={clearTagFilter}
                    >
                      清除
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* 当前筛选状态提示 */}
            {(searchKeyword || selectedTags.length > 0) && (
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="shrink-0">筛选结果: {filteredDocuments.length} 个文档</span>
                {searchKeyword && (
                  <Badge variant="outline" className="h-5 text-[10px] gap-1 items-center">
                    关键词: {searchKeyword}
                    <button 
                      type="button"
                      className="ml-0.5 p-0.5 rounded hover:bg-slate-200 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSearchKeyword(''); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedTags.map(tag => (
                  <Badge key={tag} variant="outline" className="h-5 text-[10px] gap-1 bg-blue-50 border-blue-200 text-blue-600 items-center">
                    {tag}
                    <button 
                      type="button"
                      className="ml-0.5 p-0.5 rounded hover:bg-blue-100 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* 文档列表 */}
            <ScrollArea className="flex-1" type="always">
              {loadingDocs ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
                  <p className="text-sm text-slate-400">正在加载文档列表...</p>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 px-4">
                  <FileText className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm font-medium">没有匹配的文档</p>
                  <p className="text-xs mt-1">尝试更换搜索条件或筛选条件</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {paginatedDocuments.map(doc => {
                    const isSelected = selectedDocIds.has(doc.id);
                    return (
                      <div
                        key={doc.id}
                        onClick={() => toggleDocument(doc.id)}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all duration-150",
                          isSelected
                            ? "bg-blue-50 border border-blue-200"
                            : "hover:bg-slate-50 border border-transparent"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleDocument(doc.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 h-3.5 w-3.5"
                        />
                        <span className="text-base shrink-0">{getFileIcon(doc.fileType)}</span>
                        <span className={cn(
                          "text-xs font-medium truncate flex-1",
                          isSelected && "text-blue-700"
                        )}>
                          {doc.name || doc.originalName}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 px-3 py-2 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-6 w-6 p-0 text-xs",
                          currentPage === pageNum && "bg-blue-600 hover:bg-blue-700"
                        )}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* 底部状态栏 */}
            <div className="px-3 py-2 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all-docs"
                  checked={selectedDocIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                  onCheckedChange={(checked) => checked ? selectAll() : clearSelection()}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor="select-all-docs" className="text-xs text-slate-600 cursor-pointer flex items-center gap-1">
                  <FileCheck className="h-3.5 w-3.5 text-slate-400" />
                  已选择 <span className="font-semibold text-blue-600">{selectedDocIds.size}</span> / {filteredDocuments.length}
                </Label>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 text-xs text-slate-500 px-2">
                  清除
                </Button>
                <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs text-slate-500 px-2">
                  全选
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-white shrink-0">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="min-w-[80px]"
          >
            取消
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={selectedDocIds.size === 0}
            className="min-w-[140px] bg-blue-600 hover:bg-blue-700"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            开始生成 {selectedDocIds.size > 0 && `(${selectedDocIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
