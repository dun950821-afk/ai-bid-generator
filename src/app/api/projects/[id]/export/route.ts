import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { markdownToDocx } from '@/lib/utils/markdown-to-docx';

interface OutlineSection {
  id: string;
  title: string;
  isRequired?: boolean;
  scoringItemIds?: string[];
  children?: OutlineSection[];
}

interface SectionContent {
  title: string;
  content: string;
  references?: Array<{
    source: string;
    text: string;
  }>;
}

// POST /api/projects/[id]/export - 导出标书
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { format = 'markdown' } = body;

    const client = getSupabaseClient();

    const { data: project, error } = await client
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    const outline = (project.metadata as any)?.outline;

    if (!outline) {
      return NextResponse.json(
        { success: false, error: '请先生成标书大纲' },
        { status: 400 }
      );
    }

    // 从 bid_sections 表获取章节内容
    const { data: bidSections } = await client
      .from('bid_sections')
      .select('id, title, content, metadata')
      .eq('project_id', id);

    // 构建章节内容映射 - 从多个来源合并
    const bidSectionsMap = new Map<string, string>();
    
    // 1. 从 outline.sections 中提取内容（主要来源）
    const extractContentFromOutline = (sections: any[]) => {
      for (const section of sections) {
        if (section.content) {
          bidSectionsMap.set(section.id, section.content);
          bidSectionsMap.set(section.id.toLowerCase(), section.content);
        }
        if (section.children) {
          extractContentFromOutline(section.children);
        }
      }
    };
    extractContentFromOutline(outline.sections || []);
    
    // 2. 从 bid_sections 表补充（如果 outline 中没有）
    (bidSections || []).forEach((section: any) => {
      if (section.content && !bidSectionsMap.has(section.id)) {
        bidSectionsMap.set(section.id, section.content);
        bidSectionsMap.set(section.id.toLowerCase(), section.content);
      }
    });
    
    // 3. 从 legacy sectionContents 补充
    const legacySectionContents = (project.metadata as any)?.sectionContents || {};
    Object.entries(legacySectionContents).forEach(([id, content]) => {
      if (content && !bidSectionsMap.has(id)) {
        const contentStr = typeof content === 'string' ? content : (content as any)?.content;
        if (contentStr) {
          bidSectionsMap.set(id, contentStr);
          bidSectionsMap.set(id.toLowerCase(), contentStr);
        }
      }
    });

    console.log('[Export] 从大纲提取的内容数:', bidSectionsMap.size);
    console.log('[Export] 大纲章节ID:', outline.sections?.map((s: any) => s.id)?.slice(0, 5));

    // 获取评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id);

    const scoringItemsMap = new Map<string, any>(
      (scoringItems || []).map((item: any) => [item.id, item])
    );

    // 生成内容
    let content = '';

    // 辅助函数：尝试多种方式查找章节内容
    const findSectionContent = (sectionId: string): string | null => {
      // 直接匹配
      if (bidSectionsMap.has(sectionId)) {
        return bidSectionsMap.get(sectionId)!;
      }
      // 小写匹配
      const lowerId = sectionId.toLowerCase();
      if (bidSectionsMap.has(lowerId)) {
        return bidSectionsMap.get(lowerId)!;
      }
      // 尝试去掉前缀匹配（如 section-xxx -> xxx）
      const normalizedId = sectionId.replace(/^(section-?|sec-?)/i, '');
      if (bidSectionsMap.has(normalizedId)) {
        return bidSectionsMap.get(normalizedId)!;
      }
      // 尝试添加前缀匹配
      if (bidSectionsMap.has(`section-${normalizedId}`)) {
        return bidSectionsMap.get(`section-${normalizedId}`)!;
      }
      return null;
    };

    console.log('[Export] 大纲章节ID:', outline.sections?.map((s: any) => s.id)?.slice(0, 5));
    console.log('[Export] bid_sections ID:', Array.from(bidSectionsMap.keys()).slice(0, 5));
    console.log('[Export] bid_sections count:', bidSectionsMap.size);

    // Word 格式直接返回 Buffer
    if (format === 'docx') {
      const markdownContent = generateMarkdown(project, outline, findSectionContent, scoringItemsMap);
      const docxBuffer = await markdownToDocx(markdownContent, {
        projectName: project.name,
        projectNumber: project.project_number,
        generatedAt: new Date().toLocaleDateString('zh-CN'),
      });

      // 返回 Buffer 的 base64 编码
      return NextResponse.json({
        success: true,
        data: {
          content: docxBuffer.toString('base64'),
          format: 'docx',
          fileName: `${project.name}-标书.docx`,
          isBase64: true,
        },
      });
    }

    if (format === 'markdown') {
      content = generateMarkdown(project, outline, findSectionContent, scoringItemsMap);
    } else if (format === 'html') {
      content = generateHtml(project, outline, findSectionContent, scoringItemsMap);
    } else if (format === 'docx-outline') {
      content = generateDocxOutline(project, outline, scoringItemsMap);
    }

    return NextResponse.json({
      success: true,
      data: {
        content,
        format,
        fileName: `${project.name}-标书.${format === 'markdown' ? 'md' : format === 'html' ? 'html' : 'txt'}`,
      },
    });
  } catch (error) {
    console.error('导出失败:', error);
    return NextResponse.json(
      { success: false, error: '导出失败' },
      { status: 500 }
    );
  }
}

