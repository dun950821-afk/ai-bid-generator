/**
 * 标准大纲模板
 * 基于招标文件标准结构定义
 * 包含完整的章节拆分、评分绑定和执行计划
 */

import {
  TaskNode,
  ExecutionPlan,
  TaskTree,
  createEmptyTaskNode,
  createEmptyTaskTree,
} from '@/types/task-tree';

/**
 * 创建标准大纲模板任务节点
 */
export function createStandardOutlineTemplate(): TaskNode[] {
  return [
    // ==================== 封面与目录 ====================
    {
      id: 'section-cover',
      task_code: 'section-cover',
      chapter_id: 'cover',
      chapter_name: '封面与目录',
      title: '封面与目录',
      level: 0,
      task_type: 'Rule-Based-Form',
      task_group: 'cover',
      scoring_bindings: [],
      requirements: {
        must_include: ['投标文件正本封面', '投标文件副本封面', '投标文件目录'],
        format_rules: ['项目名称、招标编号、投标人名称需签字盖章'],
        prohibited_terms: [],
      },
      context_dependencies: [],
      status: 'pending',
      progress: 0,
      review_required: false,
      execution_order: 1,
      parallel_group: 'phase-1',
      children: [
        createEmptyTaskNode({
          id: 'section-cover-main',
          task_code: 'section-cover-main',
          chapter_id: 'cover-1',
          chapter_name: '投标文件正本/副本封面',
          title: '投标文件正本/副本封面',
          level: 1,
          task_type: 'Rule-Based-Form',
          task_group: 'cover',
          requirements: {
            must_include: ['项目名称', '招标编号', '投标人名称', '签字盖章区'],
            format_rules: [],
            prohibited_terms: [],
          },
          execution_order: 1,
          parallel_group: 'phase-1',
        }),
        createEmptyTaskNode({
          id: 'section-toc',
          task_code: 'section-toc',
          chapter_id: 'cover-2',
          chapter_name: '投标文件目录',
          title: '投标文件目录',
          level: 1,
          task_type: 'Rule-Based-Form',
          task_group: 'cover',
          requirements: {
            must_include: ['自动生成目录'],
            format_rules: ['页码自动更新'],
            prohibited_terms: [],
          },
          execution_order: 2,
          parallel_group: 'phase-1',
        }),
      ],
      metadata: { section_type: 'cover' },
    },

    // ==================== 评审索引表 ====================
    {
      id: 'section-index',
      task_code: 'section-index',
      chapter_id: 'index',
      chapter_name: '评审索引表',
      title: '评审索引表',
      level: 0,
      task_type: 'Rule-Based-Form',
      task_group: 'index',
      scoring_bindings: [],
      requirements: {
        must_include: ['初步评审索引表', '详细评审索引表'],
        format_rules: ['必须放置在正文最前方', '页码自动计算'],
        prohibited_terms: [],
      },
      context_dependencies: [],
      status: 'pending',
      progress: 0,
      review_required: false,
      execution_order: 2,
      parallel_group: 'phase-1',
      children: [
        createEmptyTaskNode({
          id: 'section-index-1',
          task_code: 'section-index-1',
          chapter_id: 'index-1',
          chapter_name: '初步评审索引表',
          title: '初步评审索引表',
          level: 1,
          task_type: 'Rule-Based-Form',
          task_group: 'index',
          requirements: {
            must_include: ['形式审查项', '资格审查项', '响应性审查项'],
            format_rules: ['对应页码指引'],
            prohibited_terms: [],
          },
          execution_order: 3,
          parallel_group: 'phase-1',
        }),
        createEmptyTaskNode({
          id: 'section-index-2',
          task_code: 'section-index-2',
          chapter_id: 'index-2',
          chapter_name: '详细评审索引表',
          title: '详细评审索引表',
          level: 1,
          task_type: 'Rule-Based-Form',
          task_group: 'index',
          requirements: {
            must_include: ['整体实力', '解决方案', '项目管理', '人员投入', '案例经验'],
            format_rules: ['打分项页码指引'],
            prohibited_terms: [],
          },
          execution_order: 4,
          parallel_group: 'phase-1',
        }),
      ],
      metadata: { section_type: 'index' },
    },

    // ==================== 核心商务与资格文件 ====================
    {
      id: 'section-business',
      task_code: 'section-business',
      chapter_id: 'business',
      chapter_name: '核心商务与资格文件',
      title: '核心商务与资格文件',
      level: 0,
      task_type: 'Data-Filling',
      task_group: 'business',
      scoring_bindings: [],
      requirements: {
        must_include: [],
        format_rules: ['按招标文件要求顺序排列'],
        prohibited_terms: [],
      },
      context_dependencies: [],
      status: 'pending',
      progress: 0,
      review_required: false,
      execution_order: 3,
      parallel_group: 'phase-2',
      children: createBusinessSectionChildren(),
      metadata: { section_type: 'business' },
    },

    // ==================== 十一、技术方案（核心生成区） ====================
    {
      id: 'section-11',
      task_code: 'section-11',
      chapter_id: '11',
      chapter_name: '技术方案',
      title: '十一、技术方案',
      level: 0,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [],
      requirements: {
        must_include: [],
        format_rules: ['此章节是大模型生成的核心压力区，必须按子章节切分生成'],
        prohibited_terms: ['废标词汇', '负面表述'],
      },
      context_dependencies: [],
      status: 'pending',
      progress: 0,
      review_required: false,
      execution_order: 4,
      children: createTechnicalSectionChildren(),
      metadata: { section_type: 'technical' },
    },

    // ==================== 专项合规承诺与附属文件 ====================
    {
      id: 'section-compliance',
      task_code: 'section-compliance',
      chapter_id: 'compliance',
      chapter_name: '专项合规承诺与附属文件',
      title: '专项合规承诺与附属文件',
      level: 0,
      task_type: 'Rule-Based-Form',
      task_group: 'compliance',
      scoring_bindings: [],
      requirements: {
        must_include: [],
        format_rules: [],
        prohibited_terms: [],
      },
      context_dependencies: [],
      status: 'pending',
      progress: 0,
      review_required: false,
      execution_order: 5,
      parallel_group: 'phase-4',
      children: createComplianceSectionChildren(),
      metadata: { section_type: 'compliance' },
    },
  ];
}

