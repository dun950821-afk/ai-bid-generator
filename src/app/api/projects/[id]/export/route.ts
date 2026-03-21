import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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

    // 构建章节内容映射
    const sectionContents: Record<string, string> = {};
    (bidSections || []).forEach((section: any) => {
      if (section.content) {
        sectionContents[section.id] = section.content;
      }
    });

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

    if (format === 'markdown') {
      content = generateMarkdown(project, outline, sectionContents, scoringItemsMap);
    } else if (format === 'html') {
      content = generateHtml(project, outline, sectionContents, scoringItemsMap);
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

/**
 * 从 sectionContents 中获取章节内容
 * 兼容两种存储格式：
 * 1. 字符串：sectionContents[sectionId] = "内容"
 * 2. 对象：sectionContents[sectionId] = { title, content, references }
 */
function getSectionContent(
  sectionContents: Record<string, any>,
  sectionId: string
): string | null {
  const data = sectionContents[sectionId];
  if (!data) return null;
  
  // 如果是字符串，直接返回
  if (typeof data === 'string') {
    return data;
  }
  
  // 如果是对象，返回 content 字段
  if (typeof data === 'object' && data.content) {
    return data.content;
  }
  
  return null;
}

function generateMarkdown(
  project: any,
  outline: any,
  sectionContents: Record<string, any>,
  scoringItemsMap: Map<string, any>
): string {
  let md = '';

  // 标题
  md += `# ${project.name}\n\n`;
  md += `> 项目编号: ${project.project_number || '无'}\n`;
  md += `> 生成时间: ${new Date().toLocaleString()}\n\n`;
  md += `---\n\n`;

  // 目录
  md += `## 目录\n\n`;
  const renderToc = (sections: OutlineSection[], level: number = 0) => {
    let toc = '';
    sections.forEach((section) => {
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

  // 正文内容
  const renderSection = (section: OutlineSection, level: number = 1): string => {
    let content = '';
    const heading = '#'.repeat(Math.min(level + 1, 6));

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
    const sectionContentStr = getSectionContent(sectionContents, section.id);
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
  sectionContents: Record<string, any>,
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

    const sectionContentStr = getSectionContent(sectionContents, section.id);
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
