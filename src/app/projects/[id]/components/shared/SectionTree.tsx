'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ChevronRight,
  FileText,
  FolderOpen,
  Plus,
  Edit2,
  Trash2,
  Lightbulb,
  Database,
  Search,
  Target,
  CheckCircle,
  Clock,
} from 'lucide-react';
import type { Section } from '../../types';

interface SectionTreeProps {
  sections: Section[];
  selectedId?: string | null;
  onSelect?: (section: Section) => void;
  onEdit?: (section: Section) => void;
  onAddChild?: (parentId: string) => void;
  onDelete?: (sectionId: string) => void;
  onAddTopLevel?: () => void;
  showActions?: boolean;
  compact?: boolean;
}

/**
 * 章节树组件
 * 支持嵌套结构、选中状态、编辑操作
 */
export function SectionTree({
  sections,
  selectedId,
  onSelect,
  onEdit,
  onAddChild,
  onDelete,
  onAddTopLevel,
  showActions = true,
  compact = false,
}: SectionTreeProps) {
  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <SectionTreeNode
          key={section.id}
          section={section}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
          showActions={showActions}
          compact={compact}
        />
      ))}
      
      {onAddTopLevel && (
        <Button
          variant="outline"
          className="w-full border-dashed text-muted-foreground hover:text-primary hover:border-primary/50"
          onClick={onAddTopLevel}
        >
          <Plus className="h-4 w-4 mr-2" />
          添加一级章节
        </Button>
      )}
    </div>
  );
}

// 章节树节点
interface SectionTreeNodeProps {
  section: Section;
  depth: number;
  selectedId?: string | null;
  onSelect?: (section: Section) => void;
  onEdit?: (section: Section) => void;
  onAddChild?: (parentId: string) => void;
  onDelete?: (sectionId: string) => void;
  showActions?: boolean;
  compact?: boolean;
}

function SectionTreeNode({
  section,
  depth,
  selectedId,
  onSelect,
  onEdit,
  onAddChild,
  onDelete,
  showActions,
  compact,
}: SectionTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = section.children && section.children.length > 0;
  const isSelected = selectedId === section.id;
  const indentStyle = depth > 0 ? { marginLeft: `${depth * 20}px` } : {};

  // 判断章节是否已完成
  // 父章节：自己有内容 或 所有子章节都完成
  // 叶子章节：自己有内容
  const isSectionComplete = (sec: Section): boolean => {
    // 自己有内容
    if (sec.content && sec.content.trim().length > 0) {
      return true;
    }
    // 没有内容但有子章节，检查子章节是否都完成
    if (sec.children && sec.children.length > 0) {
      return sec.children.every(child => isSectionComplete(child));
    }
    return false;
  };

  const hasContent = isSectionComplete(section);

  return (
    <div className="space-y-1">
      {/* 章节项 */}
      <div
        className={cn(
          "group p-3 rounded-lg border transition-all cursor-pointer",
          isSelected 
            ? "bg-primary/5 border-primary/30 shadow-sm" 
            : "bg-card hover:bg-muted/50 hover:border-primary/20",
          compact && "p-2"
        )}
        style={indentStyle}
        onClick={() => onSelect?.(section)}
      >
        {/* 标题行 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 展开/折叠按钮 */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="p-0.5 hover:bg-muted rounded flex-shrink-0"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform text-muted-foreground",
                    isExpanded && "rotate-90"
                  )}
                />
              </button>
            ) : (
              <div className="w-5 flex-shrink-0" />
            )}
            
            {/* 图标 */}
            {depth === 0 ? (
              <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            
            {/* 标题 - 标题本身已包含编号（如"一、投标函"、"2.1 系统架构设计"） */}
            <span className={cn(
              "truncate",
              depth === 0 ? "font-semibold" : "font-medium"
            )}>
              {section.title}
            </span>
            
            {/* 状态标签 */}
            {section.isRequired && (
              <Badge variant="outline" className="text-xs text-red-600 border-red-200 flex-shrink-0">
                必须
              </Badge>
            )}
            
            {section.sectionType && (
              <Badge variant="secondary" className="text-xs flex-shrink-0">
                {section.sectionType === 'technical' ? '技术' :
                 section.sectionType === 'business' ? '商务' :
                 section.sectionType === 'price' ? '报价' : '基础'}
              </Badge>
            )}
            
            {/* AI配置指示器 */}
            {section.aiConfig && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" title="已配置生成参数" />
            )}
          </div>
          
          {/* 右侧状态和操作 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 操作按钮 */}
            {showActions && (
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                {onAddChild && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChild(section.id);
                    }}
                    title="添加子章节"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-amber-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(section);
                    }}
                    title="配置生成参数"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 一级章节删除前确认
                      if (depth === 0) {
                        const hasChildrenContent = section.children?.some(c => c.content);
                        if (hasChildrenContent && !confirm('该章节下有已生成内容的子章节，确定要删除吗？')) {
                          return;
                        }
                      }
                      onDelete(section.id);
                    }}
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
            
            {/* 完成状态 */}
            <Badge
              variant={hasContent ? 'default' : 'secondary'}
              className={cn(
                "text-xs",
                hasContent && "bg-green-600 hover:bg-green-700"
              )}
            >
              {hasContent ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  已生成
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3 mr-1" />
                  待生成
                </>
              )}
            </Badge>
          </div>
        </div>

        {/* 编写要点（非紧凑模式） */}
        {!compact && section.contentGuide?.mainPoints && section.contentGuide.mainPoints.length > 0 && (
          <div className="mt-2 pt-2 border-t border-dashed">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <Lightbulb className="h-3 w-3 text-amber-500" />
              编写要点
            </div>
            <ul className="space-y-0.5 ml-4">
              {section.contentGuide.mainPoints.slice(0, 3).map((point, idx) => (
                <li key={idx} className="text-xs text-muted-foreground truncate">
                  • {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 关联评分项数量 */}
        {!compact && section.scoring_item_ids && section.scoring_item_ids.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="h-3 w-3 text-primary" />
            关联 {section.scoring_item_ids.length} 个评分项
          </div>
        )}
      </div>

      {/* 子章节 */}
      {hasChildren && isExpanded && (
        <div className="border-l-2 border-muted ml-4 pl-1">
          {section.children!.map((child) => (
            <SectionTreeNode
              key={child.id}
              section={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
              showActions={showActions}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SectionTree;
