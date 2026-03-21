'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUpload, UploadFile } from '@/components/ui/file-upload';
import { ExtractionProgress } from '@/components/extraction-progress';
import { TenderExtractionView } from '@/components/tender-extraction-view';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Building2,
  Calendar,
  Settings,
  Target,
  AlertTriangle,
  FileCheck,
  Info,
  DollarSign,
  AlertOctagon,
  BookOpen,
} from 'lucide-react';
import type { UploadedDocument } from '../../types';

// 分段配置
const SECTION_CONFIG: Record<string, { title: string; icon: any; color: string }> = {
  projectBasicInfo: { title: '项目基本信息', icon: Building2, color: 'text-blue-600' },
  projectBackground: { title: '项目背景', icon: BookOpen, color: 'text-gray-600' },
  timeSchedule: { title: '时间节点', icon: Calendar, color: 'text-green-600' },
  coreTechDemand: { title: '核心技术需求', icon: Settings, color: 'text-purple-600' },
  businessRequirements: { title: '商务要求', icon: DollarSign, color: 'text-orange-600' },
  scoringStandard: { title: '评分标准', icon: Target, color: 'text-red-600' },
  disqualificationRisks: { title: '废标风险', icon: AlertOctagon, color: 'text-yellow-600' },
  biddingDocumentRequirements: { title: '投标文件要求', icon: FileCheck, color: 'text-cyan-600' },
  otherImportantInfo: { title: '其他重要信息', icon: Info, color: 'text-indigo-600' },
};

// 规范化数据（下划线转驼峰）
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

// 判断分段是否有数据
function hasSectionData(fullResult: any, key: string): boolean {
  const sectionData = fullResult[key];
  if (!sectionData) return false;
  if (Array.isArray(sectionData)) return sectionData.length > 0;
  if (typeof sectionData === 'object') {
    return Object.values(sectionData).some(v => v !== null && v !== undefined && 
      (typeof v !== 'object' || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)));
  }
  return false;
}

interface UploadStageProps {
  projectId: string;
  uploadedDocument: UploadedDocument | null;
  extracting: boolean;
  taskId: string | null;
  isNewUpload: boolean;
  extractionResult: any; // 提取结果数据
  onUploadComplete: (files: UploadFile[]) => void;
  onTaskComplete: () => void;
  onTaskFailed: (error: string) => void;
  onReextract: () => void;
  onUploadNew: () => void;
  onClearDocument: () => void;
  onNext: () => void;
}

/**
 * 上传文档阶段组件
 */
