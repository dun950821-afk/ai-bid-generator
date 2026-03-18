'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FileText,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Building2,
  Calendar,
  Settings,
  Target,
  AlertTriangle,
  FileCheck,
  Info,
  ArrowLeft,
  DollarSign,
  Users,
  Clock,
} from 'lucide-react';

// 分段配置
const SECTION_CONFIG: Record<string, { title: string; icon: any; color: string }> = {
  projectBasicInfo: { title: '项目基本信息', icon: Building2, color: 'text-blue-600' },
  projectBackground: { title: '项目背景', icon: Info, color: 'text-gray-600' },
  timeSchedule: { title: '时间节点', icon: Calendar, color: 'text-green-600' },
  coreTechDemand: { title: '核心技术需求', icon: Settings, color: 'text-purple-600' },
  businessRequirements: { title: '商务要求', icon: Building2, color: 'text-orange-600' },
  scoringStandard: { title: '评分标准', icon: Target, color: 'text-red-600' },
  disqualificationRisks: { title: '废标风险', icon: AlertTriangle, color: 'text-yellow-600' },
  biddingDocumentRequirements: { title: '投标文件要求', icon: FileCheck, color: 'text-cyan-600' },
  otherImportantInfo: { title: '其他重要信息', icon: Info, color: 'text-indigo-600' },
  extractionMetadata: { title: '提取元数据', icon: Info, color: 'text-gray-500' },
};

