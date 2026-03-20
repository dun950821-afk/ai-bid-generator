'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Building2, Calendar, Settings, Target, AlertTriangle, FileCheck, Info,
  DollarSign, Users, Clock, AlertOctagon, BookOpen, FileText
} from 'lucide-react';

// 分段配置
const SECTION_CONFIG: Record<string, { title: string; icon: any; color: string; description: string }> = {
  projectBasicInfo: { title: '项目基本信息', icon: Building2, color: 'text-blue-600', description: '项目名称、采购单位、预算等基础信息' },
  projectBackground: { title: '项目背景', icon: BookOpen, color: 'text-gray-600', description: '建设背景、目标、范围和业务需求' },
  timeSchedule: { title: '时间节点', icon: Calendar, color: 'text-green-600', description: '投标截止、开标时间等关键日期' },
  coreTechDemand: { title: '核心技术需求', icon: Settings, color: 'text-purple-600', description: '技术参数、功能需求和方案要求' },
  businessRequirements: { title: '商务要求', icon: DollarSign, color: 'text-orange-600', description: '资格要求、保证金、付款方式等' },
  scoringStandard: { title: '评分标准', icon: Target, color: 'text-red-600', description: '技术、商务、价格评分细则' },
  disqualificationRisks: { title: '废标风险', icon: AlertOctagon, color: 'text-yellow-600', description: '可能导致废标的关键风险点' },
  biddingDocumentRequirements: { title: '投标文件要求', icon: FileCheck, color: 'text-cyan-600', description: '文件组成、格式、密封签章要求' },
  otherImportantInfo: { title: '其他重要信息', icon: Info, color: 'text-indigo-600', description: '特殊要求和注意事项' },
};

// 字段名中英文映射
const FIELD_LABELS: Record<string, string> = {
  projectName: '项目名称', projectNumber: '项目编号', purchaseUnit: '采购单位',
  purchaseUnitContact: '联系人', purchaseUnitPhone: '联系电话', purchaseUnitEmail: '电子邮箱',
  purchaseUnitAddress: '单位地址', projectType: '项目类型', procurementMethod: '采购方式',
  projectBudget: '项目预算', budgetSource: '资金来源', projectCycle: '服务期限',
  bidSubmissionDeadline: '投标截止时间', bidOpeningDate: '开标时间', bidOpeningLocation: '开标地点',
  constructionBackground: '建设背景', constructionGoals: '建设目标', constructionScope: '建设范围',
  moduleName: '模块名称', moduleCode: '模块编码', demandDetails: '需求详情', priority: '优先级',
  parameterName: '参数名称', requiredValue: '要求值', unit: '单位', isKeyParameter: '关键参数',
  deviationAllowed: '允许偏离', bidderQualification: '投标人资格要求', basicQualification: '基本资格要求',
  certificateName: '证书名称', isMandatory: '是否必须', amount: '金额', deadline: '截止时间',
  paymentMethod: '付款方式', serviceLocation: '服务地点', winnerCount: '中标人数量',
  bidValidityPeriod: '投标有效期', bidSecurity: '投标保证金', evaluationCriteria: '评分标准',
  category: '评分大类', totalScore: '总分', subItem: '评分项', itemScore: '分值', rule: '评分细则',
  riskType: '风险类型', description: '描述', sourceText: '原文条款', severity: '严重程度',
  documentStructure: '文件组成', volumeName: '册/卷名称', sections: '章节', sectionName: '章节名称',
  requiredDocuments: '所需文件', bindingMethod: '装订方式', copiesCount: '份数', electronicFormat: '电子版格式',
  sealingRequirements: '密封要求', signatureRequirements: '签章要求',
  specialRequirements: '特殊要求', notes: '注意事项', attachments: '附件清单',
};

// 获取字段的中文名称
function getFieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // 转换驼峰为空格分隔
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// 规范化数据
function normalizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(item => normalizeData(item));
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = normalizeData(value);
  }
  return result;
}

