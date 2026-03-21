import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
  LevelFormat,
  StyleLevel,
  ExternalHyperlink,
  ImageRun,
} from 'docx';
import { marked, Token, Tokens } from 'marked';

// =====================================================
// 投标文件模板样式配置
// 基于专业投标文件模板分析优化
// =====================================================

// A4 纸张尺寸 (单位: twips, 1 inch = 1440 twips = 25.4mm)
const A4_WIDTH = 11905;   // 210mm
const A4_HEIGHT = 16838;  // 297mm

// 页边距配置 (单位: twips, 1mm ≈ 56.69 twips)
const PAGE_MARGIN = {
  top: 1417,    // 25mm
  right: 1134,  // 20mm
  bottom: 1134, // 20mm
  left: 1134,   // 20mm
  header: 850,  // 15mm (页眉距边界)
  footer: 992,  // 17.5mm (页脚距边界)
};

// 字号配置 (单位: half-points, 1pt = 2 half-points)
const FONT_SIZE = {
  title: 72,      // 36pt - 封面标题
  projectName: 48, // 24pt - 项目名称
  heading1: 28,    // 14pt - 一级标题
  heading2: 24,    // 12pt - 二级标题
  heading3: 24,    // 12pt - 三级标题
  heading4: 21,    // 10.5pt - 四级标题
  body: 21,        // 10.5pt - 正文
  header: 21,      // 10.5pt - 页眉
  footer: 21,      // 10.5pt - 页脚
};

// 行距配置 (单位: twips, 240 = 单倍行距)
const LINE_SPACING = {
  heading1: 576,  // 2.4倍
  heading2: 360,  // 1.5倍
  body: 360,      // 1.5倍
  single: 240,    // 单倍
};

// 段前段后间距 (单位: twips)
const SPACING = {
  heading1: { before: 340, after: 330 },  // 约6mm
  heading2: { before: 200, after: 160 },
  heading3: { before: 160, after: 120 },
  body: { after: 120 },
};

// 首行缩进 (2字符，约10.5pt * 2 = 21 half-points = 420 twips)
const FIRST_LINE_INDENT = 420;

// 标书文档配置
interface BidDocumentConfig {
  projectName: string;
  projectNumber?: string;
  companyName?: string;
  generatedAt: string;
}

/**
 * 将 Markdown 转换为 Word 文档
 */
