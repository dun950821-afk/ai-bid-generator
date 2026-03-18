'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Building2, Calendar, Cog, Briefcase, Target, AlertTriangle,
  FileText, Info, Clock, Phone, Mail, MapPin, DollarSign
} from 'lucide-react';

interface ExtractionResultDisplayProps {
  extractionResult: any;
}

// 数据规范化函数：下划线转驼峰
function normalizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => normalizeData(item));
  }
  
  const normalized: any = {};
  for (const key in data) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    normalized[camelKey] = normalizeData(data[key]);
  }
  return normalized;
}

export function ExtractionResultDisplay({ extractionResult }: ExtractionResultDisplayProps) {
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
  
  // 使用fullExtractionResult作为主要数据源（包含LLM返回的完整数据）
  const fullResult = data.fullExtractionResult || {};
  const projectBasicInfo = fullResult.projectBasicInfo || {};
  const timeSchedule = fullResult.timeSchedule || {};
  const coreTechDemand = fullResult.coreTechDemand || {};
  const businessRequirements = fullResult.businessRequirements || {};
  const scoringStandard = fullResult.scoringStandard || {};
  const biddingDocumentRequirements = fullResult.biddingDocumentRequirements || {};
  const projectBackground = fullResult.projectBackground || {};
  const otherImportantInfo = fullResult.otherImportantInfo || {};
  const disqualificationRisks = fullResult.disqualificationRisks || data.disqualificationRisks || [];

  // 辅助函数：渲染值（支持各种类型）
  const renderValue = (value: any, depth: number = 0): React.ReactNode => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-muted-foreground">-</span>;
    }
    
    if (typeof value === 'boolean') {
      return value ? '是' : '否';
    }
    
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    
    if (typeof value === 'string') {
      // 尝试解析 JSON 字符串
      if (value.startsWith('{') || value.startsWith('[')) {
        try {
          const parsed = JSON.parse(value);
          return renderValue(parsed, depth);
        } catch {
          return value;
        }
      }
      return value;
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-muted-foreground text-xs">无</span>;
      }
      
      // 如果数组元素都是简单类型（字符串、数字）
      if (value.every(item => typeof item === 'string' || typeof item === 'number')) {
        return (
          <ul className="list-disc list-inside space-y-1 text-sm">
            {value.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
      }
      
      // 复杂对象数组
      return (
        <div className="space-y-2">
          {value.map((item, idx) => (
            <div key={idx} className="p-2 bg-muted/30 rounded text-sm">
              {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      );
    }
    
    if (typeof value === 'object') {
      return (
        <div className="space-y-1.5">
          {Object.entries(value).map(([k, v]) => {
            const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            return (
              <div key={k} className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground min-w-[100px] shrink-0">{label}:</span>
                <span className="text-sm">{renderValue(v, depth + 1)}</span>
              </div>
            );
          })}
        </div>
      );
    }
    
    return String(value);
  };

  // 辅助函数：渲染键值对列表
  const renderKeyValueList = (obj: any, excludeKeys: string[] = []) => {
    if (!obj || typeof obj !== 'object') return null;
    
    return Object.entries(obj)
      .filter(([key]) => !excludeKeys.includes(key) && obj[key] !== null && obj[key] !== undefined && obj[key] !== '')
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        return (
          <div key={key} className="py-3 border-b last:border-0">
            <p className="text-sm font-medium text-foreground mb-1.5">{label}</p>
            <div className="text-sm">
              {renderValue(value)}
            </div>
          </div>
        );
      });
  };

  // 辅助函数：渲染时间节点
  const renderTimeSchedule = (schedule: any) => {
    const items = [
      { key: 'bidPublishDate', label: '招标公告发布', icon: FileText },
      { key: 'bidDocumentSaleStart', label: '招标文件发售开始', icon: Calendar },
      { key: 'bidDocumentSaleEnd', label: '招标文件发售结束', icon: Calendar },
      { key: 'questionDeadline', label: '质疑截止时间', icon: Clock },
      { key: 'answerPublishDate', label: '答疑发布时间', icon: FileText },
      { key: 'siteVisitDate', label: '现场踏勘时间', icon: MapPin },
      { key: 'bidSubmissionDeadline', label: '投标截止时间', icon: Clock },
      { key: 'bidOpeningDate', label: '开标时间', icon: Calendar },
      { key: 'bidOpeningLocation', label: '开标地点', icon: MapPin },
    ];

    // 过滤出有时间数据的项
    const validItems = items.filter(({ key }) => schedule[key]);

    if (validItems.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">暂无时间节点信息</p>
      );
    }

    return (
      <div className="space-y-3">
        {validItems.map(({ key, label, icon: Icon }) => {
          const value = schedule[key];
          
          return (
            <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Icon className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{value}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // 辅助函数：渲染评分标准
  const renderScoringStandard = (scoring: any) => {
    // 优先使用新格式 evaluationCriteria
    const evaluationCriteria = scoring.evaluationCriteria || [];
    
    // 如果有新格式数据
    if (evaluationCriteria.length > 0) {
      // 计算总分
      const totalScore = evaluationCriteria.reduce((sum: number, criteria: any) => 
        sum + (criteria.totalScore || 0), 0);
      const totalItems = evaluationCriteria.reduce((sum: number, criteria: any) => 
        sum + (criteria.items?.length || 0), 0);
      
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>总分: <strong className="text-foreground">{totalScore}</strong> 分</span>
            <span>共 <strong className="text-foreground">{totalItems}</strong> 个评分项</span>
          </div>
          
          {evaluationCriteria.map((criteria: any, idx: number) => {
            const items = criteria.items || [];
            const categoryType = criteria.categoryType || 'technical';
            
            return (
              <div key={idx} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Badge variant={
                      categoryType === 'technical' ? 'default' : 
                      categoryType === 'business' ? 'secondary' : 'outline'
                    }>
                      {criteria.category || `评分大类${idx + 1}`}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      满分: {criteria.totalScore || 0} 分
                    </span>
                  </h4>
                </div>
                
                {items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item: any, itemIdx: number) => (
                      <div key={itemIdx} className="p-3 rounded-lg border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{item.subItem || `评分项${itemIdx + 1}`}</span>
                          <Badge variant="outline">{item.itemScore || 0} 分</Badge>
                        </div>
                        {item.rule && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground mb-1">评分细则:</p>
                            <p className="whitespace-pre-wrap">{item.rule}</p>
                          </div>
                        )}
                        {item.basis && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground mb-1">评分依据:</p>
                            <p>{item.basis}</p>
                          </div>
                        )}
                        {item.techDocRef && (
                          <div className="mt-2 text-xs text-blue-600">
                            引用: {item.techDocRef}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无评分细项</p>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    
    // 兼容旧格式
    const sections = [
      { key: 'techScoring', label: '技术评分', type: 'technical' },
      { key: 'businessScoring', label: '商务评分', type: 'business' },
      { key: 'priceScoring', label: '价格评分', type: 'price' },
    ];

    // 检查是否有任何评分数据
    const hasAnyData = sections.some(({ key }) => {
      const section = scoring[key];
      const items = section?.scoringItems || section?.scoring_items || [];
      return items.length > 0 || section?.maxScore;
    });

    if (!hasAnyData) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">评分标准数据待提取或解析中...</p>
          <div className="p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
            <p>提示：评分标准通常包含技术评分、商务评分和价格评分三部分。</p>
            <p className="mt-1">如果已上传文档但未显示，请尝试重新解析。</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {sections.map(({ key, label, type }) => {
          const section = scoring[key];
          if (!section) return null;

          const items = section.scoringItems || section.scoring_items || [];
          
          return (
            <div key={key} className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <Badge variant={type === 'technical' ? 'default' : type === 'business' ? 'secondary' : 'outline'}>
                    {label}
                  </Badge>
                  {section.maxScore && <span className="text-sm text-muted-foreground">满分: {section.maxScore}分</span>}
                </h4>
              </div>
              
              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{item.itemName || item.item_name || `评分项${idx + 1}`}</span>
                        <Badge variant="outline">{item.maxScore || item.max_score || 0}分</Badge>
                      </div>
                      {item.scoreDetails && item.scoreDetails.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {item.scoreDetails.map((detail: any, i: number) => (
                            <div key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <span>{renderValue(detail)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无评分项</p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 辅助函数：渲染风险项
  const renderRisks = (risks: any[]) => {
    // 过滤掉无效数据
    const validRisks = (risks || []).filter((risk: any) => {
      const description = risk.description || risk.riskDescription || risk.risk_description;
      return description && description.trim().length > 0;
    });

    if (validRisks.length === 0) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">暂无废标风险</p>
          <div className="p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
            <p>提示：系统会自动识别招标文档中可能导致废标的风险点。</p>
          </div>
        </div>
      );
    }

    // 按严重程度排序
    const sortedRisks = [...validRisks].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityA = (a.severity || 'medium').toLowerCase();
      const severityB = (b.severity || 'medium').toLowerCase();
      return (order[severityA] ?? 2) - (order[severityB] ?? 2);
    });

    return (
      <div className="space-y-3">
        {sortedRisks.map((risk, idx) => {
          const severity = (risk.severity || 'medium').toLowerCase();
          const riskType = risk.riskType || risk.risk_type || '其他';
          const description = risk.description || risk.riskDescription || risk.risk_description || '未提供描述';
          const sourceText = risk.sourceText || risk.source_text;

          return (
            <div key={idx} className="p-4 rounded-lg border border-red-200 bg-red-50/50">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <Badge variant={severity === 'high' || severity === 'critical' ? 'destructive' : 'secondary'}>
                  {severity === 'critical' ? '致命' : severity === 'high' ? '高风险' : severity === 'medium' ? '中风险' : '低风险'}
                </Badge>
                <span className="text-sm font-medium">{riskType}</span>
              </div>
              <p className="text-sm">{description}</p>
              {sourceText && (
                <p className="text-xs text-muted-foreground mt-2 italic bg-muted/50 p-2 rounded">
                  原文: {sourceText}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 辅助函数：渲染技术需求
  const renderTechDemand = (demand: any) => {
    const categories = [
      { key: 'hardwareRequirements', label: '硬件要求' },
      { key: 'softwareRequirements', label: '软件要求' },
      { key: 'performanceRequirements', label: '性能要求' },
      { key: 'securityRequirements', label: '安全要求' },
      { key: 'integrationRequirements', label: '集成要求' },
      { key: 'technicalParameters', label: '技术参数' },
      { key: 'systemUpgradeDemands', label: '系统升级需求' },
      { key: 'techSolutionRequirements', label: '技术方案要求' },
      { key: 'professionalTechRequirements', label: '专业技术要求' },
    ];

    return (
      <div className="space-y-4">
        {categories.map(({ key, label }) => {
          const items = demand[key];
          if (!items || (Array.isArray(items) && items.length === 0)) return null;

          return (
            <div key={key} className="py-3 border-b last:border-0">
              <h4 className="font-medium text-sm mb-2">{label}</h4>
              {Array.isArray(items) ? (
                items.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1.5 text-sm text-muted-foreground">
                    {items.map((item, idx) => (
                      <li key={idx}>{typeof item === 'object' ? renderValue(item) : item}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted-foreground">无</span>
                )
              ) : typeof items === 'object' ? (
                renderValue(items)
              ) : (
                <p className="text-sm text-muted-foreground">{items}</p>
              )}
            </div>
          );
        })}
        {/* 其他字段 */}
        {renderKeyValueList(demand, categories.map(c => c.key))}
      </div>
    );
  };

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-6 pr-4">
        {/* 1. 项目基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              项目基本信息
            </CardTitle>
            <CardDescription>招标项目的核心信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {projectBasicInfo.projectName && (
                <div className="col-span-2 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">项目名称</p>
                  <p className="font-semibold">{projectBasicInfo.projectName}</p>
                </div>
              )}
              {projectBasicInfo.projectNumber && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">项目编号</p>
                  <p className="font-medium">{projectBasicInfo.projectNumber}</p>
                </div>
              )}
              {projectBasicInfo.projectType && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">项目类型</p>
                  <Badge>{projectBasicInfo.projectType}</Badge>
                </div>
              )}
              {projectBasicInfo.projectBudget && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">项目预算</p>
                  <p className="font-medium flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    {projectBasicInfo.projectBudget}
                  </p>
                </div>
              )}
              {projectBasicInfo.procurementMethod && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">采购方式</p>
                  <p className="font-medium">{projectBasicInfo.procurementMethod}</p>
                </div>
              )}
              {projectBasicInfo.deliveryPeriod && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">交付周期</p>
                  <p className="font-medium">{projectBasicInfo.deliveryPeriod}</p>
                </div>
              )}
              {projectBasicInfo.warrantyPeriod && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">质保期</p>
                  <p className="font-medium">{projectBasicInfo.warrantyPeriod}</p>
                </div>
              )}
            </div>
            
            {/* 采购单位信息 */}
            {projectBasicInfo.purchaseUnit && (
              <div className="mt-4 p-4 border rounded-lg">
                <h4 className="font-semibold mb-3">采购单位信息</h4>
                <div className="space-y-2">
                  <p className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{projectBasicInfo.purchaseUnit}</span>
                  </p>
                  {projectBasicInfo.purchaseUnitContact && (
                    <p className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      联系人: {projectBasicInfo.purchaseUnitContact}
                    </p>
                  )}
                  {projectBasicInfo.purchaseUnitPhone && (
                    <p className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      电话: {projectBasicInfo.purchaseUnitPhone}
                    </p>
                  )}
                  {projectBasicInfo.purchaseUnitEmail && (
                    <p className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      邮箱: {projectBasicInfo.purchaseUnitEmail}
                    </p>
                  )}
                  {projectBasicInfo.purchaseUnitAddress && (
                    <p className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      地址: {projectBasicInfo.purchaseUnitAddress}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. 时间节点 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              时间节点
            </CardTitle>
            <CardDescription>招标过程中的关键时间节点</CardDescription>
          </CardHeader>
          <CardContent>
            {renderTimeSchedule(timeSchedule)}
          </CardContent>
        </Card>

        {/* 3. 核心技术需求 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cog className="h-5 w-5 text-primary" />
              核心技术需求
            </CardTitle>
            <CardDescription>项目的技术要求和规格说明</CardDescription>
          </CardHeader>
          <CardContent>
            {renderTechDemand(coreTechDemand)}
          </CardContent>
        </Card>

        {/* 4. 商务要求 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              商务要求
            </CardTitle>
            <CardDescription>商务条款和要求</CardDescription>
          </CardHeader>
          <CardContent>
            {renderKeyValueList(businessRequirements)}
          </CardContent>
        </Card>

        {/* 5. 评分标准 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              评分标准
            </CardTitle>
            <CardDescription>
              {(() => {
                const evaluationCriteria = scoringStandard.evaluationCriteria || [];
                if (evaluationCriteria.length > 0) {
                  const totalScore = evaluationCriteria.reduce((sum: number, c: any) => sum + (c.totalScore || 0), 0);
                  const totalItems = evaluationCriteria.reduce((sum: number, c: any) => sum + (c.items?.length || 0), 0);
                  return `共 ${totalScore} 分，${totalItems} 个评分项`;
                }
                return `共 ${data.totalScore || 0} 分，${data.itemCount || 0} 个评分项`;
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderScoringStandard(scoringStandard)}
          </CardContent>
        </Card>

        {/* 6. 废标风险 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              废标风险
            </CardTitle>
            <CardDescription>
              共 {disqualificationRisks.length || data.riskCount || 0} 个风险点
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderRisks(disqualificationRisks)}
          </CardContent>
        </Card>

        {/* 7. 投标文件要求 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              投标文件要求
            </CardTitle>
            <CardDescription>投标文件的格式和内容要求</CardDescription>
          </CardHeader>
          <CardContent>
            {renderKeyValueList(biddingDocumentRequirements)}
          </CardContent>
        </Card>

        {/* 8. 项目背景 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              项目背景
            </CardTitle>
            <CardDescription>项目的背景信息和上下文</CardDescription>
          </CardHeader>
          <CardContent>
            {renderKeyValueList(projectBackground)}
          </CardContent>
        </Card>

        {/* 9. 其他重要信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              其他重要信息
            </CardTitle>
            <CardDescription>其他需要注意的重要事项</CardDescription>
          </CardHeader>
          <CardContent>
            {renderKeyValueList(otherImportantInfo)}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