interface TenderExtractionViewProps {
  extractionResult: any;
  showCompact?: boolean; // 紧凑模式（用于首页选项卡）
}

export function TenderExtractionView({ extractionResult, showCompact = false }: TenderExtractionViewProps) {
  if (!extractionResult) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>暂无提取结果，请先上传并解析招标文档</p>
        </CardContent>
      </Card>
    );
  }

  // 规范化数据
  const data = normalizeData(extractionResult);
  const fullResult = data.fullExtractionResult || data;

  // 判断分段是否有数据
  const hasSectionData = (key: string): boolean => {
    const sectionData = fullResult[key];
    if (!sectionData) return false;
    if (Array.isArray(sectionData)) return sectionData.length > 0;
    if (typeof sectionData === 'object') {
      return Object.values(sectionData).some(v => v !== null && v !== undefined && 
        (typeof v !== 'object' || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)));
    }
    return false;
  };

  // 计算风险等级
  const risks = fullResult.disqualificationRisks || [];
  const riskStats = {
    critical: risks.filter((r: any) => r.severity === 'critical').length,
    high: risks.filter((r: any) => r.severity === 'high').length,
    total: risks.length,
  };

  return (
    <div className="space-y-4">
      {/* 快速统计 */}
      {showCompact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-blue-700">项目</span>
              </div>
              <p className="font-semibold text-blue-900 mt-1 truncate">
                {fullResult.projectBasicInfo?.projectName || '未命名'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-700">评分总分</span>
              </div>
              <p className="font-semibold text-green-900 mt-1">
                {fullResult.scoringStandard?.evaluationCriteria?.reduce((sum: number, c: any) => sum + (c.totalScore || 0), 0) || 0} 分
              </p>
            </CardContent>
          </Card>
          
          <Card className={`bg-gradient-to-br ${riskStats.critical > 0 ? 'from-red-50 to-red-100/50 border-red-300' : 'from-yellow-50 to-yellow-100/50 border-yellow-200'}`}>
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className={`h-4 w-4 ${riskStats.critical > 0 ? 'text-red-600' : 'text-yellow-600'}`} />
                <span className={`text-xs ${riskStats.critical > 0 ? 'text-red-700' : 'text-yellow-700'}`}>废标风险</span>
              </div>
              <p className={`font-semibold mt-1 ${riskStats.critical > 0 ? 'text-red-900' : 'text-yellow-900'}`}>
                {riskStats.total} 项 {riskStats.critical > 0 && <span className="text-xs">({riskStats.critical}严重)</span>}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 border-cyan-200">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-cyan-600" />
                <span className="text-xs text-cyan-700">截止时间</span>
              </div>
              <p className="font-semibold text-cyan-900 mt-1 truncate text-sm">
                {fullResult.timeSchedule?.bidSubmissionDeadline || '-'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 分段内容 */}
      {Object.entries(SECTION_CONFIG).map(([key, config]) => {
        if (!hasSectionData(key)) return null;
        const sectionData = fullResult[key];
        const Icon = config.icon;

        return (
          <Card key={key} className="overflow-hidden">
            <CardHeader className="py-3 px-4 bg-gradient-to-r from-muted/50 to-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-background shadow-sm">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-sm">{config.title}</CardTitle>
                  <CardDescription className="text-xs">{config.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="py-3 px-4">
              {renderSectionContent(key, sectionData)}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// 渲染分段内容
function renderSectionContent(key: string, data: any): React.ReactNode {
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
      return <ObjectDisplay data={data} />;
  }
}

// 项目基本信息
function ProjectBasicInfoSection({ data }: { data: any }) {
  const fields = ['projectName', 'projectNumber', 'purchaseUnit', 'purchaseUnitContact', 
                  'purchaseUnitPhone', 'projectBudget', 'projectCycle'];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {fields.map(key => data[key] && (
        <div key={key} className="space-y-0.5">
          <p className="text-xs text-muted-foreground">{getFieldLabel(key)}</p>
          <p className="font-medium text-sm">{data[key]}</p>
        </div>
      ))}
    </div>
  );
}

// 时间节点
function TimeScheduleSection({ data }: { data: any }) {
  const timeFields = [
    { key: 'bidSubmissionDeadline', label: '投标截止时间', critical: true },
    { key: 'bidOpeningDate', label: '开标时间', critical: true },
    { key: 'bidOpeningLocation', label: '开标地点', critical: false },
    { key: 'bidDocumentSaleStart', label: '文件发售开始', critical: false },
    { key: 'bidDocumentSaleEnd', label: '文件发售结束', critical: false },
  ];
  
  return (
    <div className="space-y-2">
      {timeFields.map(({ key, label, critical }) => data[key] && (
        <div key={key} className="flex items-center justify-between py-1.5 border-b last:border-0">
          <span className="text-sm text-gray-600">{label}</span>
          <span className={`text-sm font-medium ${critical ? 'text-red-600' : ''}`}>{data[key]}</span>
        </div>
      ))}
    </div>
  );
}

// 技术需求
function TechDemandSection({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {/* 技术参数 */}
      {data.technicalParameters?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">技术参数要求</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">参数名称</TableHead>
                  <TableHead className="text-xs">要求值</TableHead>
                  <TableHead className="text-xs w-20">关键</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.technicalParameters.map((param: any, idx: number) => (
                  <TableRow key={idx} className={param.isKeyParameter ? 'bg-amber-50' : ''}>
                    <TableCell className="text-sm font-medium">
                      {param.isKeyParameter && <span className="text-red-500 mr-1">★</span>}
                      {param.parameterName}
                    </TableCell>
                    <TableCell className="text-sm">{param.requiredValue} {param.unit || ''}</TableCell>
                    <TableCell>
                      {param.isKeyParameter ? <Badge variant="destructive" className="text-xs">关键</Badge> : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      
      {/* 系统功能需求 */}
      {data.systemUpgradeDemands?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">系统功能需求</h4>
          <div className="space-y-2">
            {data.systemUpgradeDemands.map((module: any, idx: number) => (
              <div key={idx} className="border-l-2 border-purple-300 pl-3 py-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{module.moduleName}</span>
                  {module.priority && <Badge variant="secondary" className="text-xs">{module.priority}</Badge>}
                </div>
                {module.demandDetails?.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-gray-600 mt-1">
                    {module.demandDetails.slice(0, 3).map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 商务要求
function BusinessRequirementsSection({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {/* 投标人资格要求 */}
      {data.bidderQualification?.basicQualification?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">基本资格要求</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {data.bidderQualification.basicQualification.slice(0, 5).map((req: string, idx: number) => (
              <li key={idx} className="text-gray-600">{req}</li>
            ))}
            {data.bidderQualification.basicQualification.length > 5 && (
              <li className="text-muted-foreground">...共 {data.bidderQualification.basicQualification.length} 条</li>
            )}
          </ul>
        </div>
      )}
      
      {/* 投标保证金 */}
      {data.bidSecurity && (
        <div className="p-3 bg-muted/20 rounded-lg">
          <h4 className="text-sm font-semibold mb-2">投标保证金</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">金额：</span>{data.bidSecurity.amount || '-'}</div>
            <div><span className="text-muted-foreground">截止：</span>{data.bidSecurity.deadline || '-'}</div>
          </div>
        </div>
      )}
      
      {/* 其他商务信息 */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div><span className="text-muted-foreground">服务地点：</span>{data.serviceLocation || '-'}</div>
        <div><span className="text-muted-foreground">中标人数量：</span>{data.winnerCount || '-'}</div>
        <div><span className="text-muted-foreground">投标有效期：</span>{data.bidValidityPeriod || '-'}</div>
      </div>
    </div>
  );
}

// 评分标准
function ScoringStandardSection({ data }: { data: any }) {
  const criteria = data.evaluationCriteria || [];
  if (criteria.length === 0) return <p className="text-muted-foreground text-sm">暂无评分标准数据</p>;
  
  return (
    <div className="space-y-3">
      {criteria.map((cat: any, idx: number) => (
        <Card key={idx} className="overflow-hidden">
          <CardHeader className="py-2 px-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{cat.category}</span>
              <Badge variant="destructive">{cat.totalScore}分</Badge>
            </div>
          </CardHeader>
          <CardContent className="py-2 px-3">
            {cat.items?.length > 0 && (
              <div className="space-y-1">
                {cat.items.slice(0, 3).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                    <span>{item.subItem}</span>
                    <span className="font-medium">{item.itemScore}分</span>
                  </div>
                ))}
                {cat.items.length > 3 && (
                  <p className="text-xs text-muted-foreground">...共 {cat.items.length} 项</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// 废标风险
function DisqualificationRisksSection({ data }: { data: any }) {
  const risks = Array.isArray(data) ? data : [];
  if (risks.length === 0) return <p className="text-muted-foreground text-sm">暂无废标风险数据</p>;
  
  return (
    <div className="space-y-2">
      {risks.map((risk: any, idx: number) => (
        <Alert key={idx} variant={risk.severity === 'critical' ? 'destructive' : 'default'} className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm flex items-center gap-2">
            <Badge variant={risk.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
              {risk.severity === 'critical' ? '严重' : risk.severity === 'high' ? '高' : '中'}
            </Badge>
            {risk.riskType}
          </AlertTitle>
          <AlertDescription className="text-sm">{risk.description}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

// 投标文件要求
function BiddingDocumentSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.formatRequirements && (
        <div className="grid grid-cols-3 gap-3 p-2 bg-muted/20 rounded text-sm">
          <div><span className="text-muted-foreground">装订：</span>{data.formatRequirements.bindingMethod || '-'}</div>
          <div><span className="text-muted-foreground">份数：</span>{data.formatRequirements.copiesCount || '-'}份</div>
          <div><span className="text-muted-foreground">电子版：</span>{data.formatRequirements.electronicFormat || '-'}</div>
        </div>
      )}
      {data.sealingRequirements?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-1">密封要求</h4>
          <ul className="list-disc list-inside text-xs text-gray-600">
            {data.sealingRequirements.slice(0, 3).map((req: string, i: number) => <li key={i}>{req}</li>)}
          </ul>
        </div>
      )}
      {data.signatureRequirements?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-1">签章要求</h4>
          <ul className="list-disc list-inside text-xs text-gray-600">
            {data.signatureRequirements.slice(0, 3).map((req: string, i: number) => <li key={i}>{req}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// 项目背景
function ProjectBackgroundSection({ data }: { data: any }) {
  return (
    <div className="space-y-3 text-sm">
      {data.constructionBackground && (
        <div>
          <h4 className="font-semibold">建设背景</h4>
          <p className="text-gray-600 mt-1">{data.constructionBackground}</p>
        </div>
      )}
      {data.constructionGoals?.length > 0 && (
        <div>
          <h4 className="font-semibold">建设目标</h4>
          <ul className="list-disc list-inside text-gray-600 mt-1">
            {data.constructionGoals.map((g: string, i: number) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// 其他重要信息
function OtherInfoSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.specialRequirements?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-1">特殊要求</h4>
          <ul className="list-disc list-inside text-xs text-gray-600">
            {data.specialRequirements.map((req: string, i: number) => <li key={i}>{req}</li>)}
          </ul>
        </div>
      )}
      {data.notes?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-1">注意事项</h4>
          <ul className="list-disc list-inside text-xs text-gray-600">
            {data.notes.slice(0, 5).map((note: string, i: number) => <li key={i}>{note}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// 通用对象展示
function ObjectDisplay({ data }: { data: any }) {
  if (!data || typeof data !== 'object') return null;
  return (
    <div className="space-y-1 text-sm">
      {Object.entries(data).slice(0, 10).map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="text-muted-foreground min-w-[100px]">{getFieldLabel(key)}:</span>
          <span>{typeof value === 'object' ? JSON.stringify(value).slice(0, 100) : String(value)}</span>
        </div>
      ))}
    </div>
  );
}

export default TenderExtractionView;