export async function markdownToDocx(
  markdown: string,
  config: BidDocumentConfig
): Promise<Buffer> {
  // 解析 Markdown
  const tokens = marked.lexer(markdown);

  // 提取标题用于生成目录
  const headings = extractHeadings(tokens);

  // 创建文档
  const doc = new Document({
    styles: {
      paragraphStyles: [
        // 标题样式
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            size: FONT_SIZE.title,
            bold: true,
            font: 'SimHei',
            color: '1a1a1a',
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 400 },
          },
        },
        // 一级标题 - 黑体（中文）+ Times New Roman（英文）、14pt、居中、加粗
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: FONT_SIZE.heading1,
            bold: true,
            font: {
              ascii: 'Times New Roman',
              hAnsi: 'Times New Roman',
              eastAsia: 'SimHei', // 中文黑体
            },
            color: '000000',
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: {
              before: SPACING.heading1.before,
              after: SPACING.heading1.after,
              line: LINE_SPACING.heading1,
              lineRule: 'auto',
            },
            outlineLevel: 0,
            keepNext: true,
            keepLines: true,
          },
        },
        // 二级标题 - 仿宋（中文）+ 宋体（英文）、12pt、加粗、左对齐
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: FONT_SIZE.heading2,
            bold: true,
            font: {
              ascii: 'SimSun',
              hAnsi: 'SimSun',
              eastAsia: 'FangSong', // 中文仿宋
            },
            color: '000000',
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: {
              line: LINE_SPACING.heading2,
              lineRule: 'auto',
            },
            outlineLevel: 1,
            keepNext: true,
            keepLines: true,
          },
        },
        // 三级标题 - 宋体、12pt、加粗
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: FONT_SIZE.heading3,
            bold: true,
            font: {
              ascii: 'SimSun',
              hAnsi: 'SimSun',
              eastAsia: 'SimSun',
            },
            color: '000000',
          },
          paragraph: {
            spacing: {
              before: SPACING.heading3.before,
              after: SPACING.heading3.after,
              line: LINE_SPACING.body,
              lineRule: 'auto',
            },
            outlineLevel: 2,
          },
        },
        // 四级标题 - 宋体、10.5pt
        {
          id: 'Heading4',
          name: 'Heading 4',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: FONT_SIZE.heading4,
            bold: true,
            font: {
              ascii: 'SimSun',
              hAnsi: 'SimSun',
              eastAsia: 'SimSun',
            },
            color: '333333',
          },
          paragraph: {
            spacing: {
              before: 160,
              after: 100,
              line: LINE_SPACING.body,
              lineRule: 'auto',
            },
            outlineLevel: 3,
          },
        },
        // 正文样式 - 宋体、10.5pt、1.5倍行距、首行缩进
        {
          id: 'BodyText',
          name: 'Body Text',
          basedOn: 'Normal',
          run: {
            size: FONT_SIZE.body,
            font: {
              ascii: 'SimSun',
              hAnsi: 'SimSun',
              eastAsia: 'SimSun',
            },
            color: '000000',
          },
          paragraph: {
            spacing: {
              line: LINE_SPACING.body,
              lineRule: 'auto',
              after: SPACING.body.after,
            },
            indent: { firstLine: FIRST_LINE_INDENT },
          },
        },
        // 引用样式
        {
          id: 'Quote',
          name: 'Quote',
          basedOn: 'Normal',
          run: {
            size: FONT_SIZE.body,
            font: {
              ascii: 'SimSun',
              hAnsi: 'SimSun',
              eastAsia: 'SimSun',
            },
            italics: true,
            color: '666666',
          },
          paragraph: {
            indent: { left: 420 },
            spacing: { before: 100, after: 100, line: LINE_SPACING.body },
          },
        },
        // 列表项样式
        {
          id: 'ListItem',
          name: 'List Item',
          basedOn: 'Normal',
          run: {
            size: FONT_SIZE.body,
            font: {
              ascii: 'SimSun',
              hAnsi: 'SimSun',
              eastAsia: 'SimSun',
            },
            color: '000000',
          },
          paragraph: {
            spacing: { before: 60, after: 60, line: LINE_SPACING.body },
          },
        },
      ],
    },
    numbering: {
      config: [
        // 标题编号配置 - 中文数字一级 + 阿拉伯数字二级
        {
          reference: 'heading-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.CHINESE_COUNTING_THOUSAND,
              text: '%1、',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 0, hanging: 0 },
                },
                run: {
                  font: 'SimHei',
                  size: FONT_SIZE.heading1,
                  bold: true,
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: '%1.%2',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 0, hanging: 0 },
                },
                run: {
                  font: 'SimSun',
                  size: FONT_SIZE.heading2,
                  bold: true,
                },
              },
            },
          ],
        },
        // 有序列表配置
        {
          reference: 'main-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 420, hanging: 420 },
                },
                run: {
                  font: 'SimSun',
                  size: FONT_SIZE.body,
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: '%2.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 840, hanging: 420 },
                },
                run: {
                  font: 'SimSun',
                  size: FONT_SIZE.body,
                },
              },
            },
          ],
        },
        {
          reference: 'bullet-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '●',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 420, hanging: 420 },
                },
                run: {
                  font: 'SimSun',
                  size: FONT_SIZE.body,
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: '○',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 840, hanging: 420 },
                },
                run: {
                  font: 'SimSun',
                  size: FONT_SIZE.body,
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      // 封面页
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH,
              height: A4_HEIGHT,
            },
            margin: {
              top: PAGE_MARGIN.top,
              right: PAGE_MARGIN.right,
              bottom: PAGE_MARGIN.bottom,
              left: PAGE_MARGIN.left,
            },
          },
        },
        children: createCoverPage(config),
      },
      // 目录页
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH,
              height: A4_HEIGHT,
            },
            margin: {
              top: PAGE_MARGIN.top,
              right: PAGE_MARGIN.right,
              bottom: PAGE_MARGIN.bottom,
              left: PAGE_MARGIN.left,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  bottom: {
                    color: '000000',
                    size: 4,
                    style: BorderStyle.SINGLE,
                    space: 1,
                  },
                },
                children: [
                  new TextRun({
                    text: '招标文件',
                    font: 'FangSong',
                    size: FONT_SIZE.header,
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'SimSun',
                    size: FONT_SIZE.footer,
                  }),
                ],
              }),
            ],
          }),
        },
        children: createTableOfContents(headings),
      },
      // 正文内容
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH,
              height: A4_HEIGHT,
            },
            margin: {
              top: PAGE_MARGIN.top,
              right: PAGE_MARGIN.right,
              bottom: PAGE_MARGIN.bottom,
              left: PAGE_MARGIN.left,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  bottom: {
                    color: '000000',
                    size: 4,
                    style: BorderStyle.SINGLE,
                    space: 1,
                  },
                },
                children: [
                  new TextRun({
                    text: '招标文件',
                    font: 'FangSong', // 仿宋
                    size: FONT_SIZE.header,
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'SimSun',
                    size: FONT_SIZE.footer,
                  }),
                ],
              }),
            ],
          }),
        },
        children: convertTokensToDocx(tokens, { chapter1: 0, chapter2: 0 }),
      },
    ],
  });

  // 生成 Buffer
  return await Packer.toBuffer(doc);
}