// 字段名中英文映射（核心映射表）
const FIELD_LABELS: Record<string, string> = {
  // 项目基本信息
  projectName: '项目名称',
  projectNumber: '项目编号',
  purchaseUnit: '采购单位',
  purchaseUnitContact: '联系人',
  purchaseUnitPhone: '联系电话',
  purchaseUnitEmail: '电子邮箱',
  purchaseUnitAddress: '单位地址',
  projectType: '项目类型',
  procurementMethod: '采购方式',
  projectBudget: '项目预算',
  budgetSource: '资金来源',
  budgetApproval: '预算批复文号',
  projectCycle: '服务期限',
  deliveryPeriod: '交付周期',
  warrantyPeriod: '质保期',
  
  // 时间节点
  bidPublishDate: '招标公告发布时间',
  bidDocumentSaleStart: '文件发售开始时间',
  bidDocumentSaleEnd: '文件发售结束时间',
  questionDeadline: '提问截止时间',
  answerPublishDate: '答疑发布时间',
  siteVisitDate: '现场踏勘时间',
  bidSubmissionDeadline: '投标截止时间',
  bidOpeningDate: '开标时间',
  bidOpeningLocation: '开标地点',
  evaluationPeriod: '评标周期',
  resultPublicityDate: '结果公示时间',
  
  // 项目背景
  constructionBackground: '建设背景',
  constructionGoals: '建设目标',
  constructionScope: '建设范围',
  currentStatus: '现状描述',
  businessRequirementsBackground: '业务需求',
  
  // 技术需求
  systemUpgradeDemands: '系统功能需求',
  moduleName: '模块名称',
  moduleCode: '模块编码',
  demandDetails: '需求详情',
  priority: '优先级',
  technicalParameters: '技术参数要求',
  parameterName: '参数名称',
  requiredValue: '要求值',
  unit: '单位',
  isKeyParameter: '关键参数',
  deviationAllowed: '允许偏离',
  professionalTechRequirements: '专业技术要求',
  requirementDetails: '要求详情',
  techSolutionRequirements: '技术方案要求',
  techPerformanceRequirements: '性能指标要求',
  requirementName: '指标名称',
  requirementValue: '指标值',
  
  // 商务要求
  bidderQualification: '投标人资格要求',
  basicQualification: '基本资格要求',
  requiredCertificates: '资质证书要求',
  certificateName: '证书名称',
  certificateLevel: '证书等级',
  isMandatory: '是否必须',
  validityPeriod: '有效期要求',
  bizPerformanceRequirements: '业绩要求',
  projectCount: '项目数量',
  contractAmount: '合同金额',
  timeLimit: '时间限制',
  proofMaterials: '证明材料',
  personnelRequirements: '人员要求',
  position: '岗位',
  count: '人数',
  qualification: '资质要求',
  serviceLocation: '服务地点',
  serviceRequirements: '服务要求',
  winnerCount: '中标人数量',
  winnerSelectionMethod: '中标人确定方法',
  paymentMethod: '付款方式',
  paymentTerms: '付款条款',
  bidSecurity: '投标保证金',
  amount: '金额',
  bidSecurityPaymentMethod: '缴纳方式',
  deadline: '截止时间',
  returnConditions: '退还条件',
  bidValidityPeriod: '投标有效期',
  
  // 评分标准
  evaluationCriteria: '评分标准',
  seq: '序号',
  category: '评分大类',
  totalScore: '总分',
  categoryType: '类型',
  items: '评分细项',
  subItem: '评分项',
  itemScore: '分值',
  rule: '评分细则',
  basis: '评分依据',
  techDocRef: '技术文档引用',
  techScoring: '技术评分',
  businessScoring: '商务评分',
  priceScoring: '价格评分',
  scoringMethod: '评分方法',
  formula: '计算公式',
  scoringItems: '评分项列表',
  itemName: '评分项名称',
  weight: '权重',
  maxScore: '满分',
  scoreDetails: '评分细则',
  
  // 废标风险
  riskType: '风险类型',
  description: '风险描述',
  sourceText: '原文条款',
  severity: '严重程度',
  disqualificationRules: '废标条款',
  majorDeviationRules: '重大偏离情形',
  bidRestrictions: '投标限制',
  integrityRequirements: '诚信要求',
  legalCompliance: '法律合规',
  
  // 投标文件要求
  documentStructure: '文件组成',
  volumeName: '册/卷名称',
  sections: '章节',
  sectionName: '章节名称',
  requiredDocuments: '所需文件',
  formatRequirements: '格式要求',
  bindingMethod: '装订方式',
  copiesCount: '份数',
  electronicFormat: '电子版格式',
  sealingRequirements: '密封要求',
  signatureRequirements: '签章要求',
  submissionRequirements: '递交要求',
  submissionLocation: '递交地点',
  submissionMethod: '递交方式',
  
  // 其他重要信息
  specialRequirements: '特殊要求',
  notes: '注意事项',
  attachments: '附件清单',
  
  // 元数据
  extractionMetadata: '提取元数据',
  extractionTime: '提取时间',
  documentName: '文档名称',
  documentPages: '文档页数',
  extractionModel: '提取模型',
  confidenceScore: '置信度',
  strategy: '提取策略',
  segmentCount: '分段数量',
  totalTokens: '总Token数',
  extractionTimeMs: '提取耗时',
  
  // 补充：带空格的字段名映射（LLM 可能返回的格式）
  'Parameter Name': '参数名称',
  'Required Value': '要求值',
  'Is Key Parameter': '是否关键参数',
  'Deviation Allowed': '是否允许偏离',
  'Module Code': '模块编码',
  'Module Name': '模块名称',
  'Demand Details': '需求详情',
  'Requirement Details': '要求详情',
  'Payment Method': '付款方式',
  'Return Conditions': '退还条件',
  'Winner Count': '中标人数量',
  'Payment Terms': '付款条款',
  'Service Location': '服务地点',
  'Bid Validity Period': '投标有效期',
  'Bidder Qualification': '投标人资格要求',
  'Basic Qualification': '基本资格要求',
  'Required Certificates': '资质证书要求',
  'Is Mandatory': '是否必须',
  'Validity Period': '有效期要求',
  'Certificate Name': '证书名称',
  'Certificate Level': '证书等级',
  'Personnel Requirements': '人员要求',
  'Performance Requirements': '业绩要求',
  'Time Limit': '时间限制',
  'Project Type': '项目类型',
  'Project Count': '项目数量',
  'Contract Amount': '合同金额',
  'Proof Materials': '证明材料',
  'Service Requirements': '服务要求',
  'Winner Selection Method': '中标人确定方法',
  'Document Structure': '文件组成',
  'Section Name': '章节名称',
  'Required Documents': '所需文件',
  'Volume Name': '册/卷名称',
  'Format Requirements': '格式要求',
  'Copies Count': '份数',
  'Binding Method': '装订方式',
  'Electronic Format': '电子版格式',
  'Sealing Requirements': '密封要求',
  'Signature Requirements': '签章要求',
  'Submission Requirements': '递交要求',
  'Submission Method': '递交方式',
  'Submission Location': '递交地点',
  'Construction Goals': '建设目标',
  'Construction Scope': '建设范围',
  'Business Requirements': '业务需求',
  'Construction Background': '建设背景',
  'Special Requirements': '特殊要求',
};

