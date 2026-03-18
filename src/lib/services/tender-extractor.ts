/**
 * 招标文档LLM提取服务
 * 严格按照 AI-Bid-TENDER-EXTRACTION-SCHEMA.md 规范实现
 * 支持流式提取和完整提取
 */

import {
  TenderDocumentExtractionResult,
  createEmptyExtractionResult,
  ScoringItem,
  TechDemandItem,
  TechnicalParameter,
} from '@/types/tender-extraction';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface ExtractionOptions {
  useStreaming?: boolean;       // 是否使用流式提取
  model?: string;               // LLM模型
  temperature?: number;         // 温度参数
}

const DEFAULT_OPTIONS: ExtractionOptions = {
  useStreaming: false,
  model: 'qwen3-max',
  temperature: 0.1,
};

/**
 * 招标文档提取器
 */
export class TenderDocumentExtractor {
  private apiUrl: string;
  private apiKey: string;
  private model: string;
  private temperature: number;

  constructor(options: Partial<ExtractionOptions> = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.model = opts.model || 'qwen3-max';
    this.temperature = opts.temperature || 0.1;
    
    // 从环境变量或数据库获取配置
    this.apiUrl = process.env.LLM_API_URL || '';
    this.apiKey = process.env.LLM_API_KEY || '';
  }

  /**
   * 初始化配置（从数据库获取）
   */
  async initialize(): Promise<void> {
    try {
      const client = getSupabaseClient();
      const { data: settings } = await client
        .from('system_settings')
        .select('key, value')
        .in('key', ['llm_api_url', 'llm_api_key', 'llm_model']);

      const configMap = new Map(settings?.map(s => [s.key, s.value]));
      
      if (configMap.get('llm_api_url')) {
        this.apiUrl = configMap.get('llm_api_url')!;
      }
      if (configMap.get('llm_api_key')) {
        this.apiKey = configMap.get('llm_api_key')!;
      }
      if (configMap.get('llm_model')) {
        this.model = configMap.get('llm_model')!;
      }
    } catch (error) {
      console.error('加载LLM配置失败:', error);
      // 尝试从环境变量获取
      if (process.env.LLM_API_URL) {
        this.apiUrl = process.env.LLM_API_URL;
      }
      if (process.env.LLM_API_KEY) {
        this.apiKey = process.env.LLM_API_KEY;
      }
    }
  }

  /**
   * 完整提取招标文档信息
   */
  async extract(
    documentText: string,
    documentName: string,
    documentPages: number = 0
  ): Promise<TenderDocumentExtractionResult> {
    if (!this.apiUrl || !this.apiKey) {
      await this.initialize();
    }

    if (!this.apiUrl || !this.apiKey) {
      throw new Error('请先配置LLM设置');
    }

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(documentText);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: this.temperature,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API错误: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('LLM返回内容为空');
      }

      // 解析JSON结果
      const result = this.parseExtractionResult(content, documentName, documentPages);
      