/**
 * 从 Markdown tokens 中提取标题（带编号）
 */
function extractHeadings(tokens: Token[]): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const context: HeadingContext = { chapter1: 0, chapter2: 0 };

  for (const token of tokens) {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      // 只提取一级和二级标题用于目录
      if (heading.depth <= 2) {
        const text = heading.tokens
          ? heading.tokens.map(t => ('text' in t ? t.text : '')).join('')
          : heading.text || '';
        
        // 获取编号前缀
        const numberedText = getNumberedHeadingText(heading, context);
        
        headings.push({
          level: heading.depth,
          text: numberedText.prefix + text.trim(),
        });
      } else {
        // 三级及以下标题也需要更新 context
        getNumberedHeadingText(heading, context);
      }
    }
    // 递归处理嵌套的 tokens
    if ('tokens' in token && Array.isArray(token.tokens)) {
      const nestedHeadings = extractHeadingsFromTokens(token.tokens, context);
      headings.push(...nestedHeadings);
    }
  }

  return headings;
}

/**
 * 从嵌套 tokens 中提取标题（递归辅助函数）
 */
function extractHeadingsFromTokens(tokens: Token[], context: HeadingContext): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];

  for (const token of tokens) {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      if (heading.depth <= 2) {
        const text = heading.tokens
          ? heading.tokens.map(t => ('text' in t ? t.text : '')).join('')
          : heading.text || '';
        
        const numberedText = getNumberedHeadingText(heading, context);
        
        headings.push({
          level: heading.depth,
          text: numberedText.prefix + text.trim(),
        });
      } else {
        getNumberedHeadingText(heading, context);
      }
    }
    if ('tokens' in token && Array.isArray(token.tokens)) {
      headings.push(...extractHeadingsFromTokens(token.tokens, context));
    }
  }

  return headings;
}

/**
 * 创建目录页
 */
function createTableOfContents(headings: Array<{ level: number; text: string }>): Paragraph[] {
  const elements: Paragraph[] = [];

  // 目录标题
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '目  录',
          font: 'SimHei',
          size: 32, // 16pt
          bold: true,
          color: '000000',
        }),
      ],
      spacing: { before: 200, after: 400 },
    })
  );

  // 目录项
  for (const heading of headings) {
    const isLevel1 = heading.level === 1;
    
    elements.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: {
          // 一级标题无缩进，二级标题缩进2字符
          left: isLevel1 ? 0 : 420,
        },
        spacing: { before: 100, after: 100, line: 360 },
        children: [
          new TextRun({
            text: heading.text,
            font: isLevel1 ? 'SimHei' : 'SimSun',
            size: isLevel1 ? 24 : 21, // 一级12pt，二级10.5pt
            bold: isLevel1,
            color: '000000',
          }),
        ],
      })
    );
  }

  // 分页符
  elements.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  return elements;
}