// 下划线命名到驼峰命名的映射
const SNAKE_TO_CAMEL_MAP: Record<string, string> = {
  project_basic_info: 'projectBasicInfo',
  time_schedule: 'timeSchedule',
  core_tech_demand: 'coreTechDemand',
  business_requirements: 'businessRequirements',
  scoring_standard: 'scoringStandard',
  disqualification_risks: 'disqualificationRisks',
  bidding_document_requirements: 'biddingDocumentRequirements',
  project_background: 'projectBackground',
  other_important_info: 'otherImportantInfo',
  extraction_metadata: 'extractionMetadata',
  project_name: 'projectName',
  project_number: 'projectNumber',
  purchase_unit: 'purchaseUnit',
  purchase_unit_contact: 'purchaseUnitContact',
  purchase_unit_phone: 'purchaseUnitPhone',
  purchase_unit_email: 'purchaseUnitEmail',
  purchase_unit_address: 'purchaseUnitAddress',
  project_type: 'projectType',
  procurement_method: 'procurementMethod',
  project_budget: 'projectBudget',
  budget_source: 'budgetSource',
  budget_approval: 'budgetApproval',
  project_cycle: 'projectCycle',
  delivery_period: 'deliveryPeriod',
  warranty_period: 'warrantyPeriod',
  bid_publish_date: 'bidPublishDate',
  bid_document_sale_start: 'bidDocumentSaleStart',
  bid_document_sale_end: 'bidDocumentSaleEnd',
  question_deadline: 'questionDeadline',
  answer_publish_date: 'answerPublishDate',
  site_visit_date: 'siteVisitDate',
  bid_submission_deadline: 'bidSubmissionDeadline',
  bid_opening_date: 'bidOpeningDate',
  bid_opening_location: 'bidOpeningLocation',
  evaluation_period: 'evaluationPeriod',
  result_publicity_date: 'resultPublicityDate',
  construction_background: 'constructionBackground',
  construction_goals: 'constructionGoals',
  construction_scope: 'constructionScope',
  current_status: 'currentStatus',
  system_upgrade_demands: 'systemUpgradeDemands',
  module_name: 'moduleName',
  module_code: 'moduleCode',
  demand_details: 'demandDetails',
  technical_parameters: 'technicalParameters',
  parameter_name: 'parameterName',
  required_value: 'requiredValue',
  is_key_parameter: 'isKeyParameter',
  deviation_allowed: 'deviationAllowed',
  professional_tech_requirements: 'professionalTechRequirements',
  requirement_details: 'requirementDetails',
  tech_solution_requirements: 'techSolutionRequirements',
  tech_performance_requirements: 'techPerformanceRequirements',
  requirement_name: 'requirementName',
  requirement_value: 'requirementValue',
  bidder_qualification: 'bidderQualification',
  basic_qualification: 'basicQualification',
  required_certificates: 'requiredCertificates',
  certificate_name: 'certificateName',
  certificate_level: 'certificateLevel',
  is_mandatory: 'isMandatory',
  validity_period: 'validityPeriod',
  biz_performance_requirements: 'bizPerformanceRequirements',
  project_count: 'projectCount',
  contract_amount: 'contractAmount',
  time_limit: 'timeLimit',
  proof_materials: 'proofMaterials',
  personnel_requirements: 'personnelRequirements',
  service_location: 'serviceLocation',
  service_requirements: 'serviceRequirements',
  winner_count: 'winnerCount',
  winner_selection_method: 'winnerSelectionMethod',
  payment_method: 'paymentMethod',
  payment_terms: 'paymentTerms',
  bid_security: 'bidSecurity',
  return_conditions: 'returnConditions',
  bid_validity_period: 'bidValidityPeriod',
  evaluation_criteria: 'evaluationCriteria',
  total_score: 'totalScore',
  category_type: 'categoryType',
  item_score: 'itemScore',
  tech_doc_ref: 'techDocRef',
  tech_scoring: 'techScoring',
  business_scoring: 'businessScoring',
  price_scoring: 'priceScoring',
  scoring_method: 'scoringMethod',
  scoring_items: 'scoringItems',
  item_name: 'itemName',
  max_score: 'maxScore',
  score_details: 'scoreDetails',
  risk_type: 'riskType',
  source_text: 'sourceText',
  disqualification_rules: 'disqualificationRules',
  major_deviation_rules: 'majorDeviationRules',
  bid_restrictions: 'bidRestrictions',
  integrity_requirements: 'integrityRequirements',
  legal_compliance: 'legalCompliance',
  document_structure: 'documentStructure',
  volume_name: 'volumeName',
  section_name: 'sectionName',
  required_documents: 'requiredDocuments',
  format_requirements: 'formatRequirements',
  binding_method: 'bindingMethod',
  copies_count: 'copiesCount',
  electronic_format: 'electronicFormat',
  sealing_requirements: 'sealingRequirements',
  signature_requirements: 'signatureRequirements',
  submission_requirements: 'submissionRequirements',
  submission_location: 'submissionLocation',
  submission_method: 'submissionMethod',
  special_requirements: 'specialRequirements',
  extraction_time: 'extractionTime',
  document_name: 'documentName',
  document_pages: 'documentPages',
  extraction_model: 'extractionModel',
  confidence_score: 'confidenceScore',
  strategy: 'strategy',
  segment_count: 'segmentCount',
  total_tokens: 'totalTokens',
  extraction_time_ms: 'extractionTimeMs',
};