      return result;
    } catch (error) {
      console.error('招标文档提取失败:', error);
      throw error;
    }
  }

  /**
   * 流式提取招标文档信息
   */
  async *extractStreaming(
    documentText: string,
    documentName: string,
    documentPages: number = 0
  ): AsyncGenerator<{ type: string; data: any; done: boolean }> {
    if (!this.apiUrl || !this.apiKey) {
      await this.initialize();
    }

    // 1. 先提取基本信息
    yield { type: 'status', data: '正在提取项目基本信息...', done: false };
    const basicInfo = await this.extractSection(documentText, 'project_basic_info');
    yield { type: 'project_basic_info', data: basicInfo, done: false };

    // 2. 提取时间节点
    yield { type: 'status', data: '正在提取时间节点...', done: false };
    const timeSchedule = await this.extractSection(documentText, 'time_schedule');
    yield { type: 'time_schedule', data: timeSchedule, done: false };

    // 3. 提取技术需求
    yield { type: 'status', data: '正在提取技术需求...', done: false };
    const techDemand = await this.extractSection(documentText, 'core_tech_demand');
    yield { type: 'core_tech_demand', data: techDemand, done: false };

    // 4. 提取商务要求
    yield { type: 'status', data: '正在提取商务要求...', done: false };
    const businessReq = await this.extractSection(documentText, 'business_requirements');
    yield { type: 'business_requirements', data: businessReq, done: false };

    // 5. 提取评分标准
    yield { type: 'status', data: '正在提取评分标准...', done: false };
    const scoring = await this.extractSection(documentText, 'scoring_standard');
    yield { type: 'scoring_standard', data: scoring, done: false };

    // 6. 提取合规要求
    yield { type: 'status', data: '正在提取合规要求...', done: false };
    const compliance = await this.extractSection(documentText, 'key_compliance_requirements');
    yield { type: 'key_compliance_requirements', data: compliance, done: false };

    // 7. 提取投标文件要求
    yield { type: 'status', data: '正在提取投标文件要求...', done: false };
    const docReq = await this.extractSection(documentText, 'bidding_document_requirements');
    yield { type: 'bidding_document_requirements', data: docReq, done: false };

    // 8. 完成
    yield { type: 'complete', data: { documentName, documentPages }, done: true };
  }

  /**
   * 提取单个部分
   */
  private async extractSection(documentText: string, section: string): Promise<any> {
    const sectionPrompts: Record<string, string> = {
      project_basic_info: '提取项目基本信息，包括项目名称、编号、采购单位、联系方式、项目类型、预算、周期等。',
      time_schedule: '提取所有时间节点，包括招标公告、文件发售、提问截止、答疑、投标截止、开标时间等。',
      core_tech_demand: '提取技术需求，包括系统功能需求、技术参数、性能指标、技术方案要求等。',
      business_requirements: '提取商务要求，包括资格要求、资质证书、业绩要求、人员要求、服务要求、付款方式、保证金等。',
      scoring_standard: '提取评分标准，包括技术评分、商务评分、价格评分的详细评分项和细则。',
      key_compliance_requirements: '提取合规要求，特别是废标条款、投标限制、诚信要求等关键信息。',
      bidding_document_requirements: '提取投标文件要求，包括文件组成、格式要求、密封要求、递交要求等。',
    };

    const prompt = `
招标文档内容：
${documentText.substring(0, 50000)}

任务：${sectionPrompts[section] || section}

请严格按照JSON格式输出，确保字段完整。原文没有的信息设为null。
`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'user', content: prompt },
          ],
          temperature: this.temperature,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (content) {
        return JSON.parse(content);
      }
      
      return null;
    } catch (error) {
      console.error(`提取 ${section} 失败:`, error);
      return null;
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    return `
你是专业的招标文档信息提取专家，精通中国政府采购法和招投标相关法规。严格遵守以下规则：

## 核心原则
1. **100%原文提取**：所有内容必须来自原文，不得修改、编造、概括
2. **严格Schema遵循**：严格按照给定的JSON Schema输出，不得增减字段、修改结构
3. **逐条提取**：列表类内容逐条对应原文提取，不得合并、遗漏、总结
4. **NULL处理**：原文无对应信息的字段设为null，不要填写"无"、"未提及"等

## 提取规则
- **时间格式**：保持原文格式，如"2024年3月1日 17:00"
- **金额格式**：保持原文格式，如"人民币伍佰万元整"或"500万元"
- **列表提取**：每个条目独立成项，保持原文完整表述
- **关键参数**：技术参数表中标注是否为关键参数（通常标有"★"或"必须满足"）

## 质量要求
- 完整性：不遗漏任何重要信息
- 准确性：确保提取内容与原文完全一致
- 结构性：严格按照Schema组织数据
- 可读性：保持原文的专业术语和表述方式

## 重点提示
1. 废标条款是投标的关键风险点，必须完整提取
2. 投标截止时间和开标时间是关键时间节点
3. 评分标准要逐项提取，确保分值完整
4. 技术参数要标注是否为关键参数

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
`;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(documentText: string): string {
    // 截取文档前50000字符（避免超出token限制）
    const truncatedText = documentText.substring(0, 50000);
    
    return `
招标文档全文本：
${truncatedText}

请严格按照以下结构提取信息，输出JSON格式：

{
  "project_basic_info": {
    "project_name": "项目完整名称",
    "project_number": "项目编号",
    "purchase_unit": "采购单位全称",
    "purchase_unit_contact": "联系人",
    "purchase_unit_phone": "联系电话",
    "purchase_unit_email": "邮箱",
    "purchase_unit_address": "地址",
    "project_type": "项目类型",
    "procurement_method": "采购方式",
    "project_budget": "项目预算",
    "budget_source": "资金来源",
    "project_cycle": "服务期限",
    "delivery_period": "交付周期",
    "warranty_period": "质保期"
  },
  "time_schedule": {
    "bid_publish_date": "招标公告发布时间",
    "bid_document_sale_start": "文件发售开始",
    "bid_document_sale_end": "文件发售结束",
    "question_deadline": "提问截止",
    "answer_publish_date": "答疑发布",
    "site_visit_date": "现场踏勘",
    "bid_submission_deadline": "投标截止",
    "bid_opening_date": "开标时间",
    "bid_opening_location": "开标地点",
    "evaluation_period": "评标周期",
    "result_publicity_date": "结果公示"
  },
  "core_tech_demand": {
    "system_upgrade_demands": [
      {
        "module_name": "模块名称",
        "demand_details": ["需求1", "需求2"],
        "priority": "必须/重要/一般"
      }
    ],
    "technical_parameters": [
      {
        "parameter_name": "参数名称",
        "required_value": "要求值",
        "unit": "单位",
        "is_key_parameter": true,
        "deviation_allowed": false
      }
    ],
    "professional_tech_requirements": {
      "requirement_details": ["要求1", "要求2"]
    },
    "tech_solution_requirements": ["方案要求1"],
    "performance_requirements": [
      {
        "requirement_name": "性能指标",
        "requirement_value": "指标值"
      }
    ]
  },
  "business_requirements": {
    "bidder_qualification": {
      "basic_qualification": ["资格要求1"],
      "required_certificates": [
        {
          "certificate_name": "证书名称",
          "certificate_level": "等级",
          "is_mandatory": true
        }
      ],
      "performance_requirements": {
        "project_count": 3,
        "contract_amount": "金额要求",
        "proof_materials": ["材料1"]
      },
      "personnel_requirements": [
        {
          "position": "岗位",
          "count": 1,
          "qualification": ["资质1"]
        }
      ]
    },
    "service_location": "服务地点",
    "winner_count": 1,
    "payment_method": "付款方式",
    "bid_security": {
      "amount": "保证金金额",
      "payment_method": "缴纳方式",
      "deadline": "缴纳截止",
      "return_conditions": ["退还条件1"]
    },
    "bid_validity_period": "有效期"
  },
  "scoring_standard": {
    "tech_scoring": {
      "total_score": 100,
      "scoring_items": [
        {
          "item_name": "评分项",
          "weight": "10%",
          "max_score": 10,
          "score_details": ["细则1", "细则2"]
        }
      ]
    },
    "business_scoring": {
      "total_score": 100,
      "scoring_items": []
    },
    "price_scoring": {
      "total_score": 100,
      "scoring_method": "评分方法",
      "formula": "计算公式"
    }
  },
  "key_compliance_requirements": {
    "disqualification_rules": ["废标条款1", "废标条款2"],
    "major_deviation_rules": ["重大偏离1"],
    "bid_restrictions": ["投标限制1"],
    "integrity_requirements": ["诚信要求1"],
    "legal_compliance": ["法律合规1"]
  },
  "bidding_document_requirements": {
    "document_structure": [
      {
        "volume_name": "册名称",
        "sections": [
          {
            "section_name": "章节名",
            "required_documents": ["文件1"]
          }
        ]
      }
    ],
    "format_requirements": {
      "binding_method": "装订方式",
      "copies_count": 3,
      "electronic_format": "PDF"
    },
    "sealing_requirements": ["密封要求1"],
    "signature_requirements": ["签章要求1"]
  },
  "project_background": {
    "construction_background": "建设背景",
    "construction_goals": ["目标1"],
    "construction_scope": "建设范围",
    "business_requirements": ["业务需求1"]
  },
  "other_important_info": {
    "special_requirements": ["特殊要求1"],
    "notes": ["注意事项1"],
    "attachments": ["附件1"]
  }
}

仅输出符合Schema的纯JSON内容。
`;
  }

  /**
   * 解析提取结果
   */
  private parseExtractionResult(
    content: string,
    documentName: string,
    documentPages: number
  ): TenderDocumentExtractionResult {
    try {
      const parsed = JSON.parse(content);
      
      // 创建基础结果
      const result = createEmptyExtractionResult(documentName, documentPages, this.model);
      
      // 合并提取结果
      if (parsed.project_basic_info) {
        result.project_basic_info = { ...result.project_basic_info, ...parsed.project_basic_info };
      }
      if (parsed.time_schedule) {
        result.time_schedule = { ...result.time_schedule, ...parsed.time_schedule };
      }
      if (parsed.core_tech_demand) {
        result.core_tech_demand = { ...result.core_tech_demand, ...parsed.core_tech_demand };
      }
      if (parsed.business_requirements) {
        result.business_requirements = { 
          ...result.business_requirements, 
          ...parsed.business_requirements,
          bidder_qualification: {
            ...result.business_requirements.bidder_qualification,
            ...parsed.business_requirements.bidder_qualification,
          },
          bid_security: {
            ...result.business_requirements.bid_security,
            ...parsed.business_requirements.bid_security,
          },
        };
      }
      if (parsed.scoring_standard) {
        result.scoring_standard = { ...result.scoring_standard, ...parsed.scoring_standard };
      }
      if (parsed.key_compliance_requirements) {
        result.key_compliance_requirements = { 
          ...result.key_compliance_requirements, 
          ...parsed.key_compliance_requirements 
        };
      }
      if (parsed.bidding_document_requirements) {
        result.bidding_document_requirements = { 
          ...result.bidding_document_requirements, 
          ...parsed.bidding_document_requirements,
          format_requirements: {
            ...result.bidding_document_requirements.format_requirements,
            ...parsed.bidding_document_requirements.format_requirements,
          },
          submission_requirements: {
            ...result.bidding_document_requirements.submission_requirements,
            ...parsed.bidding_document_requirements.submission_requirements,
          },
        };
      }
      if (parsed.project_background) {
        result.project_background = { ...result.project_background, ...parsed.project_background };
      }
      if (parsed.other_important_info) {
        result.other_important_info = { ...result.other_important_info, ...parsed.other_important_info };
      }

      // 计算置信度
      result.extraction_metadata.confidence_score = this.calculateConfidence(result);

      return result;
    } catch (error) {
      console.error('解析提取结果失败:', error);
      return createEmptyExtractionResult(documentName, documentPages, this.model);
    }
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(result: TenderDocumentExtractionResult): number {
    let score = 0;
    let total = 0;

    // 检查关键字段
    const checks = [
      { value: result.project_basic_info.project_name, weight: 15 },
      { value: result.project_basic_info.purchase_unit, weight: 10 },
      { value: result.project_basic_info.project_budget, weight: 10 },
      { value: result.time_schedule.bid_submission_deadline, weight: 15 },
      { value: result.time_schedule.bid_opening_date, weight: 10 },
      { value: result.scoring_standard.tech_scoring.scoring_items.length > 0, weight: 15 },
      { value: result.key_compliance_requirements.disqualification_rules.length > 0, weight: 15 },
      { value: result.business_requirements.bidder_qualification.basic_qualification.length > 0, weight: 10 },
    ];

    for (const check of checks) {
      total += check.weight;
      if (check.value) {
        score += check.weight;
      }
    }

    return Math.min(score / total, 1);
  }
}

/**
 * 创建招标文档提取器实例
 */
export function createTenderDocumentExtractor(options?: Partial<ExtractionOptions>): TenderDocumentExtractor {
  return new TenderDocumentExtractor(options);
}