/**
 * 创建封面页
 * 按照专业投标文件模板格式设计
 */
function createCoverPage(config: BidDocumentConfig): Paragraph[] {
  const elements: Paragraph[] = [];

  // 顶部空白（约1/4页面高度）
  elements.push(new Paragraph({ spacing: { before: 2400 } }));

  // 正本/副本标识
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '正本',
          font: 'SimHei',
          size: 44, // 22pt
          bold: true,
          color: '000000',
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // 项目名称（居中显示）
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: config.projectName,
          font: 'SimHei',
          size: FONT_SIZE.projectName,
          bold: true,
          color: '000000',
        }),
      ],
      spacing: { before: 400, after: 200 },
    })
  );

  // 招标代理编号
  if (config.projectNumber) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `招标代理编号：${config.projectNumber}`,
            font: 'SimSun',
            size: 24,
            color: '000000',
          }),
        ],
        spacing: { before: 200, after: 600 },
      })
    );
  }

  // 投标文件大标题
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '投标文件',
          font: 'SimHei',
          size: FONT_SIZE.title,
          bold: true,
          color: '000000',
        }),
      ],
      spacing: { before: 600, after: 600 },
    })
  );

  // 投标单位信息框
  elements.push(new Paragraph({ spacing: { before: 400 } }));
  
  // 投标人名称
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '投标人名称：',
          font: 'SimSun',
          size: FONT_SIZE.body,
          color: '000000',
        }),
        new TextRun({
          text: '        （盖章）        ',
          font: 'SimSun',
          size: FONT_SIZE.body,
          color: '000000',
        }),
      ],
      spacing: { before: 200 },
    })
  );

  // 法定代表人
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '法定代表人或其委托的代理人：（签字或盖章）',
          font: 'SimSun',
          size: FONT_SIZE.body,
          color: '000000',
        }),
      ],
      spacing: { before: 200 },
    })
  );

  // 投标人地址
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '投标人地址：            ',
          font: 'SimSun',
          size: FONT_SIZE.body,
          color: '000000',
        }),
      ],
      spacing: { before: 200 },
    })
  );

  // 日期
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: '      年      月      日',
          font: 'SimSun',
          size: FONT_SIZE.body,
          color: '000000',
        }),
      ],
    })
  );

  // 分页符
  elements.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  return elements;
}

/**
 * 将 Markdown tokens 转换为 docx 段落
 */
function convertTokensToDocx(tokens: Token[], context: HeadingContext): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const token of tokens) {
    const converted = convertToken(token, context);
    if (converted) {
      if (Array.isArray(converted)) {
        paragraphs.push(...converted);
      } else {
        paragraphs.push(converted);
      }
    }
  }

  return paragraphs;
}

/**
 * 转换单个 token
 */
function convertToken(token: Token, context: HeadingContext): Paragraph | Paragraph[] | null {
  switch (token.type) {
    case 'heading':
      return convertHeading(token as Tokens.Heading, context);
    case 'paragraph':
      return convertParagraph(token as Tokens.Paragraph);
    case 'list':
      return convertList(token as Tokens.List);
    case 'blockquote':
      return convertBlockquote(token as Tokens.Blockquote);
    case 'code':
      return convertCode(token as Tokens.Code);
    case 'table':
      return convertTable(token as Tokens.Table);
    case 'hr':
      return new Paragraph({
        spacing: { before: 200, after: 200 },
        border: {
          bottom: {
            color: 'cccccc',
            size: 6,
            style: BorderStyle.SINGLE,
          },
        },
      });
    case 'space':
      return new Paragraph({ spacing: { before: 100, after: 100 } });
    default:
      // 递归处理包含 tokens 的类型
      if ('tokens' in token && Array.isArray(token.tokens)) {
        return convertTokensToDocx(token.tokens, context);
      }
      return null;
  }
}