// 获取字段的中文名称（增强版：支持多种命名格式）
function getFieldLabel(key: string): string {
  // 1. 直接匹配
  if (FIELD_LABELS[key]) {
    return FIELD_LABELS[key];
  }
  
  // 2. 转换为驼峰命名后匹配
  const camelKey = key
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())  // "Parameter Name" -> "parameterName"
    .replace(/^(.)/, (_, c) => c.toLowerCase());    // 首字母小写
  if (FIELD_LABELS[camelKey]) {
    return FIELD_LABELS[camelKey];
  }
  
  // 3. 转换为下划线命名后匹配
  const snakeKey = key
    .replace(/([A-Z])/g, '_$1')  // 驼峰转下划线
    .replace(/\s+/g, '_')        // 空格转下划线
    .toLowerCase();
  const mappedCamelKey = SNAKE_TO_CAMEL_MAP[snakeKey];
  if (mappedCamelKey && FIELD_LABELS[mappedCamelKey]) {
    return FIELD_LABELS[mappedCamelKey];
  }
  
  // 4. 尝试直接用下划线映射
  if (SNAKE_TO_CAMEL_MAP[key]) {
    const mapped = SNAKE_TO_CAMEL_MAP[key];
    if (FIELD_LABELS[mapped]) {
      return FIELD_LABELS[mapped];
    }
  }
  
  // 5. 最后返回格式化后的key（首字母大写，下划线/空格转空格）
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

// 规范化数据：将下划线命名转换为驼峰命名
function normalizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => normalizeData(item));
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    const camelKey = SNAKE_TO_CAMEL_MAP[key] || key;
    result[camelKey] = normalizeData(value);
  }
  return result;
}

interface ExtractionStatus {
  isExtracting: boolean;
  progress: string;
  error: string | null;
}

