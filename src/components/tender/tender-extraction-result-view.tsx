/**
 * 招标文档提取结果展示组件
 * 严格按照 AI-Bid-TENDER-EXTRACTION-SCHEMA.md 规范实现
 */

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  TenderDocumentExtractionResult,
  ProjectBasicInfo,
  TimeSchedule,
  CoreTechDemand,
  BusinessRequirements,
  ScoringStandard,
  ComplianceRequirement,
  BiddingDocumentRequirement,
  ProjectBackground,
} from '@/types/tender-extraction';
import {
  Calendar,
  Building2,
  FileText,
  AlertTriangle,
  Clock,
  DollarSign,
  Users,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';

/**
 * 主展示组件
 */
interface TenderExtractionResultViewProps {
  data: TenderDocumentExtractionResult;
}

export function TenderExtractionResultView({ data }: TenderExtractionResultViewProps) {
  const confidencePercent = Math.round(data.extraction_metadata.confidence_score * 100);

  return (
    <div className="space-y-6">
      {/* 元数据卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">提取结果概览</CardTitle>
            <Badge variant={confidencePercent >= 80 ? 'default' : confidencePercent >= 60 ? 'secondary' : 'destructive'}>
              置信度 {confidencePercent}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">文档名称</p>
              <p className="font-medium">{data.extraction_metadata.document_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">文档页数</p>
              <p className="font-medium">{data.extraction_metadata.document_pages} 页</p>
            </div>
            <div>
              <p className="text-muted-foreground">提取时间</p>
              <p className="font-medium">
                {new Date(data.extraction_metadata.extraction_time).toLocaleString('zh-CN')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">提取模型</p>
              <p className="font-medium">{data.extraction_metadata.extraction_model}</p>
            </div>
          </div>
          <Progress value={confidencePercent} className="mt-4" />
        </CardContent>
      </Card>

      {/* Tab分组展示 */}
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 gap-2 h-auto">
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="timeline">时间节点</TabsTrigger>
          <TabsTrigger value="tech">技术需求</TabsTrigger>
          <TabsTrigger value="business">商务要求</TabsTrigger>
          <TabsTrigger value="scoring">评分标准</TabsTrigger>
          <TabsTrigger value="compliance">合规要求</TabsTrigger>
          <TabsTrigger value="documents">投标文件</TabsTrigger>
          <TabsTrigger value="background">项目背景</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="mt-4">
          <BasicInfoCard data={data.project_basic_info} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimeScheduleCard data={data.time_schedule} />
        </TabsContent>

        <TabsContent value="tech" className="mt-4">
          <TechDemandCard data={data.core_tech_demand} />
        </TabsContent>

        <TabsContent value="business" className="mt-4">
          <BusinessRequirementsCard data={data.business_requirements} />
        </TabsContent>

        <TabsContent value="scoring" className="mt-4">
          <ScoringStandardCard data={data.scoring_standard} />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <ComplianceCard data={data.key_compliance_requirements} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <BiddingDocumentCard data={data.bidding_document_requirements} />
        </TabsContent>

        <TabsContent value="background" className="mt-4">
          <ProjectBackgroundCard data={data.project_background} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * 项目基本信息卡片
 */
function BasicInfoCard({ data }: { data: ProjectBasicInfo }) {
  const infoItems = [
    { label: '项目名称', value: data.project_name, icon: FileText },
    { label: '项目编号', value: data.project_number, icon: FileText },
    { label: '采购单位', value: data.purchase_unit, icon: Building2 },
    { label: '联系人', value: data.purchase_unit_contact, icon: Users },
    { label: '联系电话', value: data.purchase_unit_phone, icon: null },
    { label: '邮箱', value: data.purchase_unit_email, icon: null },
    { label: '地址', value: data.purchase_unit_address, icon: null },
    { label: '项目类型', value: data.project_type, icon: null },
    { label: '采购方式', value: data.procurement_method, icon: null },
    { label: '项目预算', value: data.project_budget, icon: DollarSign },
    { label: '资金来源', value: data.budget_source, icon: null },
    { label: '服务期限', value: data.project_cycle, icon: Calendar },
    { label: '交付周期', value: data.delivery_period, icon: Clock },
    { label: '质保期', value: data.warranty_period, icon: CheckCircle2 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          项目基本信息
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {infoItems.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="font-medium">{item.value || <span className="text-muted-foreground">-</span>}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 时间节点卡片
 */
function TimeScheduleCard({ data }: { data: TimeSchedule }) {
  const timeItems = [
    { label: '招标公告发布', value: data.bid_publish_date, phase: '招标' },
    { label: '文件发售开始', value: data.bid_document_sale_start, phase: '招标' },
    { label: '文件发售结束', value: data.bid_document_sale_end, phase: '招标' },
    { label: '提问截止时间', value: data.question_deadline, phase: '答疑' },
    { label: '答疑发布时间', value: data.answer_publish_date, phase: '答疑' },
    { label: '现场踏勘时间', value: data.site_visit_date, phase: '答疑' },
    { label: '投标截止时间', value: data.bid_submission_deadline, phase: '投标', critical: true },
    { label: '开标时间', value: data.bid_opening_date, phase: '投标', critical: true },
    { label: '开标地点', value: data.bid_opening_location, phase: '投标' },
    { label: '评标周期', value: data.evaluation_period, phase: '评标' },
    { label: '结果公示时间', value: data.result_publicity_date, phase: '评标' },
  ];

  const phaseColors: Record<string, string> = {
    '招标': 'bg-blue-100 text-blue-700',
    '答疑': 'bg-amber-100 text-amber-700',
    '投标': 'bg-red-100 text-red-700',
    '评标': 'bg-green-100 text-green-700',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          时间节点
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* 时间轴 */}
          <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />
          
          <div className="space-y-4">
            {timeItems.map((item, idx) => (
              <div key={idx} className="relative flex items-start gap-4 pl-8">
                {/* 节点圆点 */}
                <div className={`absolute left-1.5 w-4 h-4 rounded-full border-2 ${
                  item.critical ? 'bg-red-500 border-red-500' : 'bg-background border-primary'
                }`} />
                
                {/* 内容 */}
                <div className="flex-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.label}</span>
                    {item.critical && (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={item.critical ? 'text-red-600 font-semibold' : ''}>
                      {item.value || '-'}
                    </span>
                    <Badge className={phaseColors[item.phase]} variant="outline">
                      {item.phase}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 技术需求卡片
 */
function TechDemandCard({ data }: { data: CoreTechDemand }) {
  return (
    <div className="space-y-4">
      {/* 系统功能需求 */}
      {data.system_upgrade_demands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">系统功能需求</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.system_upgrade_demands.map((module, idx) => (
                <div key={idx} className="border-l-2 border-primary pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">{module.module_name}</span>
                    {module.module_code && (
                      <Badge variant="outline">{module.module_code}</Badge>
                    )}
                    {module.priority && (
                      <Badge variant={module.priority === '必须' ? 'destructive' : 'secondary'}>
                        {module.priority}
                      </Badge>
                    )}
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {module.demand_details.map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 技术参数 */}
      {data.technical_parameters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">技术参数要求</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>参数名称</TableHead>
                  <TableHead>要求值</TableHead>
                  <TableHead>单位</TableHead>
                  <TableHead>关键参数</TableHead>
                  <TableHead>允许偏离</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.technical_parameters.map((param, idx) => (
                  <TableRow key={idx} className={param.is_key_parameter ? 'bg-amber-50' : ''}>
                    <TableCell className="font-medium">
                      {param.is_key_parameter && <span className="text-red-500 mr-1">★</span>}
                      {param.parameter_name}
                    </TableCell>
                    <TableCell>{param.required_value}</TableCell>
                    <TableCell>{param.unit || '-'}</TableCell>
                    <TableCell>
                      {param.is_key_parameter ? (
                        <CheckCircle2 className="h-4 w-4 text-amber-500" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {param.deviation_allowed ? (
                        <Badge variant="outline">允许</Badge>
                      ) : (
                        <Badge variant="destructive">不允许</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 专业技术要求 */}
      {data.professional_tech_requirements.requirement_details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">专业技术能力要求</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2">
              {data.professional_tech_requirements.requirement_details.map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 性能指标 */}
      {data.performance_requirements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">性能指标要求</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {data.performance_requirements.map((req, idx) => (
                <div key={idx} className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">{req.requirement_name}</p>
                  <p className="font-semibold">{req.requirement_value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * 商务要求卡片
 */
function BusinessRequirementsCard({ data }: { data: BusinessRequirements }) {
  return (
    <div className="space-y-4">
      {/* 投标人资格要求 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            投标人资格要求
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 基本资格 */}
          {data.bidder_qualification.basic_qualification.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">基本资格要求</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {data.bidder_qualification.basic_qualification.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 资质证书 */}
          {data.bidder_qualification.required_certificates.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">资质证书要求</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {data.bidder_qualification.required_certificates.map((cert, idx) => (
                  <div key={idx} className={`p-2 border rounded ${cert.is_mandatory ? 'border-red-300 bg-red-50' : ''}`}>
                    <p className="font-medium">{cert.certificate_name}</p>
                    {cert.certificate_level && (
                      <p className="text-sm text-muted-foreground">等级: {cert.certificate_level}</p>
                    )}
                    {cert.is_mandatory && <Badge variant="destructive" className="mt-1">必须</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 业绩要求 */}
          {data.bidder_qualification.performance_requirements && (
            <div>
              <h4 className="font-medium mb-2">业绩要求</h4>
              <div className="p-3 bg-muted rounded-lg">
                {data.bidder_qualification.performance_requirements.project_count && (
                  <p>项目数量: {data.bidder_qualification.performance_requirements.project_count} 个</p>
                )}
                {data.bidder_qualification.performance_requirements.contract_amount && (
                  <p>合同金额: {data.bidder_qualification.performance_requirements.contract_amount}</p>
                )}
                {data.bidder_qualification.performance_requirements.time_limit && (
                  <p>时间限制: {data.bidder_qualification.performance_requirements.time_limit}</p>
                )}
              </div>
            </div>
          )}

          {/* 人员要求 */}
          {data.bidder_qualification.personnel_requirements.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">人员要求</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>岗位</TableHead>
                    <TableHead>人数</TableHead>
                    <TableHead>资质要求</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bidder_qualification.personnel_requirements.map((person, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{person.position}</TableCell>
                      <TableCell>{person.count}</TableCell>
                      <TableCell>{person.qualification.join('、')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 保证金信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            投标保证金
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">保证金金额</p>
              <p className="font-semibold">{data.bid_security.amount || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">缴纳方式</p>
              <p className="font-semibold">{data.bid_security.payment_method || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">缴纳截止</p>
              <p className="font-semibold">{data.bid_security.deadline || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">退还条件</p>
              <p className="font-semibold">{data.bid_security.return_conditions.length > 0 ? '详见条款' : '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 其他商务信息 */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">服务地点</p>
              <p className="font-medium">{data.service_location || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">中标人数量</p>
              <p className="font-medium">{data.winner_count || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">投标有效期</p>
              <p className="font-medium">{data.bid_validity_period || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 评分标准卡片
 */
function ScoringStandardCard({ data }: { data: ScoringStandard }) {
  return (
    <div className="space-y-4">
      {/* 技术评分 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            技术评分（满分 {data.tech_scoring.total_score} 分）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>评分项</TableHead>
                <TableHead>权重</TableHead>
                <TableHead>满分</TableHead>
                <TableHead>评分细则</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tech_scoring.scoring_items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{item.item_name}</TableCell>
                  <TableCell>{item.weight}</TableCell>
                  <TableCell>{item.max_score}</TableCell>
                  <TableCell>
                    <ul className="list-disc list-inside text-sm">
                      {item.score_details.map((detail, i) => (
                        <li key={i}>{detail}</li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 商务评分 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            商务评分（满分 {data.business_scoring.total_score} 分）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.business_scoring.scoring_items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>评分项</TableHead>
                  <TableHead>权重</TableHead>
                  <TableHead>满分</TableHead>
                  <TableHead>评分细则</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.business_scoring.scoring_items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell>{item.weight}</TableCell>
                    <TableCell>{item.max_score}</TableCell>
                    <TableCell>
                      <ul className="list-disc list-inside text-sm">
                        {item.score_details.map((detail, i) => (
                          <li key={i}>{detail}</li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">暂无商务评分项</p>
          )}
        </CardContent>
      </Card>

      {/* 价格评分 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            价格评分（满分 {data.price_scoring.total_score} 分）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{data.price_scoring.scoring_method || '未说明评分方法'}</p>
          {data.price_scoring.formula && (
            <p className="text-sm mt-2 font-mono bg-muted p-2 rounded">
              计算公式: {data.price_scoring.formula}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 合规要求卡片（重点：废标条款）
 */
function ComplianceCard({ data }: { data: ComplianceRequirement }) {
  return (
    <div className="space-y-4">
      {/* 废标条款 - 重点标注 */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="font-semibold">⚠️ 废标条款（重点关注）</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 space-y-2">
            {data.disqualification_rules.map((rule, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-red-600 font-bold">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {/* 重大偏离 */}
      {data.major_deviation_rules.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="text-base text-amber-700">重大偏离情形</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.major_deviation_rules.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 投标限制 */}
      {data.bid_restrictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">投标限制</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {data.bid_restrictions.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 诚信要求 */}
      {data.integrity_requirements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">诚信要求</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {data.integrity_requirements.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * 投标文件要求卡片
 */
function BiddingDocumentCard({ data }: { data: BiddingDocumentRequirement }) {
  return (
    <div className="space-y-4">
      {/* 文件组成 */}
      {data.document_structure.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">投标文件组成</CardTitle>
          </CardHeader>
          <CardContent>
            {data.document_structure.map((volume, vIdx) => (
              <div key={vIdx} className="mb-4 last:mb-0">
                <h4 className="font-semibold mb-2">{volume.volume_name}</h4>
                {volume.sections.map((section, sIdx) => (
                  <div key={sIdx} className="ml-4 mb-2">
                    <p className="font-medium text-sm">{section.section_name}</p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground ml-2">
                      {section.required_documents.map((doc, dIdx) => (
                        <li key={dIdx}>{doc}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 格式要求 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">格式要求</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">装订方式</p>
              <p className="font-medium">{data.format_requirements.binding_method || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">份数</p>
              <p className="font-medium">{data.format_requirements.copies_count || '-'} 份</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">电子版格式</p>
              <p className="font-medium">{data.format_requirements.electronic_format || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 密封与签章 */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">密封要求</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.sealing_requirements.map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">签章要求</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.signature_requirements.map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * 项目背景卡片
 */
function ProjectBackgroundCard({ data }: { data: ProjectBackground }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4" />
          项目背景
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.construction_background && (
          <div>
            <h4 className="font-medium mb-2">建设背景</h4>
            <p className="text-sm text-muted-foreground">{data.construction_background}</p>
          </div>
        )}

        {data.construction_goals.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">建设目标</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.construction_goals.map((goal, idx) => (
                <li key={idx}>{goal}</li>
              ))}
            </ul>
          </div>
        )}

        {data.construction_scope && (
          <div>
            <h4 className="font-medium mb-2">建设范围</h4>
            <p className="text-sm text-muted-foreground">{data.construction_scope}</p>
          </div>
        )}

        {data.current_status && (
          <div>
            <h4 className="font-medium mb-2">现状描述</h4>
            <p className="text-sm text-muted-foreground">{data.current_status}</p>
          </div>
        )}

        {data.business_requirements.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">业务需求</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.business_requirements.map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TenderExtractionResultView;