/**
 * 转换标题
 * 一级标题格式：一、标题
 * 二级标题格式：1.1 标题
 */
function convertHeading(token: Tokens.Heading, context: HeadingContext): Paragraph {
  const headingLevels: Record<number, string> = {
    1: 'Heading1',
    2: 'Heading2',
    3: 'Heading3',
    4: 'Heading4',
    5: 'Heading4',
    6: 'Heading4',
  };

  const styleId = headingLevels[token.depth] || 'Heading4';
  const inlineContent = parseInlineTokens(token.tokens || []);
  
  // 获取带编号的标题文本
  const numberedText = getNumberedHeadingText(token, context);
  
  // 构建段落内容：编号 + 原标题
  const children: (TextRun | ExternalHyperlink)[] = [
    new TextRun({
      text: numberedText.prefix,
      font: styleId === 'Heading1' ? 'SimHei' : 'SimSun',
      size: token.depth === 1 ? FONT_SIZE.heading1 : 
            token.depth === 2 ? FONT_SIZE.heading2 : 
            token.depth === 3 ? FONT_SIZE.heading3 : FONT_SIZE.heading4,
      bold: true,
    }),
    ...inlineContent,
  ];

  return new Paragraph({
    style: styleId,
    children: children,
  });
}

/**
 * 标题上下文，用于跟踪章节编号
 */
interface HeadingContext {
  chapter1: number;  // 一级标题计数
  chapter2: number;  // 二级标题计数（在当前一级标题下）
}

/**
 * 中文数字映射
 */
const CHINESE_NUMBERS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', 
                          '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

/**
 * 获取带编号的标题前缀
 */
function getNumberedHeadingText(token: Tokens.Heading, context: HeadingContext): { prefix: string } {
  const depth = token.depth;
  
  if (depth === 1) {
    // 一级标题：一、二、三...
    context.chapter1++;
    context.chapter2 = 0;  // 重置二级计数
    const chineseNum = context.chapter1 <= 20 ? CHINESE_NUMBERS[context.chapter1] : context.chapter1.toString();
    return { prefix: `${chineseNum}、` };
  } else if (depth === 2) {
    // 二级标题：1.1、1.2、2.1...
    context.chapter2++;
    return { prefix: `${context.chapter1}.${context.chapter2} ` };
  }
  
  // 三级及以下标题不添加编号
  return { prefix: '' };
}

/**
 * 转换段落
 */
function convertParagraph(token: Tokens.Paragraph): Paragraph {
  return new Paragraph({
    style: 'BodyText',
    children: parseInlineTokens(token.tokens || []),
  });
}

/**
 * 转换列表
 * @param token 列表 token
 * @param level 当前层级（用于嵌套列表）
 */
function convertList(token: Tokens.List, level: number = 0): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const isOrdered = token.ordered;
  const listRef = isOrdered ? 'main-list' : 'bullet-list';

  let itemIndex = token.start || 1;

  for (const item of token.items) {
    const children = parseInlineTokens(item.tokens?.filter(t => t.type !== 'list') || []);
    
    paragraphs.push(
      new Paragraph({
        numbering: {
          reference: listRef,
          level: Math.min(level, 1), // 最多支持2级缩进
        },
        children: children.length > 0 ? children : [new TextRun({ text: '' })],
      })
    );

    // 处理嵌套列表 - 递归时增加层级
    const nestedList = item.tokens?.find(t => t.type === 'list') as Tokens.List | undefined;
    if (nestedList) {
      const nestedParagraphs = convertList(nestedList, level + 1);
      for (const np of nestedParagraphs) {
        paragraphs.push(np);
      }
    }

    itemIndex++;
  }

  return paragraphs;
}

/**
 * 转换引用块
 */
