/**
 * 章节撰写器 Prompt 模板
 * 用于生成标书各章节内容
 */

import type { TaskNode, ScoringBinding } from '@/types/task-tree';

/**
 * 章节撰写器主 Prompt
 */
export const SECTION_WRITER_PROMPT = `
【角色设定】
你是一名拥有20年政企金融行业经验的顶级售前架构师和标书编写专家。你的文字严谨、专业、逻辑清晰，深谙评标委员会的打分心理。

【项目背景与全局上下文】
- 项目名称：{project_name}
- 招标单位：{purchase_unit}
- 核心技术要求摘要：{tech_summary}
{context_window}

【当前写作任务】
你当前正在编写标书的第 {chapter_id} 章：【{chapter_name}】
请忽略其他章节，将全部算力集中在当前章节的深度生成上。

【必须响应的评分标准（得分点）】
根据详细评审索引表，本章节必须正面、重点回应以下评审因素，确保不丢分：
{scoring_bindings}

【编写具体要求与约束】
{requirements}

【通用格式要求】
1. 结构要求：
   - 使用 Markdown 格式
   - 多使用结构化的标题（###, ####）
   - 加粗重点词汇
   - 使用项目符号或表格排版，使版面清晰易读

2. 话术要求：
   - 以"我方（投标人）"为第一人称
   - 语气要自信、专业、诚信
   - 承诺绝对满足招标人要求
   - 体现对项目的深刻理解

3. 风险规避：
   - 绝对不能出现以下废标词汇：{disqualification_keywords}
   - 禁止凭空捏造无关的资质证书
   - 所有承诺必须有依据
   - 避免绝对化表述（如"绝对"、"一定"等）

4. 字数控制：
   - 本次生成内容请控制在 {word_limit} 字以内
   - 不要为了凑字数而重复表述
   - 精炼表达，确保每句话都有价值

【请开始撰写当前章节的内容】：
`;

/**
 * 格式化评分绑定
 */
export function formatScoringBindings(bindings: ScoringBinding[]): string {
  if (!bindings || bindings.length === 0) {
    return '（本章节无直接评分项绑定）';
  }

  return bindings.map((b, i) => `
**${i + 1}. ${b.scoring_item_name}**（满分 ${b.max_score} 分）
   - 评分标准：${b.scoring_criteria}
   - 响应策略：${b.response_strategy}
   - 必须响应的关键点：
${b.key_points.length > 0 ? b.key_points.map(p => `     • ${p}`).join('\n') : '     （无特殊关键点）'}
`).join('\n');
}

/**
 * 格式化内容要求
 */
export function formatRequirements(requirements: TaskNode['requirements']): string {
  const parts: string[] = [];

  if (requirements.must_include && requirements.must_include.length > 0) {
    parts.push(`必须包含的内容：
${requirements.must_include.map(item => `  • ${item}`).join('\n')}`);
  }

  if (requirements.format_rules && requirements.format_rules.length > 0) {
    parts.push(`格式要求：
${requirements.format_rules.map(item => `  • ${item}`).join('\n')}`);
  }

  if (requirements.word_limit) {
    parts.push(`字数限制：${requirements.word_limit} 字以内`);
  }

  return parts.join('\n\n') || '（无特殊要求）';
}

/**
 * 构建撰写请求 Prompt
 */
export function buildSectionWriterPrompt(params: {
  projectName: string;
  purchaseUnit: string;
  techSummary: string;
  chapterId: string;
  chapterName: string;
  scoringBindings: ScoringBinding[];
  requirements: TaskNode['requirements'];
  wordLimit: number;
  contextWindow?: string;
  disqualificationKeywords?: string[];
}): string {
  const {
    projectName,
    purchaseUnit,
    techSummary,
    chapterId,
    chapterName,
    scoringBindings,
    requirements,
    wordLimit,
    contextWindow = '',
    disqualificationKeywords = ['废标', '不合格', '虚假', '伪造', '欺骗'],
  } = params;

  return SECTION_WRITER_PROMPT
    .replace('{project_name}', projectName)
    .replace('{purchase_unit}', purchaseUnit)
    .replace('{tech_summary}', techSummary)
    .replace('{context_window}', contextWindow ? `\n【前文大纲参考】\n${contextWindow}` : '')
    .replace('{chapter_id}', chapterId)
    .replace('{chapter_name}', chapterName)
    .replace('{scoring_bindings}', formatScoringBindings(scoringBindings))
    .replace('{requirements}', formatRequirements(requirements))
    .replace('{disqualification_keywords}', disqualificationKeywords.join('、'))
    .replace('{word_limit}', String(wordLimit));
}

/**
 * 数据填空类任务 Prompt
 */
export const DATA_FILLING_PROMPT = `
你是一个专业的标书数据提取专家。请根据招标文档和企业信息，提取并填写以下表单数据。

【表单名称】
{form_name}

【需要提取的字段】
{fields}

【招标文档参考】
{document_reference}

【企业信息参考】
{company_info}

【输出要求】
请以JSON格式输出提取的数据，格式如下：
{
  "fields": {
    "字段名1": "提取的值1",
    "字段名2": "提取的值2"
  },
  "confidence": {
    "字段名1": 0.95,
    "字段名2": 0.8
  },
  "notes": ["特殊情况说明"]
}

仅输出JSON格式结果：
`;

/**
 * 构建数据填空 Prompt
 */
export function buildDataFillingPrompt(params: {
  formName: string;
  fields: string[];
  documentReference: string;
  companyInfo?: string;
}): string {
  return DATA_FILLING_PROMPT
    .replace('{form_name}', params.formName)
    .replace('{fields}', params.fields.map(f => `  - ${f}`).join('\n'))
    .replace('{document_reference}', params.documentReference)
    .replace('{company_info}', params.companyInfo || '（无企业信息参考）');
}

/**
 * 提取大纲摘要（用于上下文传递）
 */
export function extractOutlineSummary(content: string, maxLength: number = 500): string {
  if (!content || content.length <= maxLength) {
    return content || '';
  }

  // 提取标题
  const headings = content.match(/^#{1,3}\s+.+$/gm) || [];
  
  // 提取第一段
  const firstParagraph = content.split('\n\n')[0] || '';
  
  // 组合摘要
  const summary = headings.slice(0, 5).join('\n') + '\n\n' + 
    (firstParagraph.length > 200 ? firstParagraph.substring(0, 200) + '...' : firstParagraph);
  
  return summary.substring(0, maxLength);
}