export function UploadStage({
  projectId,
  uploadedDocument,
  extracting,
  taskId,
  isNewUpload,
  extractionResult,
  onUploadComplete,
  onTaskComplete,
  onTaskFailed,
  onReextract,
  onUploadNew,
  onClearDocument,
  onNext,
}: UploadStageProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [documentText, setDocumentText] = useState('');
  const [uploadResetKey, setUploadResetKey] = useState(0);

  // 是否已完成上传和提取
  const isComplete = uploadedDocument?.extracted && !uploadedDocument.extractError;

  // 计算有数据的分段
  const availableSections = useMemo(() => {
    if (!extractionResult) return [];
    
    const data = normalizeData(extractionResult);
    const fullResult = data.fullExtractionResult || data;
    
    return Object.entries(SECTION_CONFIG)
      .filter(([key]) => hasSectionData(fullResult, key))
      .map(([key, config]) => ({ key, ...config }));
  }, [extractionResult]);

  // 默认选中第一个有数据的tab
  const defaultTab = availableSections[0]?.key || 'projectBasicInfo';

  return (
    <div className="space-y-4">
      {!uploadedDocument ? (
        // 未上传状态
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">上传招标文档</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  支持 PDF、Word、图片等格式，自动提取评分项和风险
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  上传文件
                </Button>
                <Button variant="outline" onClick={() => setTextDialogOpen(true)}>
                  粘贴文本
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : isComplete ? (
        // 已完成提取
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">文档已提取完成</CardTitle>
                    <CardDescription>{uploadedDocument.name}</CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onReextract}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    重新提取
                  </Button>
                  <Button size="sm" onClick={onNext}>
                    下一步
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* 提取结果 Tab 展示 */}
          {extractionResult && availableSections.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <Tabs defaultValue={defaultTab} className="w-full">
                  <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0 justify-start">
                    {availableSections.map(({ key, title, icon: Icon, color }) => (
                      <TabsTrigger
                        key={key}
                        value={key}
                        className="data-[state=active]:bg-primary/10 data-[state=active]:shadow-none px-3 py-1.5 text-sm gap-1.5"
                      >
                        <Icon className={`h-3.5 w-3.5 ${color}`} />
                        {title}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {availableSections.map(({ key }) => (
                    <TabsContent key={key} value={key} className="mt-4">
                      <SectionContent extractionResult={extractionResult} sectionKey={key} />
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        // 提取进度
        <ExtractionProgress
          projectId={projectId}
          taskId={taskId}
          documentName={uploadedDocument.name}
          isNewUpload={isNewUpload}
          onTaskComplete={onTaskComplete}
          onTaskFailed={onTaskFailed}
          onUploadNew={onUploadNew}
          onReextract={onReextract}
        />
      )}

      {/* 上传文件对话框 */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        setUploadDialogOpen(open);
        if (!open) {
          onClearDocument();
        }
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>上传招标文档</DialogTitle>
            <DialogDescription>
              支持 PDF、Word、TXT 格式的招标文档
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <FileUpload
              key={uploadResetKey}
              uploadUrl="/api/upload"
              accept=".pdf,.doc,.docx,.txt"
              multiple={false}
              maxSize={50}
              maxFiles={1}
              extraData={{ projectId }}
              onComplete={onUploadComplete}
              hint="拖拽文件到此处或点击选择"
            />
          </div>
          <Button variant="outline" className="w-full" onClick={() => setUploadDialogOpen(false)}>
            关闭
          </Button>
        </DialogContent>
      </Dialog>

      {/* 粘贴文本对话框 */}
      <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>粘贴招标文档内容</DialogTitle>
            <DialogDescription>
              粘贴招标文档的文本内容，系统将自动提取
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="请粘贴招标文档内容..."
              className="min-h-[300px]"
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTextDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={extracting || !documentText.trim()}>
              {extracting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              开始提取
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

  export default UploadStage;

// 分段内容渲染组件
function SectionContent({ extractionResult, sectionKey }: { extractionResult: any; sectionKey: string }) {
  const data = normalizeData(extractionResult);
  const fullResult = data.fullExtractionResult || data;
  const sectionData = fullResult[sectionKey];

  if (!sectionData) {
    return <p className="text-muted-foreground text-sm">暂无数据</p>;
  }

  // 根据不同分段类型渲染不同内容
  switch (sectionKey) {
    case 'projectBasicInfo':
      return <ProjectBasicInfoContent data={sectionData} />;
    case 'timeSchedule':
      return <TimeScheduleContent data={sectionData} />;
    case 'coreTechDemand':
      return <TechDemandContent data={sectionData} />;
    case 'businessRequirements':
      return <BusinessRequirementsContent data={sectionData} />;
    case 'scoringStandard':
      return <ScoringStandardContent data={sectionData} />;
    case 'disqualificationRisks':
      return <DisqualificationRisksContent data={sectionData} />;
    case 'biddingDocumentRequirements':
      return <BiddingDocumentContent data={sectionData} />;
    case 'projectBackground':
      return <ProjectBackgroundContent data={sectionData} />;
    case 'otherImportantInfo':
      return <OtherInfoContent data={sectionData} />;
    default:
      return <ObjectDisplay data={sectionData} />;
  }
}

// 字段名中英文映射
const FIELD_LABELS: Record<string, string> = {
  projectName: '项目名称', projectNumber: '项目编号', purchaseUnit: '采购单位',
  purchaseUnitContact: '联系人', purchaseUnitPhone: '联系电话', purchaseUnitEmail: '电子邮箱',
  purchaseUnitAddress: '单位地址', projectType: '项目类型', procurementMethod: '采购方式',
  projectBudget: '项目预算', budgetSource: '资金来源', projectCycle: '服务期限',
  deliveryPeriod: '交付周期', warrantyPeriod: '质保期',
  bidSubmissionDeadline: '投标截止时间', bidOpeningDate: '开标时间', bidOpeningLocation: '开标地点',
  bidDocumentSaleStart: '文件发售开始', bidDocumentSaleEnd: '文件发售结束',
  questionDeadline: '提问截止时间', bidValidityPeriod: '投标有效期',
  constructionBackground: '建设背景', constructionGoals: '建设目标', constructionScope: '建设范围',
};

function getFieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// 项目基本信息
function ProjectBasicInfoContent({ data }: { data: any }) {
  const fields = ['projectName', 'projectNumber', 'purchaseUnit', 'purchaseUnitContact', 
                  'purchaseUnitPhone', 'purchaseUnitEmail', 'projectBudget', 'projectCycle',
                  'projectType', 'procurementMethod', 'deliveryPeriod', 'warrantyPeriod'];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {fields.map(key => data[key] && (
        <div key={key} className="space-y-1">
          <p className="text-xs text-muted-foreground">{getFieldLabel(key)}</p>
          <p className="font-medium text-sm">{data[key]}</p>
        </div>
      ))}
    </div>
  );
}

// 时间节点
function TimeScheduleContent({ data }: { data: any }) {
  const timeFields = [
    { key: 'bidSubmissionDeadline', label: '投标截止时间', critical: true },
    { key: 'bidOpeningDate', label: '开标时间', critical: true },
    { key: 'bidOpeningLocation', label: '开标地点', critical: false },
    { key: 'bidDocumentSaleStart', label: '文件发售开始', critical: false },
    { key: 'bidDocumentSaleEnd', label: '文件发售结束', critical: false },
    { key: 'questionDeadline', label: '提问截止时间', critical: false },
    { key: 'bidValidityPeriod', label: '投标有效期', critical: false },
  ];
  
  return (
    <div className="space-y-2">
      {timeFields.map(({ key, label, critical }) => data[key] && (
        <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className={`text-sm font-medium ${critical ? 'text-red-600' : ''}`}>{data[key]}</span>
        </div>
      ))}
    </div>
  );
}

// 技术需求
function TechDemandContent({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.technicalParameters?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">技术参数要求</h4>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">参数名称</th>
                  <th className="text-left p-2">要求值</th>
                  <th className="text-center p-2 w-20">关键</th>
                </tr>
              </thead>
              <tbody>
                {data.technicalParameters.slice(0, 10).map((param: any, idx: number) => (
                  <tr key={idx} className={`border-t ${param.isKeyParameter ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                    <td className="p-2 font-medium">
                      {param.isKeyParameter && <span className="text-red-500 mr-1">★</span>}
                      {param.parameterName}
                    </td>
                    <td className="p-2">{param.requiredValue} {param.unit || ''}</td>
                    <td className="p-2 text-center">
                      {param.isKeyParameter ? <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">关键</span> : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.technicalParameters.length > 10 && (
              <p className="text-xs text-muted-foreground p-2 border-t">...共 {data.technicalParameters.length} 项参数</p>
            )}
          </div>
        </div>
      )}
      
      {data.systemUpgradeDemands?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">系统功能需求</h4>
          <div className="space-y-2">
            {data.systemUpgradeDemands.slice(0, 5).map((module: any, idx: number) => (
              <div key={idx} className="border-l-2 border-purple-300 pl-3 py-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{module.moduleName}</span>
                  {module.priority && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">{module.priority}</span>}
                </div>
                {module.demandDetails?.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                    {module.demandDetails.slice(0, 3).map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
            ))}
            {data.systemUpgradeDemands.length > 5 && (
              <p className="text-xs text-muted-foreground">...共 {data.systemUpgradeDemands.length} 个模块</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 商务要求
function BusinessRequirementsContent({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.bidderQualification?.basicQualification?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">基本资格要求</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            {data.bidderQualification.basicQualification.slice(0, 5).map((req: string, idx: number) => (
              <li key={idx}>{req}</li>
            ))}
            {data.bidderQualification.basicQualification.length > 5 && (
              <li className="text-muted-foreground">...共 {data.bidderQualification.basicQualification.length} 条</li>
            )}
          </ul>
        </div>
      )}
      
      {data.bidSecurity && (
        <div className="p-3 bg-muted/30 rounded-lg">
          <h4 className="text-sm font-semibold mb-2">投标保证金</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">金额：</span>{data.bidSecurity.amount || '-'}</div>
            <div><span className="text-muted-foreground">截止：</span>{data.bidSecurity.deadline || '-'}</div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        {data.serviceLocation && <div><span className="text-muted-foreground">服务地点：</span>{data.serviceLocation}</div>}
        {data.winnerCount && <div><span className="text-muted-foreground">中标人数量：</span>{data.winnerCount}</div>}
        {data.bidValidityPeriod && <div><span className="text-muted-foreground">投标有效期：</span>{data.bidValidityPeriod}</div>}
        {data.paymentMethod && <div><span className="text-muted-foreground">付款方式：</span>{data.paymentMethod}</div>}
      </div>
    </div>
  );
}

// 评分标准
function ScoringStandardContent({ data }: { data: any }) {
  const criteria = data.evaluationCriteria || [];
  if (criteria.length === 0) return <p className="text-muted-foreground text-sm">暂无评分标准数据</p>;
  
  return (
    <div className="space-y-3">
      {criteria.map((cat: any, idx: number) => (
        <div key={idx} className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-2 bg-muted/30">
            <span className="font-semibold text-sm">{cat.category}</span>
            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{cat.totalScore}分</span>
          </div>
          <div className="p-2">
            {cat.items?.length > 0 && (
              <div className="space-y-1">
                {cat.items.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                    <span>{item.subItem}</span>
                    <span className="font-medium">{item.itemScore}分</span>
                  </div>
                ))}
                {cat.items.length > 5 && (
                  <p className="text-xs text-muted-foreground">...共 {cat.items.length} 项</p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// 废标风险
function DisqualificationRisksContent({ data }: { data: any }) {
  const risks = Array.isArray(data) ? data : [];
  if (risks.length === 0) return <p className="text-muted-foreground text-sm">暂无废标风险数据</p>;
  
  return (
    <div className="space-y-2">
      {risks.map((risk: any, idx: number) => (
        <div key={idx} className={`p-3 rounded-lg border ${risk.severity === 'critical' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded ${risk.severity === 'critical' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}`}>
              {risk.severity === 'critical' ? '严重' : risk.severity === 'high' ? '高' : '中'}
            </span>
            <span className="font-medium text-sm">{risk.riskType}</span>
          </div>
          <p className="text-sm text-muted-foreground">{risk.description}</p>
        </div>
      ))}
    </div>
  );
}

// 投标文件要求
function BiddingDocumentContent({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.formatRequirements && (
        <div className="grid grid-cols-3 gap-4 p-3 bg-muted/30 rounded-lg text-sm">
          <div><span className="text-muted-foreground">装订：</span>{data.formatRequirements.bindingMethod || '-'}</div>
          <div><span className="text-muted-foreground">份数：</span>{data.formatRequirements.copiesCount || '-'}份</div>
          <div><span className="text-muted-foreground">电子版：</span>{data.formatRequirements.electronicFormat || '-'}</div>
        </div>
      )}
      {data.sealingRequirements?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">密封要求</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {data.sealingRequirements.slice(0, 5).map((req: string, i: number) => <li key={i}>{req}</li>)}
          </ul>
        </div>
      )}
      {data.signatureRequirements?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">签章要求</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {data.signatureRequirements.slice(0, 5).map((req: string, i: number) => <li key={i}>{req}</li>)}
          </ul>
        </div>
      )}
      {data.documentStructure?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">文件组成</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {data.documentStructure.slice(0, 5).map((doc: any, i: number) => <li key={i}>{doc.volumeName || doc.sectionName || doc}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// 项目背景
function ProjectBackgroundContent({ data }: { data: any }) {
  return (
    <div className="space-y-4 text-sm">
      {data.constructionBackground && (
        <div>
          <h4 className="font-semibold mb-1">建设背景</h4>
          <p className="text-muted-foreground">{data.constructionBackground}</p>
        </div>
      )}
      {data.constructionGoals?.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1">建设目标</h4>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            {data.constructionGoals.map((g: string, i: number) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}
      {data.constructionScope && (
        <div>
          <h4 className="font-semibold mb-1">建设范围</h4>
          <p className="text-muted-foreground">{data.constructionScope}</p>
        </div>
      )}
    </div>
  );
}

// 其他重要信息
function OtherInfoContent({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.specialRequirements?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">特殊要求</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {data.specialRequirements.map((req: string, i: number) => <li key={i}>{req}</li>)}
          </ul>
        </div>
      )}
      {data.notes?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">注意事项</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {data.notes.slice(0, 10).map((note: string, i: number) => <li key={i}>{note}</li>)}
          </ul>
        </div>
      )}
      {data.attachments?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">附件清单</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {data.attachments.map((att: string, i: number) => <li key={i}>{att}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// 通用对象展示
function ObjectDisplay({ data }: { data: any }) {
  if (!data || typeof data !== 'object') return <p className="text-muted-foreground text-sm">暂无数据</p>;
  return (
    <div className="space-y-2 text-sm">
      {Object.entries(data).slice(0, 15).map(([key, value]) => (
        <div key={key} className="flex gap-2 py-1 border-b last:border-0">
          <span className="text-muted-foreground min-w-[120px]">{getFieldLabel(key)}:</span>
          <span className="flex-1">{typeof value === 'object' ? JSON.stringify(value).slice(0, 200) : String(value)}</span>
        </div>
      ))}
    </div>
  );
}