/**
 * 创建商务部分子章节
 */
function createBusinessSectionChildren(): TaskNode[] {
  return [
    // 一、投标函
    createEmptyTaskNode({
      id: 'section-01',
      task_code: 'section-01',
      chapter_id: '01',
      chapter_name: '投标函',
      title: '一、投标函',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: ['投标总价', '服务期限', '质量承诺'],
        format_rules: ['需法定代表人签字盖章'],
        prohibited_terms: [],
      },
      execution_order: 5,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    // 二、法定代表人授权委托书
    createEmptyTaskNode({
      id: 'section-02',
      task_code: 'section-02',
      chapter_id: '02',
      chapter_name: '法定代表人授权委托书',
      title: '二、法定代表人授权委托书',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: ['授权委托书正文', '法定代表人身份证复印件', '委托代理人身份证复印件', '委托代理人近三个月社保证明'],
        format_rules: [],
        prohibited_terms: [],
      },
      execution_order: 6,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    // 三、投标一览表（关键！需人工复核）
    createEmptyTaskNode({
      id: 'section-03',
      task_code: 'section-03',
      chapter_id: '03',
      chapter_name: '投标一览表',
      title: '三、投标一览表',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: ['报价含税单价', '总价', '税率', '发票类型'],
        format_rules: ['需单独密封一份用于公开唱价', '算术校验必须正确'],
        prohibited_terms: [],
      },
      review_required: true,
      review_priority: 'critical',
      execution_order: 7,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    // 四、投标保证金递交凭证
    createEmptyTaskNode({
      id: 'section-04',
      task_code: 'section-04',
      chapter_id: '04',
      chapter_name: '投标保证金递交凭证',
      title: '四、投标保证金递交凭证',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: ['保证金缴纳凭证', '金额核对'],
        format_rules: [],
        prohibited_terms: [],
      },
      execution_order: 8,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    // 五、资格证明文件
    createEmptyTaskNode({
      id: 'section-05',
      task_code: 'section-05',
      chapter_id: '05',
      chapter_name: '资格证明文件',
      title: '五、资格证明文件',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: [],
        format_rules: ['严格按招标文件要求的顺序提供材料'],
        prohibited_terms: [],
      },
      execution_order: 9,
      parallel_group: 'phase-2',
      children: createQualificationChildren(),
      metadata: { section_type: 'business' },
    }),
    // 六至十
    createEmptyTaskNode({
      id: 'section-06',
      task_code: 'section-06',
      chapter_id: '06',
      chapter_name: '法定代表人与招标人员工亲属关系申明函',
      title: '六、法定代表人与招标人员工亲属关系申明函',
      level: 1,
      task_type: 'Rule-Based-Form',
      task_group: 'business',
      requirements: { must_include: [], format_rules: [], prohibited_terms: [] },
      execution_order: 10,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    createEmptyTaskNode({
      id: 'section-07',
      task_code: 'section-07',
      chapter_id: '07',
      chapter_name: '投标人须知应答偏离表',
      title: '七、投标人须知应答偏离表',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: [],
        format_rules: ['逐条应答'],
        prohibited_terms: [],
      },
      execution_order: 11,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    createEmptyTaskNode({
      id: 'section-08',
      task_code: 'section-08',
      chapter_id: '08',
      chapter_name: '合同条款应答偏离表',
      title: '八、合同条款应答偏离表',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: [],
        format_rules: ['逐条应答'],
        prohibited_terms: [],
      },
      execution_order: 12,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    createEmptyTaskNode({
      id: 'section-09',
      task_code: 'section-09',
      chapter_id: '09',
      chapter_name: '财务状况信息及财务报告',
      title: '九、财务状况信息及财务报告',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: ['开户行信息', '近三年资产负债', '利润统计表'],
        format_rules: [],
        prohibited_terms: [],
      },
      execution_order: 13,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
    createEmptyTaskNode({
      id: 'section-10',
      task_code: 'section-10',
      chapter_id: '10',
      chapter_name: '技术需求书应答偏离表',
      title: '十、技术需求书应答偏离表',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'business',
      requirements: {
        must_include: [],
        format_rules: ['逐条应答"满足/不满足"', '正偏离需详细说明'],
        prohibited_terms: [],
      },
      execution_order: 14,
      parallel_group: 'phase-2',
      metadata: { section_type: 'business' },
    }),
  ];
}

/**
 * 创建资格证明子章节
 */
function createQualificationChildren(): TaskNode[] {
  const items = [
    { id: '05-01', name: '基本信息表及营业执照/法人证书', includes: [] },
    { id: '05-02', name: '投标人控股及管理关系情况', includes: ['申报表', '两份防串标承诺函'] },
    { id: '05-03', name: '无欺骗、欺诈行为及不良记录承诺函', includes: [], type: 'Rule-Based-Form' as const },
    { id: '05-04', name: '中标后不分包、转包承诺函', includes: [], type: 'Rule-Based-Form' as const },
    { id: '05-05', name: '非联合体投标承诺函', includes: [], type: 'Rule-Based-Form' as const },
    { id: '05-06', name: '无重大违法违规情况证明', includes: ['承诺函', '信用中国等五大平台查询截图'] },
    { id: '05-07', name: '营业办公场所证明', includes: ['自有房产证或有效期内租赁合同'] },
    { id: '05-08', name: '依法缴纳税收和社会保障资金良好记录', includes: ['增值税凭证', '不少于10人连续1年社保直缴证明'] },
    { id: '05-09', name: '同类项目实施案例', includes: ['开发安全/测试溯源类合同复印件'], review: true },
    { id: '05-10', name: '良好的商业信誉和健全的财务会计制度', includes: ['近三年审计报告或近三个月银行资信证明'] },
    { id: '05-11', name: '具有履行合同必需的设备和专业技术能力承诺函', includes: [], type: 'Rule-Based-Form' as const },
  ];

  return items.map((item, idx) => createEmptyTaskNode({
    id: `section-${item.id}`,
    task_code: `section-${item.id}`,
    chapter_id: item.id,
    chapter_name: item.name,
    title: `5.${idx + 1} ${item.name}`,
    level: 2,
    task_type: item.type || 'Data-Filling',
    task_group: 'business',
    requirements: {
      must_include: item.includes,
      format_rules: [],
      prohibited_terms: [],
    },
    review_required: item.review || false,
    review_priority: item.review ? 'high' : undefined,
    execution_order: 15 + idx,
    parallel_group: 'phase-2',
    metadata: { section_type: 'business' },
  }));
}

/**
 * 创建技术方案子章节（核心生成区）
 * 按照 11.1 - 11.9 细分
 */
function createTechnicalSectionChildren(): TaskNode[] {
  return [
    // （一）技术方案主体
    createEmptyTaskNode({
      id: 'section-11-main',
      task_code: 'section-11-main',
      chapter_id: '11-main',
      chapter_name: '技术方案主体',
      title: '（一）技术方案主体',
      level: 1,
      task_type: 'Text-Generation',
      task_group: 'technical',
      requirements: { must_include: [], format_rules: [], prohibited_terms: [] },
      execution_order: 30,
      children: createTechMainChildren(),
      metadata: { section_type: 'technical' },
    }),
    // （二）拟派服务团队与人员投入
    createEmptyTaskNode({
      id: 'section-11-team',
      task_code: 'section-11-team',
      chapter_id: '11-team',
      chapter_name: '拟派服务团队与人员投入',
      title: '（二）拟派服务团队与人员投入',
      level: 1,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [
        {
          scoring_item_id: 'score-pm',
          scoring_item_name: '人员投入-项目经理资质',
          max_score: 5,
          scoring_criteria: '项目经理资质和经验',
          response_strategy: '展示项目经理专业资质与同类项目经验',
          key_points: [],
        },
        {
          scoring_item_id: 'score-tech-manager',
          scoring_item_name: '人员投入-技术经理资质',
          max_score: 5,
          scoring_criteria: '技术经理资质和经验',
          response_strategy: '展示技术经理专业资质与架构经验',
          key_points: [],
        },
        {
          scoring_item_id: 'score-staff',
          scoring_item_name: '人员投入-人员供给',
          max_score: 5,
          scoring_criteria: '人员配置合理性',
          response_strategy: '展示项目组人员资质及稳定供给保障',
          key_points: [],
        },
      ],
      requirements: {
        must_include: ['核心团队配置', '项目经理资质', '技术经理资质', '人员稳定保障'],
        format_rules: [],
        word_limit: 2000,
        prohibited_terms: [],
      },
      context_dependencies: [{ task_id: 'section-11-1', dependency_type: 'outline', description: '团队实力信息' }],
      execution_order: 60,
      children: createTeamChildren(),
      metadata: { section_type: 'technical' },
    }),
    // （三）同类项目案例经验详述
    createEmptyTaskNode({
      id: 'section-11-cases',
      task_code: 'section-11-cases',
      chapter_id: '11-cases',
      chapter_name: '同类项目案例经验详述',
      title: '（三）同类项目案例经验详述',
      level: 1,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [
        {
          scoring_item_id: 'score-case-bank',
          scoring_item_name: '案例经验-股份制银行项目',
          max_score: 8,
          scoring_criteria: '全国性股份制商业银行开发安全/安全测试溯源项目经验',
          response_strategy: '展示股份制银行项目实施经验',
          key_points: [],
        },
        {
          scoring_item_id: 'score-case-fin',
          scoring_item_name: '案例经验-金融机构项目',
          max_score: 7,
          scoring_criteria: '其他大型金融机构类似项目经验',
          response_strategy: '展示大型金融机构项目经验',
          key_points: [],
        },
      ],
      requirements: {
        must_include: ['股份制银行项目经验', '大型金融机构项目经验'],
        format_rules: [],
        word_limit: 1500,
        prohibited_terms: [],
      },
      execution_order: 70,
      parallel_group: 'tech-parallel-1',
      children: createCaseChildren(),
      metadata: { section_type: 'technical' },
    }),
  ];
}

/**
 * 创建技术方案主体子章节
 */
function createTechMainChildren(): TaskNode[] {
  return [
    // 11.1 投标人整体实力展示
    createEmptyTaskNode({
      id: 'section-11-1',
      task_code: 'section-11-1',
      chapter_id: '11.1',
      chapter_name: '投标人整体实力展示',
      title: '11.1 投标人整体实力展示',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [
        {
          scoring_item_id: 'score-overall',
          scoring_item_name: '整体实力',
          max_score: 5,
          scoring_criteria: '企业认证、人才储备、行业经验',
          response_strategy: '展示核心企业认证与资质、复合型安全人才储备、团队经验',
          key_points: ['核心企业认证与资质展现', '复合型安全人才储备情况', '团队在开发安全与溯源领域的整体经验'],
        },
      ],
      requirements: {
        must_include: ['核心企业认证与资质', '安全人才储备', '开发安全领域经验'],
        format_rules: [],
        word_limit: 1500,
        prohibited_terms: [],
      },
      execution_order: 31,
      parallel_group: 'tech-parallel-1',
      children: [
        createTechSubNode('11-1-1', '11.1.1', '核心企业认证与资质展现', 500),
        createTechSubNode('11-1-2', '11.1.2', '复合型安全人才储备情况', 500),
        createTechSubNode('11-1-3', '11.1.3', '团队在开发安全与溯源领域的整体经验', 500),
      ],
      metadata: { section_type: 'technical' },
    }),
    // 11.2 对本项目需求和目标的深刻理解
    createEmptyTaskNode({
      id: 'section-11-2',
      task_code: 'section-11-2',
      chapter_id: '11.2',
      chapter_name: '对本项目需求和目标的深刻理解',
      title: '11.2 对本项目需求和目标的深刻理解',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [
        {
          scoring_item_id: 'score-requirement',
          scoring_item_name: '解决方案-需求分析',
          max_score: 10,
          scoring_criteria: '对项目需求的理解深度',
          response_strategy: '从技术和业务双视角阐述对项目的理解',
          key_points: ['银行业信息安全建设背景与目标洞察', '核心业务需求剖析'],
        },
      ],
      requirements: {
        must_include: ['银行业信息安全建设背景', '核心业务需求分析'],
        format_rules: [],
        word_limit: 1500,
        prohibited_terms: [],
      },
      execution_order: 32,
      parallel_group: 'tech-parallel-1',
      children: [
        createTechSubNode('11-2-1', '11.2.1', '银行业信息安全建设背景与目标洞察', 800),
        createEmptyTaskNode({
          id: 'section-11-2-2',
          task_code: 'section-11-2-2',
          chapter_id: '11.2.2',
          chapter_name: '核心业务需求剖析',
          title: '11.2.2 核心业务需求剖析',
          level: 3,
          task_type: 'Text-Generation',
          task_group: 'technical',
          requirements: {
            must_include: ['安全体系管控', 'AI助手', '测试溯源量化'],
            format_rules: [],
            word_limit: 700,
            prohibited_terms: [],
          },
          execution_order: 34,
          metadata: { section_type: 'technical' },
        }),
      ],
      metadata: { section_type: 'technical' },
    }),
    // 11.3 总体技术方案与规划设计
    createEmptyTaskNode({
      id: 'section-11-3',
      task_code: 'section-11-3',
      chapter_id: '11.3',
      chapter_name: '总体技术方案与规划设计',
      title: '11.3 总体技术方案与规划设计',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [
        {
          scoring_item_id: 'score-tech-solution',
          scoring_item_name: '解决方案-技术方案',
          max_score: 15,
          scoring_criteria: '技术方案合理性、创新性',
          response_strategy: '展示总体架构、技术路线、各子系统设计',
          key_points: ['总体架构规划', '开发安全体系管控', '开发安全智能助手', '安全测试过程溯源系统'],
        },
        {
          scoring_item_id: 'score-planning',
          scoring_item_name: '解决方案-规划设计',
          max_score: 10,
          scoring_criteria: '规划设计的完整性和可行性',
          response_strategy: '展示系统架构设计、技术选型、实施路径',
          key_points: [],
        },
      ],
      requirements: {
        must_include: ['总体架构规划', '技术路线设计', '各子系统方案'],
        format_rules: [],
        word_limit: 3000,
        prohibited_terms: [],
      },
      context_dependencies: [
        { task_id: 'section-11-1', dependency_type: 'outline', description: '企业实力背景' },
        { task_id: 'section-11-2', dependency_type: 'outline', description: '需求分析结论' },
      ],
      execution_order: 40,
      children: [
        createTechSubNode('11-3-1', '11.3.1', '总体架构规划与技术路线设计', 800),
        createEmptyTaskNode({
          id: 'section-11-3-2',
          task_code: 'section-11-3-2',
          chapter_id: '11.3.2',
          chapter_name: '开发安全体系管控系统设计',
          title: '11.3.2 开发安全体系管控系统设计',
          level: 3,
          task_type: 'Text-Generation',
          task_group: 'technical',
          requirements: {
            must_include: ['执行情况', '应答指标', '体系建设'],
            format_rules: [],
            word_limit: 800,
            prohibited_terms: [],
          },
          execution_order: 42,
          metadata: { section_type: 'technical' },
        }),
        createEmptyTaskNode({
          id: 'section-11-3-3',
          task_code: 'section-11-3-3',
          chapter_id: '11.3.3',
          chapter_name: '开发安全智能助手方案',
          title: '11.3.3 开发安全智能助手方案',
          level: 3,
          task_type: 'Text-Generation',
          task_group: 'technical',
          requirements: {
            must_include: ['AI场景落地', '交互优化'],
            format_rules: [],
            word_limit: 800,
            prohibited_terms: [],
          },
          execution_order: 43,
          metadata: { section_type: 'technical' },
        }),
        createEmptyTaskNode({
          id: 'section-11-3-4',
          task_code: 'section-11-3-4',
          chapter_id: '11.3.4',
          chapter_name: '安全测试过程溯源系统方案',
          title: '11.3.4 安全测试过程溯源系统方案',
          level: 3,
          task_type: 'Text-Generation',
          task_group: 'technical',
          requirements: {
            must_include: ['自动化检测', '接入方案', '量化分析'],
            format_rules: [],
            word_limit: 800,
            prohibited_terms: [],
          },
          execution_order: 44,
          metadata: { section_type: 'technical' },
        }),
      ],
      metadata: { section_type: 'technical' },
    }),
    // 11.4 项目组织实施与管理体系
    createEmptyTaskNode({
      id: 'section-11-4',
      task_code: 'section-11-4',
      chapter_id: '11.4',
      chapter_name: '项目组织实施与管理体系',
      title: '11.4 项目组织实施与管理体系',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [
        {
          scoring_item_id: 'score-org',
          scoring_item_name: '项目管理-项目组织',
          max_score: 5,
          scoring_criteria: '项目组织架构合理性',
          response_strategy: '展示实施方法论、组织架构、阶段计划',
          key_points: [],
        },
        {
          scoring_item_id: 'score-quality',
          scoring_item_name: '项目管理-质量管理',
          max_score: 5,
          scoring_criteria: '质量管理体系完整性',
          response_strategy: '展示全生命周期质量管理体系',
          key_points: [],
        },
        {
          scoring_item_id: 'score-delivery',
          scoring_item_name: '项目管理-项目交付',
          max_score: 5,
          scoring_criteria: '交付保障方案可行性',
          response_strategy: '展示高质量交付保障方案',
          key_points: [],
        },
      ],
      requirements: {
        must_include: ['实施方法论', '项目组织架构', '质量管理体系'],
        format_rules: [],
        word_limit: 2000,
        prohibited_terms: [],
      },
      context_dependencies: [{ task_id: 'section-11-3', dependency_type: 'outline', description: '技术方案大纲' }],
      execution_order: 50,
      children: [
        createTechSubNode('11-4-1', '11.4.1', '实施方法论与项目组织架构设计', 700),
        createTechSubNode('11-4-2', '11.4.2', '阶段性实施计划与高质量交付保障方案', 700),
        createTechSubNode('11-4-3', '11.4.3', '全生命周期质量管理体系', 600),
      ],
      metadata: { section_type: 'technical' },
    }),
    // 11.5 项目实施风险点与应对措施
    createEmptyTaskNode({
      id: 'section-11-5',
      task_code: 'section-11-5',
      chapter_id: '11.5',
      chapter_name: '项目实施风险点与应对措施',
      title: '11.5 项目实施风险点与应对措施',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      requirements: {
        must_include: ['风险识别', '应对预案'],
        format_rules: [],
        word_limit: 1000,
        prohibited_terms: [],
      },
      context_dependencies: [{ task_id: 'section-11-4', dependency_type: 'outline', description: '项目组织方案' }],
      execution_order: 55,
      children: [
        createEmptyTaskNode({
          id: 'section-11-5-1',
          task_code: 'section-11-5-1',
          chapter_id: '11.5.1',
          chapter_name: '实施风险识别',
          title: '11.5.1 实施风险识别',
          level: 3,
          task_type: 'Text-Generation',
          task_group: 'technical',
          requirements: {
            must_include: ['技术风险', '进度风险', '人员风险'],
            format_rules: [],
            word_limit: 500,
            prohibited_terms: [],
          },
          execution_order: 56,
          metadata: { section_type: 'technical' },
        }),
        createTechSubNode('11-5-2', '11.5.2', '专项风险控制与应对预案', 500),
      ],
      metadata: { section_type: 'technical' },
    }),
    // 11.6 维保、售后及知识转移方案
    createEmptyTaskNode({
      id: 'section-11-6',
      task_code: 'section-11-6',
      chapter_id: '11.6',
      chapter_name: '维保、售后及知识转移方案',
      title: '11.6 维保、售后及知识转移方案',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      scoring_bindings: [
        {
          scoring_item_id: 'score-maintenance',
          scoring_item_name: '项目管理-运维保障',
          max_score: 5,
          scoring_criteria: '售后服务承诺完整性',
          response_strategy: '明确承诺服务响应时间、维保期限',
          key_points: ['12个月7*24小时免费维护', '0.5小时电话响应', '现场支持4小时内'],
        },
        {
          scoring_item_id: 'score-knowledge',
          scoring_item_name: '项目管理-知识转移',
          max_score: 5,
          scoring_criteria: '培训计划完整性',
          response_strategy: '展示培训计划和知识转移方案',
          key_points: [],
        },
      ],
      requirements: {
        must_include: ['售后服务承诺', '维保方案', '培训计划'],
        format_rules: [],
        word_limit: 1500,
        prohibited_terms: [],
      },
      execution_order: 35,
      parallel_group: 'tech-parallel-1',
      children: [
        createEmptyTaskNode({
          id: 'section-11-6-1',
          task_code: 'section-11-6-1',
          chapter_id: '11.6.1',
          chapter_name: '售后服务与长期维保方案',
          title: '11.6.1 售后服务与长期维保方案',
          level: 3,
          task_type: 'Text-Generation',
          task_group: 'technical',
          requirements: {
            must_include: ['12个月7*24小时免费维护', '0.5小时电话响应', '现场支持4小时'],
            format_rules: [],
            word_limit: 600,
            prohibited_terms: [],
          },
          execution_order: 36,
          metadata: { section_type: 'technical' },
        }),
        createTechSubNode('11-6-2', '11.6.2', '服务内容说明书', 400),
        createTechSubNode('11-6-3', '11.6.3', '培训计划与知识转移方案', 500),
      ],
      metadata: { section_type: 'technical' },
    }),
  ];
}

/**
 * 创建技术三级子节点辅助函数
 */
function createTechSubNode(id: string, chapterId: string, name: string, wordLimit: number): TaskNode {
  return createEmptyTaskNode({
    id: `section-${id}`,
    task_code: `section-${id}`,
    chapter_id: chapterId,
    chapter_name: name,
    title: `${chapterId} ${name}`,
    level: 3,
    task_type: 'Text-Generation',
    task_group: 'technical',
    requirements: {
      must_include: [],
      format_rules: [],
      word_limit: wordLimit,
      prohibited_terms: [],
    },
    execution_order: parseInt(chapterId.replace(/\./g, '')) || 0,
    metadata: { section_type: 'technical' },
  });
}

/**
 * 创建团队部分子章节
 */
function createTeamChildren(): TaskNode[] {
  return [
    createEmptyTaskNode({
      id: 'section-11-7',
      task_code: 'section-11-7',
      chapter_id: '11.7',
      chapter_name: '参与本项目主要人员名单及梯队建设',
      title: '11.7 参与本项目主要人员名单及梯队建设',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      requirements: {
        must_include: ['核心团队配置汇总', '人员梯队建设'],
        format_rules: [],
        word_limit: 1000,
        prohibited_terms: [],
      },
      execution_order: 61,
      metadata: { section_type: 'technical' },
    }),
    createEmptyTaskNode({
      id: 'section-11-8',
      task_code: 'section-11-8',
      chapter_id: '11.8',
      chapter_name: '主要人员简历表与资质证明材料',
      title: '11.8 主要人员简历表与资质证明材料',
      level: 2,
      task_type: 'Data-Filling',
      task_group: 'technical',
      requirements: {
        must_include: ['学历验证', '资质证书', '社保证明'],
        format_rules: ['按要求排版装订'],
        prohibited_terms: [],
      },
      review_required: true,
      review_priority: 'high',
      execution_order: 62,
      metadata: { section_type: 'technical' },
    }),
  ];
}

/**
 * 创建案例部分子章节
 */
function createCaseChildren(): TaskNode[] {
  return [
    createEmptyTaskNode({
      id: 'section-11-9-1',
      task_code: 'section-11-9-1',
      chapter_id: '11.9.1',
      chapter_name: '全国性股份制商业银行开发安全/安全测试溯源项目实施经验展示',
      title: '11.9.1 全国性股份制商业银行开发安全/安全测试溯源项目实施经验展示',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      requirements: {
        must_include: ['股份制银行项目经验'],
        format_rules: [],
        word_limit: 800,
        prohibited_terms: [],
      },
      execution_order: 71,
      metadata: { section_type: 'technical' },
    }),
    createEmptyTaskNode({
      id: 'section-11-9-2',
      task_code: 'section-11-9-2',
      chapter_id: '11.9.2',
      chapter_name: '其他大型金融机构类似项目实施经验展示',
      title: '11.9.2 其他大型金融机构类似项目实施经验展示',
      level: 2,
      task_type: 'Text-Generation',
      task_group: 'technical',
      requirements: {
        must_include: ['大型金融机构项目经验'],
        format_rules: [],
        word_limit: 700,
        prohibited_terms: [],
      },
      execution_order: 72,
      metadata: { section_type: 'technical' },
    }),
  ];
}

/**
 * 创建合规部分子章节
 */
function createComplianceSectionChildren(): TaskNode[] {
  return [
    createEmptyTaskNode({
      id: 'section-12',
      task_code: 'section-12',
      chapter_id: '12',
      chapter_name: '银保监会141号文承诺函',
      title: '十二、《银行保险机构信息科技外包风险监管办法（银保监办发 [2021]141 号）》承诺函',
      level: 1,
      task_type: 'Rule-Based-Form',
      task_group: 'compliance',
      requirements: { must_include: [], format_rules: [], prohibited_terms: [] },
      execution_order: 80,
      parallel_group: 'phase-4',
      metadata: { section_type: 'compliance' },
    }),
    createEmptyTaskNode({
      id: 'section-13',
      task_code: 'section-13',
      chapter_id: '13',
      chapter_name: '网络安全审查办法承诺函',
      title: '十三、《网络安全审查办法》承诺函',
      level: 1,
      task_type: 'Rule-Based-Form',
      task_group: 'compliance',
      requirements: { must_include: [], format_rules: [], prohibited_terms: [] },
      execution_order: 81,
      parallel_group: 'phase-4',
      metadata: { section_type: 'compliance' },
    }),
    createEmptyTaskNode({
      id: 'section-14',
      task_code: 'section-14',
      chapter_id: '14',
      chapter_name: '招标代理服务费承诺书',
      title: '十四、招标代理服务费承诺书',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'compliance',
      requirements: {
        must_include: ['汇款账号', '增值税专票信息'],
        format_rules: [],
        prohibited_terms: [],
      },
      execution_order: 82,
      parallel_group: 'phase-4',
      metadata: { section_type: 'compliance' },
    }),
    createEmptyTaskNode({
      id: 'section-15',
      task_code: 'section-15',
      chapter_id: '15',
      chapter_name: '公章对其他印章授权说明',
      title: '十五、公章对其他印章（如投标专用章）授权说明',
      level: 1,
      task_type: 'Rule-Based-Form',
      task_group: 'compliance',
      requirements: { must_include: [], format_rules: [], prohibited_terms: [] },
      execution_order: 83,
      parallel_group: 'phase-4',
      metadata: { section_type: 'compliance' },
    }),
    createEmptyTaskNode({
      id: 'section-16',
      task_code: 'section-16',
      chapter_id: '16',
      chapter_name: '其他材料',
      title: '十六、其他材料',
      level: 1,
      task_type: 'Data-Filling',
      task_group: 'appendix',
      requirements: {
        must_include: ['产品白皮书', '原厂商授权函等加分材料'],
        format_rules: ['视需补充'],
        prohibited_terms: [],
      },
      execution_order: 84,
      parallel_group: 'phase-4',
      metadata: { section_type: 'appendix' },
    }),
  ];
}

/**
 * 创建标准执行计划
 */
export function createStandardExecutionPlan(tasks: TaskNode[]): ExecutionPlan {
  const flatTasks = flattenTasks(tasks);
  
  return {
    total_tasks: flatTasks.length,
    by_type: {
      rule_based_form: flatTasks.filter(t => t.task_type === 'Rule-Based-Form').length,
      data_filling: flatTasks.filter(t => t.task_type === 'Data-Filling').length,
      text_generation: flatTasks.filter(t => t.task_type === 'Text-Generation').length,
    },
    phases: [
      {
        phase_id: 'phase-1',
        phase_name: '模板填充阶段',
        description: '处理封面、目录、索引表等规则表单',
        tasks: flatTasks.filter(t => t.parallel_group === 'phase-1').map(t => t.id),
        execution_mode: 'parallel',
        estimated_duration: 'instant',
      },
      {
        phase_id: 'phase-2',
        phase_name: '商务资质阶段',
        description: '处理投标函、授权书、资格证明等商务文件',
        tasks: flatTasks.filter(t => t.parallel_group === 'phase-2').map(t => t.id),
        execution_mode: 'parallel',
        estimated_duration: '5-10s',
      },
      {
        phase_id: 'phase-3',
        phase_name: '技术方案生成阶段',
        description: '核心章节，按11.1-11.9顺序生成',
        tasks: flatTasks.filter(t => t.task_group === 'technical').map(t => t.id),
        execution_mode: 'conditional',
        dependencies: ['phase-2'],
        estimated_duration: '5-10min',
      },
      {
        phase_id: 'phase-4',
        phase_name: '合规承诺阶段',
        description: '处理银保监会承诺函、网安审查承诺函等',
        tasks: flatTasks.filter(t => t.parallel_group === 'phase-4').map(t => t.id),
        execution_mode: 'parallel',
        dependencies: ['phase-3'],
        estimated_duration: '5-10s',
      },
    ],
    review_points: flatTasks
      .filter(t => t.review_required)
      .map(t => ({
        task_id: t.id,
        reason: t.chapter_name + ' 需要人工确认',
        priority: t.review_priority || 'medium',
      })),
  };
}

/**
 * 扁平化任务列表
 */
function flattenTasks(tasks: TaskNode[]): TaskNode[] {
  const result: TaskNode[] = [];
  function traverse(nodes: TaskNode[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }
  traverse(tasks);
  return result;
}

/**
 * 创建完整的任务树
 */
export function createFullTaskTree(projectInfo: Partial<{
  project_name: string;
  project_number: string;
  purchase_unit: string;
  tech_summary: string;
}> = {}): TaskTree {
  const tasks = createStandardOutlineTemplate();
  const executionPlan = createStandardExecutionPlan(tasks);
  
  return {
    project_info: {
      project_name: projectInfo.project_name || '',
      project_number: projectInfo.project_number || '',
      purchase_unit: projectInfo.purchase_unit || '',
      tech_summary: projectInfo.tech_summary || '',
      key_requirements: [],
    },
    tasks,
    execution_plan: executionPlan,
    scoring_matrix: {
      total_items: 0,
      covered_items: 0,
      coverage_rate: 0,
      mappings: [],
    },
    meta: {
      generated_at: new Date().toISOString(),
      version: '2.0',
    },
  };
}
