import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    const outline = (project.metadata as any)?.outline;
    const sectionContents = (project.metadata as any)?.sectionContents || {};

    if (!outline) {
      return NextResponse.json(
        { success: false, error: '请先生成标书大纲' },
        { status: 400 }
      );
    }

    // 获取评分项
    const scoringItems = await prisma.scoringItem.findMany({
      where: { project_id: id },
    });

    const scoringItemsMap = new Map<string, any>(
      scoringItems.map((item: any) => [item.id, item])
    );

    // 生成内容
    let content = '';

    if (format === 'markdown') {
      content = generateMarkdown(project, outline, sectionContents, scoringItemsMap);
    } else if (format === 'html') {
      content = generateHtml(project, outline, sectionContents, scoringItemsMap);
    } else if (format === 'docx-outline') {
      // 返回Word大纲格式
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
  sectionContents: Record<string, SectionContent>,
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
    const sectionContent = sectionContents[section.id];
    if (sectionContent) {
      content += `${sectionContent.content}\n\n`;

      // 添加引用来源
      if (sectionContent.references && sectionContent.references.length > 0) {
        content += `<details>\n<summary>引用来源</summary>\n\n`;
        sectionContent.references.forEach((ref) => {
          content += `> **${ref.source}**\n> ${ref.text}\n\n`;
        });
        content += '</details>\n\n';
      }
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
  sectionContents: Record<string, SectionContent>,
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
    .scoring-items {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      margin: 10px 0;
      font-size: 14px;
    }
    .references {
      background: #fffef0;
      padding: 15px;
      border-left: 3px solid #ffc107;
      margin: 10px 0;
      font-size: 14px;
    }
    .page-break {
      page-break-after: always;
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

    // 评分项
    if (section.scoringItemIds && section.scoringItemIds.length > 0) {
      content += '<div class="scoring-items">\n';
      content += `<strong>关联评分项 (${section.scoringItemIds.length}项):</strong><br>\n`;
      section.scoringItemIds.forEach((id) => {
        const item = scoringItemsMap.get(id);
        if (item) {
          content += `- ${item.item_name} (${item.max_score}分)<br>\n`;
        }
      });
      content += '</div>\n';
    }

    // 章节内容
    const sectionContent = sectionContents[section.id];
    if (sectionContent) {
      content += `<div>${sectionContent.content}</div>\n`;

      if (sectionContent.references && sectionContent.references.length > 0) {
        content += '<div class="references">\n';
        content += '<strong>引用来源:</strong><br>\n';
        sectionContent.references.forEach((ref) => {
          content += `${ref.source}: ${ref.text}<br>\n`;
        });
        content += '</div>\n';
      }
    } else {
      content += '<p><em>（内容待生成）</em></p>\n';
    }

    // 子章节
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