function generateMarkdown(
  project: any,
  outline: any,
  findSectionContent: (sectionId: string) => string | null,
  scoringItemsMap: Map<string, any>
): string {
  let md = '';

  // 项目信息（不作为标题，封面页已有）
  md += `> 项目编号: ${project.project_number || '无'}\n`;
  md += `> 生成时间: ${new Date().toLocaleString()}\n\n`;
  md += `---\n\n`;

  // 目录 - 使用无序列表格式
  md += `## 目录\n\n`;
  const usedTitles = new Set<string>(); // 用于去重
  const renderToc = (sections: OutlineSection[], level: number = 0) => {
    let toc = '';
    sections.forEach((section) => {
      // 跳过重复的标题
      const titleKey = `${level}-${section.title}`;
      if (usedTitles.has(titleKey)) {
        console.log('[Export] 跳过重复目录项:', section.title);
        return;
      }
      usedTitles.add(titleKey);
      
      const indent = '  '.repeat(level);
      toc += `${indent}- ${section.title}\n`;
      if (section.children && section.children.length > 0) {
        toc += renderToc(section.children, level + 1);
      }
    });
    return toc;
  };
  md += renderToc(outline.sections || []);
  md += '\n---\n\n';

  // 正文内容 - 记录已处理的章节ID，避免重复
  const processedSectionIds = new Set<string>();
  
  const renderSection = (section: OutlineSection, level: number = 0): string => {
    // 检查是否已处理过该章节
    if (processedSectionIds.has(section.id)) {
      console.log('[Export] 跳过重复章节:', section.id, section.title);
      return '';
    }
    processedSectionIds.add(section.id);
    
    let content = '';
    // 标题级别：
    // level=0（顶级章节）→ H1
    // level=1（子章节）→ H2
    // level=2（孙章节）→ H3
    // 以此类推，最大到 H6
    const headingLevel = Math.min(level + 1, 6);
    const heading = '#'.repeat(headingLevel);

    content += `${heading} ${section.title}\n\n`;

    // 添加关联的评分项信息
    if (section.scoringItemIds && section.scoringItemIds.length > 0) {
      content += `<details>\n<summary>关联评分项 (${section.scoringItemIds.length}项)</summary>\n\n`;
      section.scoringItemIds.forEach((id) => {
        const item = scoringItemsMap.get(id);
        if (item) {
          content += `- **${item.item_name}** (${item.max_score}分)\n`;
          if (item.scoring_rules && item.scoring_rules.length > 0) {
            item.scoring_rules.forEach((rule: any) => {
              content += `  - ${rule.rule || rule}\n`;
            });
          }
        }
      });
      content += '\n</details>\n\n';
    }

    // 添加章节内容
    const sectionContentStr = findSectionContent(section.id);
    if (sectionContentStr) {
      content += `${sectionContentStr}\n\n`;
    } else {
      content += `*（内容待生成）*\n\n`;
    }

    // 处理子章节
    if (section.children && section.children.length > 0) {
      section.children.forEach((child) => {
        content += renderSection(child, level + 1);
      });
    }

    return content;
  };

  (outline.sections || []).forEach((section: OutlineSection) => {
    md += renderSection(section);
  });

  return md;
}

function generateHtml(
  project: any,
  outline: any,
  findSectionContent: (sectionId: string) => string | null,
  scoringItemsMap: Map<string, any>
): string {
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name} - 投标文件</title>
  <style>
    body {
      font-family: 'Microsoft YaHei', sans-serif;
      line-height: 1.8;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
    }
    h1 {
      text-align: center;
      border-bottom: 3px solid #333;
      padding-bottom: 20px;
    }
    h2 {
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
      margin-top: 40px;
    }
    .meta {
      text-align: center;
      color: #666;
      margin-bottom: 40px;
    }
  </style>
</head>
<body>
  <h1>${project.name}</h1>
  <div class="meta">
    <p>项目编号: ${project.project_number || '无'}</p>
    <p>生成时间: ${new Date().toLocaleString()}</p>
  </div>
`;

  const renderSection = (section: OutlineSection, level: number = 1): string => {
    const tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
    let content = `<${tag}>${section.title}</${tag}>\n`;

    const sectionContentStr = findSectionContent(section.id);
    if (sectionContentStr) {
      content += `<div>${sectionContentStr}</div>\n`;
    } else {
      content += '<p><em>（内容待生成）</em></p>\n';
    }

    if (section.children && section.children.length > 0) {
      section.children.forEach((child) => {
        content += renderSection(child, level + 1);
      });
    }

    return content;
  };

  (outline.sections || []).forEach((section: OutlineSection) => {
    html += renderSection(section);
  });

  html += `
</body>
</html>`;

  return html;
}

function generateDocxOutline(
  project: any,
  outline: any,
  scoringItemsMap: Map<string, any>
): string {
  let content = `${project.name}\n`;
  content += '='.repeat(50) + '\n\n';
  content += `项目编号: ${project.project_number || '无'}\n`;
  content += `生成时间: ${new Date().toLocaleString()}\n\n`;

  const renderSection = (section: OutlineSection, level: number = 0): string => {
    const indent = '  '.repeat(level);
    let text = `${indent}${section.title}\n`;

    if (section.scoringItemIds && section.scoringItemIds.length > 0) {
      text += `${indent}[关联评分项: ${section.scoringItemIds.length}项]\n`;
    }

    if (section.children && section.children.length > 0) {
      section.children.forEach((child) => {
        text += renderSection(child, level + 1);
      });
    }

    return text;
  };

  (outline.sections || []).forEach((section: OutlineSection) => {
    content += '\n' + renderSection(section);
  });

  return content;
}
