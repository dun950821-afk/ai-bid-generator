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
            size: 56, // 28pt
            bold: true,
            font: 'SimHei',
            color: '1a1a1a',
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 400 },
          },
        },
        // 一级标题
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: 36, // 18pt
            bold: true,
            font: 'SimHei',
            color: '2c3e50',
          },
          paragraph: {
            spacing: { before: 360, after: 200 },
            outlineLevel: 0,
          },
        },
        // 二级标题
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: 30, // 15pt
            bold: true,
            font: 'SimHei',
            color: '34495e',
          },
          paragraph: {
            spacing: { before: 280, after: 160 },
            outlineLevel: 1,
          },
        },
        // 三级标题
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: 26, // 13pt
            bold: true,
            font: 'SimHei',
            color: '445566',
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
            outlineLevel: 2,
          },
        },
        // 四级标题
        {
          id: 'Heading4',
          name: 'Heading 4',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: 24, // 12pt
            bold: true,
            font: 'SimHei',
            color: '556677',
          },
          paragraph: {
            spacing: { before: 200, after: 100 },
            outlineLevel: 3,
          },
        },
        // 正文样式
        {
          id: 'BodyText',
          name: 'Body Text',
          basedOn: 'Normal',
          run: {
            size: 24, // 12pt
            font: 'SimSun',
            color: '333333',
          },
          paragraph: {
            spacing: { line: 360, after: 120 }, // 1.5倍行距
            indent: { firstLine: convertInchesToTwip(0.3) }, // 首行缩进
          },
        },
        // 引用样式
        {
          id: 'Quote',
          name: 'Quote',
          basedOn: 'Normal',
          run: {
            size: 22,
            font: 'SimSun',
            italics: true,
            color: '666666',
          },
          paragraph: {
            indent: { left: convertInchesToTwip(0.5) },
            spacing: { before: 100, after: 100 },
          },
        },
        // 列表项样式
        {
          id: 'ListItem',
          name: 'List Item',
          basedOn: 'Normal',
          run: {
            size: 24,
            font: 'SimSun',
            color: '333333',
          },
          paragraph: {
            spacing: { before: 60, after: 60 },
          },
        },
      ],
    },
    numbering: {
      config: [
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
                  indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
                },
                run: {
                  font: 'SimSun',
                  size: 24,
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
                  indent: { left: convertInchesToTwip(0.75), hanging: convertInchesToTwip(0.25) },
                },
                run: {
                  font: 'SimSun',
                  size: 24,
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
                  indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
                },
                run: {
                  font: 'SimSun',
                  size: 24,
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
                  indent: { left: convertInchesToTwip(0.75), hanging: convertInchesToTwip(0.25) },
                },
                run: {
                  font: 'SimSun',
                  size: 24,
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
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children: createCoverPage(config),
      },
      // 正文内容
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: config.projectName,
                    font: 'SimSun',
                    size: 18,
                    color: '888888',
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
                    text: '第 ',
                    font: 'SimSun',
                    size: 20,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'SimSun',
                    size: 20,
                  }),
                  new TextRun({
                    text: ' 页 / 共 ',
                    font: 'SimSun',
                    size: 20,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: 'SimSun',
                    size: 20,
                  }),
                  new TextRun({
                    text: ' 页',
                    font: 'SimSun',
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        },
        children: convertTokensToDocx(tokens),
      },
    ],
  });

  // 生成 Buffer
  return await Packer.toBuffer(doc);
}

/**
 * 创建封面页
 */
function createCoverPage(config: BidDocumentConfig): Paragraph[] {
  const elements: Paragraph[] = [];

  // 顶部空白
  elements.push(new Paragraph({ spacing: { before: 1200 } }));

  // 文档类型
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '投标文件',
          font: 'SimHei',
          size: 72, // 36pt
          bold: true,
          color: '1a1a1a',
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // 项目名称
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: config.projectName,
          font: 'SimHei',
          size: 48, // 24pt
          bold: true,
          color: '2c3e50',
        }),
      ],
      spacing: { before: 400, after: 200 },
    })
  );

  // 项目编号
  if (config.projectNumber) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `项目编号：${config.projectNumber}`,
            font: 'SimSun',
            size: 28,
            color: '555555',
          }),
        ],
        spacing: { after: 600 },
      })
    );
  }

  // 分隔线
  elements.push(new Paragraph({ spacing: { before: 400 } }));

  // 投标单位
  if (config.companyName) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: '投标单位',
            font: 'SimSun',
            size: 24,
            color: '666666',
          }),
        ],
        spacing: { before: 400 },
      })
    );
    elements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: config.companyName,
            font: 'SimHei',
            size: 36,
            bold: true,
            color: '333333',
          }),
        ],
        spacing: { after: 400 },
      })
    );
  }

  // 生成日期
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
      children: [
        new TextRun({
          text: `生成日期：${config.generatedAt}`,
          font: 'SimSun',
          size: 24,
          color: '666666',
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
function convertTokensToDocx(tokens: Token[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const token of tokens) {
    const converted = convertToken(token);
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
function convertToken(token: Token): Paragraph | Paragraph[] | null {
  switch (token.type) {
    case 'heading':
      return convertHeading(token as Tokens.Heading);
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
        return convertTokensToDocx(token.tokens);
      }
      return null;
  }
}

/**
 * 转换标题
 */
function convertHeading(token: Tokens.Heading): Paragraph {
  const headingLevels: Record<number, string> = {
    1: 'Heading1',
    2: 'Heading2',
    3: 'Heading3',
    4: 'Heading4',
    5: 'Heading4',
    6: 'Heading4',
  };

  const styleId = headingLevels[token.depth] || 'Heading4';

  return new Paragraph({
    style: styleId,
    children: parseInlineTokens(token.tokens || []),
  });
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
 */
function convertList(token: Tokens.List): Paragraph[] {
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
          level: 0,
        },
        children: children.length > 0 ? children : [new TextRun({ text: '' })],
      })
    );

    // 处理嵌套列表
    const nestedList = item.tokens?.find(t => t.type === 'list') as Tokens.List | undefined;
    if (nestedList) {
      const nestedParagraphs = convertList(nestedList);
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