export default function TenderExtractionPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [rawData, setRawData] = useState<any>(null);
  const [dbRecord, setDbRecord] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(Object.keys(SECTION_CONFIG)));
  const [showRawJson, setShowRawJson] = useState(false);
  const [status, setStatus] = useState<ExtractionStatus>({
    isExtracting: false,
    progress: '',
    error: null,
  });
  const [hasDocument, setHasDocument] = useState(false);

  const loadExtractionResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/extract-tender`);
      const data = await response.json();

      if (data.success && data.data.hasResult) {
        setDbRecord(data.data.extractionResult);
        const rawResult = data.data.extractionResult.full_extraction_result || data.data.extractionResult;
        setRawData(normalizeData(rawResult));
      }
      setHasDocument(true);
    } catch (error) {
      console.error('加载提取结果失败:', error);
    }
  }, [projectId]);

  useEffect(() => {
    loadExtractionResult();
  }, [loadExtractionResult]);

  const handleExtract = async () => {
    setStatus({ isExtracting: true, progress: '正在提取...', error: null });

    try {
      const response = await fetch(`/api/projects/${projectId}/extract-tender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (data.success) {
        setRawData(normalizeData(data.data.llmRawData));
        setDbRecord(data.data.savedResult);
        setStatus({ isExtracting: false, progress: '提取完成', error: null });
      } else {
        setStatus({ isExtracting: false, progress: '', error: data.error });
      }
    } catch (error) {
      setStatus({
        isExtracting: false,
        progress: '',
        error: error instanceof Error ? error.message : '提取失败',
      });
    }
  };

  const handleExport = () => {
    if (!rawData) return;

    const blob = new Blob([JSON.stringify(rawData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `招标文档提取结果_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // 渲染字段值（带中文标签）
  const renderFieldValue = (key: string, value: any, depth: number = 0): React.ReactNode => {
    const label = getFieldLabel(key);
    
    if (value === null || value === undefined) {
      return (
        <div className="py-1 flex items-start gap-2">
          <span className="text-gray-600 font-medium min-w-[120px]">{label}</span>
          <span className="text-gray-400">-</span>
        </div>
      );
    }
    
    if (typeof value === 'boolean') {
      return (
        <div className="py-1 flex items-start gap-2">
          <span className="text-gray-600 font-medium min-w-[120px]">{label}</span>
          <Badge variant={value ? 'default' : 'secondary'}>{value ? '是' : '否'}</Badge>
        </div>
      );
    }
    
    if (typeof value === 'number') {
      return (
        <div className="py-1 flex items-start gap-2">
          <span className="text-gray-600 font-medium min-w-[120px]">{label}</span>
          <span className="text-blue-600 font-medium">{value}</span>
        </div>
      );
    }
    
    if (typeof value === 'string') {
      return (
        <div className="py-1 flex items-start gap-2">
          <span className="text-gray-600 font-medium min-w-[120px] shrink-0">{label}</span>
          <span className="text-gray-800">{value || '-'}</span>
        </div>
      );
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return (
          <div className="py-1 flex items-start gap-2">
            <span className="text-gray-600 font-medium min-w-[120px]">{label}</span>
            <span className="text-gray-400">暂无</span>
          </div>
        );
      }
      
      // 检查是否是简单字符串数组
      if (typeof value[0] === 'string') {
        return (
          <div className="py-2">
            <span className="text-gray-600 font-medium block mb-2">{label}</span>
            <ul className="list-disc list-inside space-y-1 pl-2">
              {value.map((item, idx) => (
                <li key={idx} className="text-gray-700">{item}</li>
              ))}
            </ul>
          </div>
        );
      }
      
      // 对象数组 - 表格展示
      return (
        <div className="py-2">
          <span className="text-gray-600 font-medium block mb-2">{label}（{value.length}项）</span>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableBody>
                {value.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="bg-muted/30 font-medium w-[60px]">{idx + 1}</TableCell>
                    <TableCell>
                      {typeof item === 'object' ? renderObjectFields(item) : String(item)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }
    
    if (typeof value === 'object') {
      return (
        <div className="py-2">
          <span className="text-gray-600 font-medium block mb-2">{label}</span>
          <div className="bg-muted/20 rounded-lg p-3">
            {renderObjectFields(value)}
          </div>
        </div>
      );
    }
    
    return String(value);
  };

  // 渲染对象字段
  const renderObjectFields = (obj: any): React.ReactNode => {
    if (!obj || typeof obj !== 'object') return null;
    
    const entries = Object.entries(obj);
    if (entries.length === 0) return <span className="text-gray-400">暂无数据</span>;
    
    return (
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <div key={key}>
            {renderFieldValue(key, value)}
          </div>
        ))}
      </div>
    );
  };

  // 渲染分段卡片（优化版）
  const renderSectionCard = (key: string, data: any) => {
    const config = SECTION_CONFIG[key as keyof typeof SECTION_CONFIG];
    if (!config) return null;
    
    const isExpanded = expandedSections.has(key);
    const Icon = config.icon;
    
    // 计算数据量
    const getItemCount = (obj: any): number => {
      if (!obj || typeof obj !== 'object') return 1;
      if (Array.isArray(obj)) return obj.length;
      return Object.keys(obj).filter(k => obj[k] !== null && obj[k] !== undefined).length;
    };
    
    const itemCount = getItemCount(data);
    
    return (
      <Card key={key} className="overflow-hidden">
        <CardHeader 
          className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
          onClick={() => toggleSection(key)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <CardTitle className="text-base">{config.title}</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {itemCount} 项
              </Badge>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[500px]">
              <div className="py-2">
                {renderSectionContent(key, data)}
              </div>
            </ScrollArea>
          </CardContent>
        )}
      </Card>
    );
  };

  // 根据分段类型渲染特定内容
  const renderSectionContent = (key: string, data: any): React.ReactNode => {
    switch (key) {
      case 'projectBasicInfo':
        return <ProjectBasicInfoSection data={data} />;
      case 'timeSchedule':
        return <TimeScheduleSection data={data} />;
      case 'coreTechDemand':
        return <TechDemandSection data={data} />;
      case 'businessRequirements':
        return <BusinessRequirementsSection data={data} />;
      case 'scoringStandard':
        return <ScoringStandardSection data={data} />;
      case 'disqualificationRisks':
        return <DisqualificationRisksSection data={data} />;
      case 'biddingDocumentRequirements':
        return <BiddingDocumentSection data={data} />;
      case 'projectBackground':
        return <ProjectBackgroundSection data={data} />;
      case 'otherImportantInfo':
        return <OtherInfoSection data={data} />;
      default:
        return renderObjectFields(data);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回项目
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">招标文档提取结果</h1>
            <p className="text-muted-foreground">智能提取招标文档关键信息</p>
          </div>
        </div>

        <div className="flex gap-2">
          {rawData && (
            <>
              <Button variant="outline" onClick={() => setShowRawJson(!showRawJson)}>
                <FileText className="h-4 w-4 mr-2" />
                {showRawJson ? '隐藏JSON' : '查看JSON'}
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                导出
              </Button>
            </>
          )}
          <Button
            onClick={handleExtract}
            disabled={status.isExtracting || !hasDocument}
          >
            {status.isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                提取中...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {rawData ? '重新提取' : '开始提取'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 提取进度 */}
      {status.isExtracting && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{status.progress}</span>
              </div>
              <Progress value={50} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 错误提示 */}
      {status.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{status.error}</AlertDescription>
        </Alert>
      )}

      {/* 提取元数据 */}
      {dbRecord && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">文档:</span>
                <span className="font-medium">{dbRecord.document_name || '未命名'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">评分项:</span>
                <span className="font-medium">{dbRecord.item_count || 0} 个</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-muted-foreground">风险项:</span>
                <span className="font-medium">{dbRecord.risk_count || 0} 个</span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-red-500" />
                <span className="text-muted-foreground">总分:</span>
                <span className="font-medium">{dbRecord.total_score || 0} 分</span>
              </div>
              {dbRecord.extraction_time_ms && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">耗时:</span>
                  <span className="font-medium">{(dbRecord.extraction_time_ms / 1000).toFixed(1)}s</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 提取结果分段展示 */}
      {rawData ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">提取结果详情</h2>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setExpandedSections(new Set(Object.keys(SECTION_CONFIG)))}
              >
                全部展开
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setExpandedSections(new Set())}
              >
                全部折叠
              </Button>
            </div>
          </div>
          
          <div className="grid gap-4">
            {Object.keys(SECTION_CONFIG).map((key) => {
              const data = rawData[key];
              if (data !== undefined && data !== null && 
                  (typeof data === 'object' && Object.keys(data).length > 0 || 
                   Array.isArray(data) && data.length > 0)) {
                return renderSectionCard(key, data);
              }
              return null;
            })}
          </div>
        </div>
      ) : (
        !status.isExtracting && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>尚未提取招标文档信息</p>
                <p className="text-sm mt-2">点击"开始提取"按钮进行智能提取</p>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* 原始JSON查看（可切换） */}
      {rawData && showRawJson && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">原始JSON数据</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <pre className="text-xs bg-muted/30 p-4 rounded-lg overflow-auto font-mono">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ 分段内容渲染组件 ============

/** 项目基本信息分段 */
function ProjectBasicInfoSection({ data }: { data: any }) {
  const fields = [
    { key: 'projectName', icon: FileText },
    { key: 'projectNumber', icon: FileText },
    { key: 'purchaseUnit', icon: Building2 },
    { key: 'purchaseUnitContact', icon: Users },
    { key: 'purchaseUnitPhone', icon: null },
    { key: 'purchaseUnitEmail', icon: null },
    { key: 'purchaseUnitAddress', icon: null },
    { key: 'projectType', icon: null },
    { key: 'procurementMethod', icon: null },
    { key: 'projectBudget', icon: DollarSign },
    { key: 'budgetSource', icon: null },
    { key: 'budgetApproval', icon: null },
    { key: 'projectCycle', icon: Calendar },
    { key: 'deliveryPeriod', icon: Clock },
    { key: 'warrantyPeriod', icon: null },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {fields.map(({ key }) => (
        <div key={key} className="space-y-1">
          <p className="text-sm text-muted-foreground">{getFieldLabel(key)}</p>
          <p className="font-medium">{data[key] || <span className="text-muted-foreground">-</span>}</p>
        </div>
      ))}
    </div>
  );
}

/** 时间节点分段 */
function TimeScheduleSection({ data }: { data: any }) {
  const timeFields = [
    { key: 'bidPublishDate', label: '招标公告发布', critical: false },
    { key: 'bidDocumentSaleStart', label: '文件发售开始', critical: false },
    { key: 'bidDocumentSaleEnd', label: '文件发售结束', critical: false },
    { key: 'questionDeadline', label: '提问截止时间', critical: false },
    { key: 'answerPublishDate', label: '答疑发布时间', critical: false },
    { key: 'siteVisitDate', label: '现场踏勘时间', critical: false },
    { key: 'bidSubmissionDeadline', label: '投标截止时间', critical: true },
    { key: 'bidOpeningDate', label: '开标时间', critical: true },
    { key: 'bidOpeningLocation', label: '开标地点', critical: false },
    { key: 'evaluationPeriod', label: '评标周期', critical: false },
    { key: 'resultPublicityDate', label: '结果公示时间', critical: false },
  ];

  return (
    <div className="space-y-3">
      {timeFields.map(({ key, label, critical }) => (
        <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
          <span className="text-gray-600">{label}</span>
          <span className={`font-medium ${critical ? 'text-red-600' : ''}`}>
            {data[key] || <span className="text-muted-foreground">-</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 技术需求分段 */
function TechDemandSection({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* 系统功能需求 */}
      {data.systemUpgradeDemands && data.systemUpgradeDemands.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-purple-500" />
            系统功能需求
          </h4>
          <div className="space-y-3">
            {data.systemUpgradeDemands.map((module: any, idx: number) => (
              <div key={idx} className="border-l-2 border-purple-300 pl-4 py-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">{module.moduleName}</span>
                  {module.priority && (
                    <Badge variant={module.priority === '必须' ? 'destructive' : 'secondary'}>
                      {module.priority}
                    </Badge>
                  )}
                </div>
                {module.demandDetails && module.demandDetails.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    {module.demandDetails.map((detail: string, i: number) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 专业技术要求 */}
      {data.professionalTechRequirements?.requirementDetails?.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">专业技术能力要求</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {data.professionalTechRequirements.requirementDetails.map((req: string, idx: number) => (
              <li key={idx}>{req}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 技术参数 */}
      {data.technicalParameters && data.technicalParameters.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">技术参数要求</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>参数名称</TableHead>
                <TableHead>要求值</TableHead>
                <TableHead>关键参数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.technicalParameters.map((param: any, idx: number) => (
                <TableRow key={idx} className={param.isKeyParameter ? 'bg-amber-50' : ''}>
                  <TableCell className="font-medium">
                    {param.isKeyParameter && <span className="text-red-500 mr-1">★</span>}
                    {param.parameterName}
                  </TableCell>
                  <TableCell>{param.requiredValue}</TableCell>
                  <TableCell>
                    {param.isKeyParameter ? (
                      <Badge variant="destructive">关键</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 性能指标 */}
      {data.performanceRequirements && data.performanceRequirements.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">性能指标要求</h4>
          <div className="grid grid-cols-2 gap-3">
            {data.performanceRequirements.map((req: any, idx: number) => (
              <div key={idx} className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground">{req.requirementName}</p>
                <p className="font-semibold">{req.requirementValue}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 商务要求分段 */
function BusinessRequirementsSection({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* 投标人资格要求 */}
      {data.bidderQualification && (
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-500" />
            投标人资格要求
          </h4>
          
          {/* 基本资格 */}
          {data.bidderQualification.basicQualification?.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-600 mb-2">基本资格要求</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {data.bidderQualification.basicQualification.map((req: string, idx: number) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* 资质证书 */}
          {data.bidderQualification.requiredCertificates?.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-600 mb-2">必须提供的资质证明</p>
              <div className="space-y-2">
                {data.bidderQualification.requiredCertificates.map((cert: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                    <Checkbox checked={false} />
                    <span>{cert.certificateName}</span>
                    {cert.isMandatory && <Badge variant="destructive" className="text-xs">必须</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 业绩要求 */}
          {data.bidderQualification.performanceRequirements && (
            <div className="mb-4 p-3 bg-muted/20 rounded-lg">
              <p className="text-sm font-medium text-gray-600 mb-2">业绩要求</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {data.bidderQualification.performanceRequirements.projectCount && (
                  <div>
                    <span className="text-muted-foreground">项目数量：</span>
                    <span className="font-medium">{data.bidderQualification.performanceRequirements.projectCount} 个</span>
                  </div>
                )}
                {data.bidderQualification.performanceRequirements.contractAmount && (
                  <div>
                    <span className="text-muted-foreground">合同金额：</span>
                    <span className="font-medium">{data.bidderQualification.performanceRequirements.contractAmount}</span>
                  </div>
                )}
                {data.bidderQualification.performanceRequirements.timeLimit && (
                  <div>
                    <span className="text-muted-foreground">时间限制：</span>
                    <span className="font-medium">{data.bidderQualification.performanceRequirements.timeLimit}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 人员要求 */}
          {data.bidderQualification.personnelRequirements?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">人员要求</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>岗位</TableHead>
                    <TableHead>人数</TableHead>
                    <TableHead>资质要求</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bidderQualification.personnelRequirements.map((person: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell>{person.position}</TableCell>
                      <TableCell>{person.count}</TableCell>
                      <TableCell className="text-sm">{person.qualification?.join('、')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* 投标保证金 */}
      {data.bidSecurity && (
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            投标保证金
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/20 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">保证金金额</p>
              <p className="font-semibold">{data.bidSecurity.amount || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">缴纳方式</p>
              <p className="font-semibold">{data.bidSecurity.paymentMethod || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">缴纳截止</p>
              <p className="font-semibold">{data.bidSecurity.deadline || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">退还条件</p>
              <p className="font-semibold">{data.bidSecurity.returnConditions?.length > 0 ? '详见条款' : '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* 其他商务信息 */}
      <div className="grid grid-cols-3 gap-4 p-3 bg-muted/20 rounded-lg">
        <div>
          <p className="text-sm text-muted-foreground">服务地点</p>
          <p className="font-medium">{data.serviceLocation || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">中标人数量</p>
          <p className="font-medium">{data.winnerCount || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">投标有效期</p>
          <p className="font-medium">{data.bidValidityPeriod || '-'}</p>
        </div>
      </div>
    </div>
  );
}

/** 评分标准分段 */
function ScoringStandardSection({ data }: { data: any }) {
  // 处理新的 evaluationCriteria 格式
  if (data.evaluationCriteria && data.evaluationCriteria.length > 0) {
    return (
      <div className="space-y-4">
        {data.evaluationCriteria.map((criteria: any, idx: number) => (
          <Card key={idx}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{criteria.seq}</Badge>
                  <span className="font-semibold">{criteria.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={criteria.categoryType === 'technical' ? 'default' : criteria.categoryType === 'business' ? 'secondary' : 'outline'}>
                    {criteria.categoryType === 'technical' ? '技术' : criteria.categoryType === 'business' ? '商务' : '价格'}
                  </Badge>
                  <span className="text-lg font-bold text-red-600">{criteria.totalScore}分</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {criteria.items && criteria.items.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>评分项</TableHead>
                      <TableHead className="w-[80px]">分值</TableHead>
                      <TableHead>评分细则</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {criteria.items.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.subItem}</TableCell>
                        <TableCell className="text-center font-semibold">{item.itemScore}</TableCell>
                        <TableCell className="text-sm">
                          <p>{item.rule}</p>
                          {item.basis && <p className="text-muted-foreground mt-1">依据：{item.basis}</p>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // 兼容旧格式
  return <div className="text-muted-foreground">暂无评分标准数据</div>;
}

/** 废标风险分段 */
function DisqualificationRisksSection({ data }: { data: any }) {
  if (Array.isArray(data) && data.length > 0) {
    return (
      <div className="space-y-3">
        {data.map((risk: any, idx: number) => (
          <Alert key={idx} variant={risk.severity === 'critical' ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="flex items-center gap-2">
              <Badge variant={risk.severity === 'critical' ? 'destructive' : risk.severity === 'high' ? 'default' : 'secondary'}>
                {risk.severity === 'critical' ? '严重' : risk.severity === 'high' ? '高' : risk.severity === 'medium' ? '中' : '低'}
              </Badge>
              {risk.riskType}
            </AlertTitle>
            <AlertDescription>
              <p className="mt-2">{risk.description}</p>
              <p className="mt-1 text-sm text-muted-foreground">原文：{risk.sourceText}</p>
            </AlertDescription>
          </Alert>
        ))}
      </div>
    );
  }
  
  return <p className="text-muted-foreground">暂无废标风险数据</p>;
}

/** 投标文件要求分段 */
function BiddingDocumentSection({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* 文件组成 */}
      {data.documentStructure && data.documentStructure.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">投标文件组成</h4>
          {data.documentStructure.map((volume: any, vIdx: number) => (
            <div key={vIdx} className="mb-4 last:mb-0">
              <p className="font-medium text-gray-700 mb-2">{volume.volumeName}</p>
              {volume.sections && volume.sections.map((section: any, sIdx: number) => (
                <div key={sIdx} className="ml-4 mb-2">
                  <p className="text-sm font-medium">{section.sectionName}</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground ml-2">
                    {section.requiredDocuments && section.requiredDocuments.map((doc: string, dIdx: number) => (
                      <li key={dIdx}>{doc}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 格式要求 */}
      {data.formatRequirements && (
        <div>
          <h4 className="font-semibold mb-3">格式要求</h4>
          <div className="grid grid-cols-3 gap-4 p-3 bg-muted/20 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">装订方式</p>
              <p className="font-medium">{data.formatRequirements.bindingMethod || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">份数</p>
              <p className="font-medium">{data.formatRequirements.copiesCount || '-'} 份</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">电子版格式</p>
              <p className="font-medium">{data.formatRequirements.electronicFormat || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* 密封和签章要求 */}
      <div className="grid md:grid-cols-2 gap-4">
        {data.sealingRequirements && data.sealingRequirements.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">密封要求</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.sealingRequirements.map((req: string, idx: number) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </div>
        )}
        {data.signatureRequirements && data.signatureRequirements.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">签章要求</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.signatureRequirements.map((req: string, idx: number) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** 项目背景分段 */
function ProjectBackgroundSection({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.constructionBackground && (
        <div>
          <h4 className="font-semibold mb-2">建设背景</h4>
          <p className="text-sm text-gray-600">{data.constructionBackground}</p>
        </div>
      )}
      {data.constructionGoals && data.constructionGoals.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">建设目标</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {data.constructionGoals.map((goal: string, idx: number) => (
              <li key={idx}>{goal}</li>
            ))}
          </ul>
        </div>
      )}
      {data.constructionScope && (
        <div>
          <h4 className="font-semibold mb-2">建设范围</h4>
          <p className="text-sm text-gray-600">{data.constructionScope}</p>
        </div>
      )}
      {data.currentStatus && (
        <div>
          <h4 className="font-semibold mb-2">现状描述</h4>
          <p className="text-sm text-gray-600">{data.currentStatus}</p>
        </div>
      )}
      {data.businessRequirements && data.businessRequirements.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">业务需求</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {data.businessRequirements.map((req: string, idx: number) => (
              <li key={idx}>{req}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 其他重要信息分段 */
function OtherInfoSection({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.specialRequirements && data.specialRequirements.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">特殊要求</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {data.specialRequirements.map((req: string, idx: number) => (
              <li key={idx}>{req}</li>
            ))}
          </ul>
        </div>
      )}
      {data.notes && data.notes.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">注意事项</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {data.notes.map((note: string, idx: number) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {data.attachments && data.attachments.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">附件清单</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {data.attachments.map((att: string, idx: number) => (
              <li key={idx}>{att}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
