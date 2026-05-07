'use client';

import React, { useState, useEffect } from 'react';
import { Tags, X, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface EditTagsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialTags?: string[];
  historyTags?: string[];
  onSave?: (tags: string[]) => void;
}

export default function EditTagsDialog({
  isOpen,
  onOpenChange,
  initialTags = [],
  historyTags = [],
  onSave
}: EditTagsDialogProps) {
  const [currentTags, setCurrentTags] = useState<string[]>(initialTags);
  const [inputValue, setInputValue] = useState('');

  // 当对话框打开时，重置状态
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentTags(initialTags);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputValue('');
    }
  }, [isOpen, initialTags]);

  // 添加新标签
  const handleAddTag = () => {
    const trimmed = inputValue.trim();
    // 验证：非空、不重复、不含空格
    if (trimmed && !currentTags.includes(trimmed) && !trimmed.includes(' ')) {
      setCurrentTags([...currentTags, trimmed]);
      setInputValue('');
    }
  };

  // 点击回车添加
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // 从历史记录添加
  const handleAddHistorical = (tag: string) => {
    if (!currentTags.includes(tag)) {
      setCurrentTags([...currentTags, tag]);
    }
  };

  // 移除已选标签
  const handleRemoveTag = (tagToRemove: string) => {
    setCurrentTags(currentTags.filter(t => t !== tagToRemove));
  };

  // 保存并关闭
  const handleSave = () => {
    onSave?.(currentTags);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* 限制最大宽度，加入圆角和精致阴影 */}
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white border-slate-200">
        
        {/* 1. 头部区域：带底色和图标，确立专业感 */}
        <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Tags className="w-5 h-5 text-blue-600" />
            编辑文档标签
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 mt-1">
            为当前文档添加或移除分类标签，以便于后续检索与管理。
          </DialogDescription>
        </DialogHeader>

        {/* 2. 主体内容区：统一的 padding 和 space-y 提供呼吸感 */}
        <div className="p-6 space-y-6">
          
          {/* 已选标签区域 */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">当前标签</h4>
            <div className="min-h-[40px] p-3 border border-slate-200 rounded-lg bg-slate-50 flex flex-wrap gap-2">
              {currentTags.length > 0 ? (
                currentTags.map(tag => (
                  <Badge 
                    key={tag} 
                    variant="secondary"
                    className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-2.5 py-1 text-sm font-normal rounded-md flex items-center gap-1.5 transition-colors"
                  >
                    {tag}
                    <button
                      type="button"
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-blue-300 transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveTag(tag);
                      }}
                    >
                      <X className="w-3 h-3 text-blue-500 hover:text-blue-800" />
                    </button>
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-400 italic flex items-center h-full">暂无标签，请在下方添加</span>
              )}
            </div>
          </div>

          {/* 自定义输入区域 */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">添加新标签</h4>
            <div className="flex items-center gap-2">
              <Input 
                placeholder="输入标签名称 (按回车快速添加)..." 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 focus-visible:ring-blue-500"
              />
              <Button 
                onClick={handleAddTag} 
                variant="secondary" 
                className="shrink-0 bg-slate-100 text-slate-700 hover:bg-slate-200"
                disabled={!inputValue.trim() || currentTags.includes(inputValue.trim()) || inputValue.includes(' ')}
              >
                <Plus className="w-4 h-4 mr-1" /> 添加
              </Button>
            </div>
            {inputValue.includes(' ') && (
              <p className="text-xs text-destructive mt-1.5">标签不能包含空格</p>
            )}
          </div>

          {/* 历史标签区域 */}
          {historyTags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center justify-between">
                推荐 / 历史标签
                <span className="text-xs font-normal text-slate-400">点击直接添加</span>
              </h4>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                {historyTags.map(tag => {
                  const isSelected = currentTags.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant="outline"
                      onClick={() => !isSelected && handleAddHistorical(tag)}
                      className={`px-2.5 py-1 text-xs font-normal rounded-md cursor-pointer transition-all ${
                        isSelected 
                          ? 'opacity-50 cursor-not-allowed border-slate-200 text-slate-400' 
                          : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      {!isSelected && <Plus className="w-3 h-3 mr-1 opacity-50" />}
                      {tag}
                    </Badge>
                  );
                })}
                {/* 如果所有历史标签都已添加 */}
                {historyTags.every(tag => currentTags.includes(tag)) && (
                  <span className="text-xs text-slate-400 italic py-1">所有历史标签已添加</span>
                )}
              </div>
            </div>
          )}

        </div>

        {/* 3. 底部操作区：标准的右对齐与高亮的主按钮 */}
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-200">
            取消
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSave}
          >
            保存标签
          </Button>
        </DialogFooter>
        
      </DialogContent>
    </Dialog>
  );
}