function convertBlockquote(token: Tokens.Blockquote): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const child of token.tokens || []) {
    if (child.type === 'paragraph') {
      const runs = parseInlineTokens((child as Tokens.Paragraph).tokens || []);
      paragraphs.push(
        new Paragraph({
          style: 'Quote',
          border: {
            left: {
              color: 'cccccc',
              size: 12,
              style: BorderStyle.SINGLE,
            },
          },
          children: runs,
        })
      );
    }
  }

  return paragraphs;
}

/**
 * 转换代码块
 */
function convertCode(token: Tokens.Code): Paragraph {
  const lines = token.text.split('\n');
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        shading: {
          fill: 'f5f5f5',
        },
        children: [
          new TextRun({
            text: line || ' ',
            font: 'Consolas',
            size: 20,
            color: '333333',
          }),
        ],
        spacing: { before: 40, after: 40 },
        indent: { left: convertInchesToTwip(0.25) },
      })
    );
  }

  // 返回第一个段落，其余添加到返回值
  return paragraphs[0] || new Paragraph({ children: [] });
}

/**
 * 转换表格
 */
function convertTable(token: Tokens.Table): Paragraph[] {
  const rows: TableRow[] = [];

  // 表头
  if (token.header) {
    const headerCells = token.header.map((cell) =>
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: parseInlineTokens(cell.tokens || []),
          }),
        ],
        shading: {
          fill: 'e8e8e8',
        },
        width: { size: 100 / token.header.length, type: WidthType.PERCENTAGE },
      })
    );
    rows.push(new TableRow({ children: headerCells, tableHeader: true }));
  }

  // 表格行
  for (const row of token.rows) {
    const cells = row.map((cell) =>
      new TableCell({
        children: [
          new Paragraph({
            children: parseInlineTokens(cell.tokens || []),
          }),
        ],
        width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
      })
    );
    rows.push(new TableRow({ children: cells }));
  }

  const table = new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
    },
  });

  // 返回包含表格的段落
  return [
    new Paragraph({
      children: [table],
      spacing: { before: 200, after: 200 },
    }),
  ];
}

/**
 * 解析行内 tokens
 */
function parseInlineTokens(
  tokens: Token[],
  context: InlineStyleContext = {}
): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];

  for (const token of tokens) {
    const result = parseInlineToken(token, context);
    if (result) {
      runs.push(...result);
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: '' })];
}

/**
 * 行内样式上下文
 */
interface InlineStyleContext {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
}

/**
 * 解析单个行内 token
 */
function parseInlineToken(
  token: Token,
  context: InlineStyleContext = {}
): (TextRun | ExternalHyperlink)[] {
  switch (token.type) {
    case 'text':
      return [new TextRun({
        text: (token as Tokens.Text).text,
        font: 'SimSun',
        size: 24,
        bold: context.bold,
        italics: context.italics,
        strike: context.strike,
      })];
    case 'strong':
      return parseInlineTokens(
        (token as Tokens.Strong).tokens || [],
        { ...context, bold: true }
      );
    case 'em':
      return parseInlineTokens(
        (token as Tokens.Em).tokens || [],
        { ...context, italics: true }
      );
    case 'codespan':
      return [new TextRun({
        text: (token as Tokens.Codespan).text,
        font: 'Consolas',
        size: 22,
        shading: { fill: 'f0f0f0' },
      })];
    case 'link':
      const linkToken = token as Tokens.Link;
      return [new ExternalHyperlink({
        children: parseInlineTokens(linkToken.tokens || [], context),
        link: linkToken.href,
      })];
    case 'br':
      return [new TextRun({ text: '', break: 1 })];
    case 'del':
      return parseInlineTokens(
        (token as Tokens.Del).tokens || [],
        { ...context, strike: true }
      );
    default:
      // 处理包含子 tokens 的类型
      if ('tokens' in token && Array.isArray(token.tokens)) {
        return parseInlineTokens(token.tokens, context);
      }
      if ('text' in token) {
        return [new TextRun({
          text: String((token as any).text),
          font: 'SimSun',
          size: 24,
          bold: context.bold,
          italics: context.italics,
          strike: context.strike,
        })];
      }
      return [];
  }
}
