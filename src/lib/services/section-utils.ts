/**
 * 章节工具函数
 * 提供章节查找、编号计算等通用功能
 */

// 从 retrieval 模块重新导出类型，确保类型一致
export type { Section, ContentGuide } from '@/lib/services/retrieval/types';

import type { Section, ContentGuide } from '@/lib/services/retrieval/types';

// 中文数字常量
const CHINESE_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];

/**
 * 计算章节完整编号
 * 一级：中文数字（一、二、三...）
 * 二级：1.1、1.2、2.1、2.2...
 * 三级：1.1.1、1.1.2、2.1.1...
 * 四级：1.1.1.1、1.1.1.2...
 * 五级：1）、2）、3）...
 * 
 * @param level 章节层级
 * @param index 当前层级中的索引（从0开始）
 * @param path 父级路径（order数组）
 * @returns 格式化的编号字符串
 */
export function calculateSectionNumber(level: number, index: number, path: number[]): string {
  const order = index + 1;
  
  switch (level) {
    case 1:
      // 一级：中文数字（一、二、三...）
      return `${CHINESE_NUMBERS[index] || order}、`;
    case 2:
      // 二级：1.1、1.2、2.1、2.2...
      return `${path[0]}.${order}`;
    case 3:
      // 三级：1.1.1、1.1.2、2.1.1...
      return `${path[0]}.${path[1]}.${order}`;
    case 4:
      // 四级：1.1.1.1、1.1.1.2...
      return `${path[0]}.${path[1]}.${path[2]}.${order}`;
    default:
      // 五级及以上：1）、2）、3）...
      return `${order}）`;
  }
}

/**
 * 在章节树中查找指定章节并计算其完整编号
 * 
 * @param sections 章节列表
 * @param sectionId 目标章节ID
 * @returns 找到的章节信息（包含完整编号）或 null
 */
export function findSection(sections: any[], sectionId: string): Section | null {
  function findWithNumber(
    sectionList: any[],
    targetId: string,
    path: number[] = []
  ): { section: any; fullNumber: string } | null {
    for (let i = 0; i < sectionList.length; i++) {
      const section = sectionList[i];
      const currentOrder = i + 1;
      const currentPath = [...path, currentOrder];
      const level = currentPath.length;
      
      const fullNumber = calculateSectionNumber(level, i, path);

      if (section.id === targetId) {
        return { section, fullNumber };
      }

      if (section.children) {
        const found = findWithNumber(section.children, targetId, currentPath);
        if (found) return found;
      }
    }
    return null;
  }

  const result = findWithNumber(sections, sectionId);
  
  if (!result) return null;
  
  const { section, fullNumber } = result;

  // 构建 contentGuide，只有当所有必需字段都存在时才包含
  let contentGuide: ContentGuide | undefined;
  if (section.contentGuide) {
    const cg = section.contentGuide;
    const mainPoints = cg.mainPoints || [];
    const materialSuggestions = cg.materialSuggestions || [];
    const knowledgeBaseQueries = cg.knowledgeBaseQueries || [];
    
    // 只有当所有字段都有值时才设置 contentGuide
    if (mainPoints.length > 0 || materialSuggestions.length > 0 || knowledgeBaseQueries.length > 0) {
      contentGuide = {
        mainPoints,
        materialSuggestions,
        knowledgeBaseQueries,
      };
    }
  }

  return {
    id: section.id,
    title: section.title,
    level: section.level,
    order: section.order,
    fullNumber,
    scoringItemIds: section.scoringItemIds || section.scoring_item_ids,
    contentGuide,
    children: section.children,
  };
}

/**
 * 准备章节生成数据
 * 包括查找章节、获取关联评分项等
 */
export async function prepareSectionData(
  projectId: string,
  sectionId: string,
  outline: any
): Promise<{
  section: Section | null;
  scoringItems: any[];
  error?: string;
}> {
  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient();

  // 查找目标章节
  const section = findSection(outline.sections || [], sectionId);
  if (!section) {
    return { section: null, scoringItems: [], error: '章节不存在' };
  }

  // 获取关联的评分项
  const scoringItems: any[] = [];
  if (section.scoringItemIds && section.scoringItemIds.length > 0) {
    const { data: items } = await client
      .from('scoring_items')
      .select('*')
      .in('id', section.scoringItemIds);
    
    if (items) {
      scoringItems.push(...items);
    }
  }

  return { section, scoringItems };
}
