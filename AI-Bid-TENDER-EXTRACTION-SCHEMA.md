# 智能标书生成系统 - 招标文档提取 Schema 设计

## 1. 参考代码分析

### 1.1 原始提取模型结构

参考代码定义了完整的招标文档提取 Schema，包含以下模块：

```
BiddingDocumentExtractionResult
├── project_basic_info (项目基本信息)
│   ├── project_name (项目名称)
│   ├── purchase_unit (采购单位)
│   ├── project_budget (项目预算)
│   └── project_cycle (项目周期)
│
├── core_tech_demand (核心技术需求)
│   ├── system_upgrade_demands (系统升级需求)
│   │   └── List[TechDemandItem]
│   │       ├── module_name (模块名称)
│   │       └── demand_details (需求详情列表)
│   └── professional_tech_requirements (专业技术要求)
│       └── requirement_details (要求详情列表)
│
├── business_requirements (商务要求)
│   ├── bidder_qualification (投标人资格)
│   │   └── qualification_items (资格要求列表)
│   ├── service_location (服务地点)
│   ├── winner_count (中标人数量)
│   └── payment_method (付款方式)
│
├── scoring_standard (评分标准)
│   ├── tech_scoring (技术评分)
│   │   └── List[ScoringItem]
│   │       ├── item_name (评分项名称)
│   │       ├── weight (权重)
│   │       └── score_details (评分细则)
│   └── business_scoring (商务评分)
│       └── List[ScoringItem]
│
├── key_compliance_requirements (关键合规要求)
│   └── compliance_items (合规要求列表)
│
└── bidding_document_requirements (投标文件要求)
    └── document_items (文件要求列表)
```

### 1.2 优点分析

✅ **结构清晰**：
- 按招标文档的实际章节组织
- 层次分明，易于理解和使用

✅ **字段完整**：
- 覆盖了招标文档的核心要素
- 项目信息、技术需求、商务要求、评分标准、合规要求

✅ **列表化设计**：
- 使用 List 存储多个条目
- 支持逐条原文提取，保持完整性

✅ **Optional 字段**：
- 允许字段为空，适应不同类型招标文档
- 避免"无信息"时的数据污染

### 1.3 需要扩展的内容

⚠️ **缺失字段**：
1. **时间节点**：投标截止时间、开标时间、答疑时间
2. **保证金信息**：投标保证金金额、缴纳方式、退还规则
3. **联系方式**：联系人、电话、邮箱、地址
4. **废标条款**：明确的废标情形
5. **技术偏离表**：关键技术参数要求表
6. **资质证明**：需要提供的资质证书清单
7. **项目背景**：项目背景描述、建设目标

---

## 2. 优化后的提取 Schema

### 2.1 TypeScript 实现

```typescript
// types/tender-extraction.ts

/**
 * 项目基本信息
 */
export interface ProjectBasicInfo {
  // 项目标识
  project_name: string | null;          // 项目完整名称
  project_number: string | null;        // 项目编号/招标编号
  
  // 采购方信息
  purchase_unit: string | null;         // 采购单位全称
  purchase_unit_contact: string | null; // 采购单位联系人
  purchase_unit_phone: string | null;   // 采购单位电话
  purchase_unit_email: string | null;   // 采购单位邮箱
  purchase_unit_address: string | null; // 采购单位地址
  
  // 项目属性
  project_type: string | null;          // 项目类型（货物/服务/工程）
  procurement_method: string | null;    // 采购方式（公开招标/竞争性谈判等）
  
  // 资金信息
  project_budget: string | null;        // 项目预算/控制价
  budget_source: string | null;         // 资金来源
  budget_approval: string | null;       // 预算批复文号
  
  // 时间周期
  project_cycle: string | null;         // 项目服务期限
  delivery_period: string | null;       // 交付周期
  warranty_period: string | null;       // 质保期
}

/**
 * 技术需求条目
 */
export interface TechDemandItem {
  module_name: string;                  // 模块/系统名称
  module_code?: string;                 // 模块编码
  demand_details: string[];             // 需求详情列表
  priority?: '必须' | '重要' | '一般';  // 重要程度
}

/**
 * 技术参数要求
 */
export interface TechnicalParameter {
  parameter_name: string;               // 参数名称
  required_value: string;               // 要求值
  unit?: string;                        // 单位
  is_key_parameter: boolean;            // 是否关键参数
  deviation_allowed: boolean;           // 是否允许偏离
}

/**
 * 核心技术需求
 */
export interface CoreTechDemand {
  // 系统功能需求
  system_upgrade_demands: TechDemandItem[];  // 系统升级需求
  
  // 技术参数要求
  technical_parameters: TechnicalParameter[]; // 技术参数列表
  
  // 专业技术能力
  professional_tech_requirements: {
    requirement_details: string[];      // 专业技术要求详情
  };
  
  // 技术方案要求
  tech_solution_requirements: string[]; // 技术方案编写要求
  
  // 性能指标
  performance_requirements: {
    requirement_name: string;
    requirement_value: string;
  }[];
}

/**
 * 投标人资格要求
 */
export interface BidderQualification {
  // 基本资格
  basic_qualification: string[];        // 基本资格要求
  
  // 资质证书
  required_certificates: {
    certificate_name: string;           // 证书名称
    certificate_level?: string;         // 证书等级
    is_mandatory: boolean;              // 是否必须
    validity_period?: string;           // 有效期要求
  }[];
  
  // 业绩要求
  performance_requirements: {
    project_type?: string;              // 项目类型
    project_count?: number;             // 项目数量
    contract_amount?: string;           // 合同金额要求
    time_limit?: string;                // 时间限制
    proof_materials: string[];          // 证明材料
  };
  
  // 人员要求
  personnel_requirements: {
    position: string;                   // 岗位
    count: number;                      // 人数
    qualification: string[];            // 资质要求
  }[];
}

/**
 * 商务要求
 */
export interface BusinessRequirements {
  // 投标人资格
  bidder_qualification: BidderQualification;
  
  // 服务要求
  service_location: string | null;      // 服务地点
  service_requirements: string[];       // 服务要求列表
  
  // 中标人数量
  winner_count: number | null;          // 中标人数量
  winner_selection_method: string | null; // 中标人确定方法
  
  // 付款方式
  payment_method: string | null;        // 付款方式
  payment_terms: string[];              // 付款条款
  
  // 保证金
  bid_security: {
    amount: string | null;              // 保证金金额
    payment_method: string | null;      // 缴纳方式
    deadline: string | null;            // 缴纳截止时间
    return_conditions: string[];        // 退还条件
  };
  
  // 投标有效期
  bid_validity_period: string | null;   // 投标有效期
}

/**
 * 评分项
 */
export interface ScoringItem {
  item_name: string;                    // 评分项名称
  item_code?: string;                   // 评分项编码
  weight: string;                       // 权重（百分比或分值）
  max_score: number;                    // 满分值
  score_details: string[];              // 评分细则
  scoring_method?: string;              // 评分方法
}

/**
 * 评分标准
 */
export interface ScoringStandard {
  // 技术评分
  tech_scoring: {
    total_score: number;                // 技术总分
    scoring_items: ScoringItem[];       // 评分项列表
  };
  
  // 商务评分
  business_scoring: {
    total_score: number;                // 商务总分
    scoring_items: ScoringItem[];       // 评分项列表
  };
  
  // 价格评分
  price_scoring: {
    total_score: number;                // 价格总分
    scoring_method: string;             // 价格评分方法
    formula?: string;                   // 计算公式
  };
  
  // 综合评分说明
  comprehensive_scoring_note: string | null; // 综合评分说明
}

/**
 * 时间节点
 */
export interface TimeSchedule {
  // 招标时间
  bid_publish_date: string | null;      // 招标公告发布时间
  bid_document_sale_start: string | null; // 招标文件发售开始时间
  bid_document_sale_end: string | null;   // 招标文件发售结束时间
  
  // 答疑时间
  question_deadline: string | null;     // 提问截止时间
  answer_publish_date: string | null;   // 答疑发布时间
  site_visit_date: string | null;       // 现场踏勘时间
  
  // 投标时间
  bid_submission_deadline: string | null; // 投标截止时间
  bid_opening_date: string | null;        // 开标时间
  bid_opening_location: string | null;    // 开标地点
  
  // 评标时间
  evaluation_period: string | null;     // 评标周期
  result_publicity_date: string | null; // 结果公示时间
}

/**
 * 关键合规要求
 */
export interface ComplianceRequirement {
  // 废标条款
  disqualification_rules: string[];     // 废标情形列表
  
  // 重大偏离
  major_deviation_rules: string[];      // 重大偏离情形
  
  // 投标限制
  bid_restrictions: string[];           // 投标限制条款
  
  // 诚信要求
  integrity_requirements: string[];      // 诚信要求
  
  // 法律合规
  legal_compliance: string[];           // 法律合规要求
}

/**
 * 投标文件要求
 */
export interface BiddingDocumentRequirement {
  // 文件组成
  document_structure: {
    volume_name: string;                // 册/卷名称
    sections: {
      section_name: string;             // 章节名称
      required_documents: string[];     // 需要的文件
    }[];
  }[];
  
  // 格式要求
  format_requirements: {
    binding_method: string | null;      // 装订方式
    copies_count: number | null;        // 份数
    electronic_format: string | null;   // 电子版格式
  };
  
  // 密封要求
  sealing_requirements: string[];       // 密封要求
  
  // 签章要求
  signature_requirements: string[];     // 签字盖章要求
  
  // 递交要求
  submission_requirements: {
    submission_location: string | null; // 递交地点
    submission_method: string | null;   // 递交方式
    deadline: string | null;            // 递交截止时间
  };
}

/**
 * 项目背景信息
 */
export interface ProjectBackground {
  // 建设背景
  construction_background: string | null; // 建设背景描述
  
  // 建设目标
  construction_goals: string[];         // 建设目标列表
  
  // 建设范围
  construction_scope: string | null;    // 建设范围
  
  // 现状描述
  current_status: string | null;        // 现状描述
  
  // 业务需求
  business_requirements: string[];      // 业务需求列表
}

/**
 * 招标文档提取完整结果
 */
export interface TenderDocumentExtractionResult {
  // 元数据
  extraction_metadata: {
    extraction_time: string;            // 提取时间
    document_name: string;              // 文档名称
    document_pages: number;             // 文档页数
    extraction_model: string;           // 提取模型
    confidence_score: number;           // 置信度分数
  };
  
  // 项目背景
  project_background: ProjectBackground;
  
  // 项目基本信息
  project_basic_info: ProjectBasicInfo;
  
  // 时间节点
  time_schedule: TimeSchedule;
  
  // 核心技术需求
  core_tech_demand: CoreTechDemand;
  
  // 商务要求
  business_requirements: BusinessRequirements;
  
  // 评分标准
  scoring_standard: ScoringStandard;
  
  // 关键合规要求
  key_compliance_requirements: ComplianceRequirement;
  
  // 投标文件要求
  bidding_document_requirements: BiddingDocumentRequirement;
  
  // 其他重要信息
  other_important_info: {
    special_requirements: string[];     // 特殊要求
    notes: string[];                    // 注意事项
    attachments: string[];              // 附件清单
  };
}
```

### 2.2 Python Pydantic 实现

```python
# models/tender_extraction.py

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class ProjectBasicInfo(BaseModel):
    """项目基本信息"""
    # 项目标识
    project_name: Optional[str] = Field(None, description="项目完整名称")
    project_number: Optional[str] = Field(None, description="项目编号/招标编号")
    
    # 采购方信息
    purchase_unit: Optional[str] = Field(None, description="采购单位全称")
    purchase_unit_contact: Optional[str] = Field(None, description="采购单位联系人")
    purchase_unit_phone: Optional[str] = Field(None, description="采购单位电话")
    purchase_unit_email: Optional[str] = Field(None, description="采购单位邮箱")
    purchase_unit_address: Optional[str] = Field(None, description="采购单位地址")
    
    # 项目属性
    project_type: Optional[str] = Field(None, description="项目类型（货物/服务/工程）")
    procurement_method: Optional[str] = Field(None, description="采购方式")
    
    # 资金信息
    project_budget: Optional[str] = Field(None, description="项目预算/控制价")
    budget_source: Optional[str] = Field(None, description="资金来源")
    
    # 时间周期
    project_cycle: Optional[str] = Field(None, description="项目服务期限")
    delivery_period: Optional[str] = Field(None, description="交付周期")
    warranty_period: Optional[str] = Field(None, description="质保期")


class TechDemandItem(BaseModel):
    """技术需求条目"""
    module_name: str = Field(description="模块/系统名称")
    module_code: Optional[str] = Field(None, description="模块编码")
    demand_details: List[str] = Field(description="需求详情列表")
    priority: Optional[str] = Field(None, description="重要程度：必须/重要/一般")


class TechnicalParameter(BaseModel):
    """技术参数要求"""
    parameter_name: str = Field(description="参数名称")
    required_value: str = Field(description="要求值")
    unit: Optional[str] = Field(None, description="单位")
    is_key_parameter: bool = Field(default=False, description="是否关键参数")
    deviation_allowed: bool = Field(default=False, description="是否允许偏离")


class BidderQualification(BaseModel):
    """投标人资格要求"""
    basic_qualification: List[str] = Field(default_factory=list, description="基本资格要求")
    
    required_certificates: List[dict] = Field(
        default_factory=list,
        description="资质证书要求列表"
    )
    
    performance_requirements: Optional[dict] = Field(
        None,
        description="业绩要求"
    )
    
    personnel_requirements: List[dict] = Field(
        default_factory=list,
        description="人员要求列表"
    )


class ScoringItem(BaseModel):
    """评分项"""
    item_name: str = Field(description="评分项名称")
    item_code: Optional[str] = Field(None, description="评分项编码")
    weight: str = Field(description="权重（百分比或分值）")
    max_score: int = Field(description="满分值")
    score_details: List[str] = Field(description="评分细则")
    scoring_method: Optional[str] = Field(None, description="评分方法")


class TimeSchedule(BaseModel):
    """时间节点"""
    bid_publish_date: Optional[str] = Field(None, description="招标公告发布时间")
    bid_document_sale_start: Optional[str] = Field(None, description="招标文件发售开始时间")
    bid_document_sale_end: Optional[str] = Field(None, description="招标文件发售结束时间")
    question_deadline: Optional[str] = Field(None, description="提问截止时间")
    answer_publish_date: Optional[str] = Field(None, description="答疑发布时间")
    bid_submission_deadline: Optional[str] = Field(None, description="投标截止时间")
    bid_opening_date: Optional[str] = Field(None, description="开标时间")
    bid_opening_location: Optional[str] = Field(None, description="开标地点")


class ComplianceRequirement(BaseModel):
    """关键合规要求"""
    disqualification_rules: List[str] = Field(
        default_factory=list,
        description="废标情形列表"
    )
    major_deviation_rules: List[str] = Field(
        default_factory=list,
        description="重大偏离情形"
    )
    bid_restrictions: List[str] = Field(
        default_factory=list,
        description="投标限制条款"
    )
    integrity_requirements: List[str] = Field(
        default_factory=list,
        description="诚信要求"
    )


class ExtractionMetadata(BaseModel):
    """提取元数据"""
    extraction_time: str = Field(default_factory=lambda: datetime.now().isoformat())
    document_name: str = Field(description="文档名称")
    document_pages: int = Field(description="文档页数")
    extraction_model: str = Field(default="gpt-4o", description="提取模型")
    confidence_score: float = Field(ge=0, le=1, description="置信度分数")


class TenderDocumentExtractionResult(BaseModel):
    """招标文档提取完整结果"""
    extraction_metadata: ExtractionMetadata
    
    project_basic_info: ProjectBasicInfo
    time_schedule: TimeSchedule
    core_tech_demand: dict  # CoreTechDemand
    business_requirements: dict  # BusinessRequirements
    scoring_standard: dict  # ScoringStandard
    key_compliance_requirements: ComplianceRequirement
    bidding_document_requirements: dict  # BiddingDocumentRequirement
    
    other_important_info: dict = Field(
        default_factory=dict,
        description="其他重要信息"
    )
```

---

## 3. 数据库表结构更新

### 3.1 更新 tender_analysis 表

```sql
-- 扩展 tender_analysis 表，支持完整的提取结果
ALTER TABLE tender_analysis ADD COLUMN IF NOT EXISTS extraction_result JSONB;

-- extraction_result 存储完整的提取结果 JSON
COMMENT ON COLUMN tender_analysis.extraction_result IS '招标文档提取完整结果，JSON格式';
```

### 3.2 新增提取记录表

```sql
-- 提取历史记录表
CREATE TABLE extraction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES tender_documents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 提取结果
  extraction_result JSONB NOT NULL,
  
  -- 元数据
  extraction_model VARCHAR(50),
  confidence_score DECIMAL(3, 2),
  extraction_time INT, -- 毫秒
  
  -- 状态
  status VARCHAR(20) DEFAULT 'completed',
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_extraction_history_document ON extraction_history(document_id);
CREATE INDEX idx_extraction_history_project ON extraction_history(project_id);
CREATE INDEX idx_extraction_history_created ON extraction_history(created_at DESC);

COMMENT ON TABLE extraction_history IS '招标文档提取历史记录表';
```

---

## 4. 提取服务实现

### 4.1 优化后的提取函数

```python
# services/tender_extractor.py

from typing import Optional
from openai import OpenAI
from models.tender_extraction import TenderDocumentExtractionResult
import json

class TenderDocumentExtractor:
    def __init__(self, api_key: str, base_url: str):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = "gpt-4o"  # 或使用其他模型
    
    async def extract(
        self,
        document_text: str,
        document_name: str,
        document_pages: int
    ) -> TenderDocumentExtractionResult:
        """
        提取招标文档结构化信息
        
        Args:
            document_text: 文档全文
            document_name: 文档名称
            document_pages: 文档页数
        
        Returns:
            TenderDocumentExtractionResult: 提取结果
        """
        schema = TenderDocumentExtractionResult.model_json_schema()
        
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(document_text, schema)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                top_p=0.9
            )
            
            result_json = response.choices[0].message.content
            
            # 验证并解析结果
            validated_result = TenderDocumentExtractionResult.model_validate_json(result_json)
            
            # 更新元数据
            validated_result.extraction_metadata.document_name = document_name
            validated_result.extraction_metadata.document_pages = document_pages
            validated_result.extraction_metadata.extraction_model = self.model
            
            return validated_result
            
        except Exception as e:
            raise ExtractionError(f"提取失败: {str(e)}")
    
    def _build_system_prompt(self) -> str:
        """构建系统提示词"""
        return """
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

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
"""
    
    def _build_user_prompt(self, document_text: str, schema: dict) -> str:
        """构建用户提示词"""
        return f"""
招标文档全文本：
{document_text}

请严格按照以下JSON Schema提取信息：
{json.dumps(schema, ensure_ascii=False, indent=2)}

提取要点：
1. 项目基本信息：完整提取项目名称、编号、采购单位等基础信息
2. 时间节点：重点提取投标截止时间、开标时间、答疑时间等关键时间
3. 技术需求：逐条提取技术参数、功能需求，标注关键参数
4. 资格要求：提取资质证书、业绩要求、人员要求
5. 评分标准：完整提取技术评分、商务评分、价格评分细则
6. 废标条款：逐条提取废标情形，这对投标至关重要
7. 文件要求：提取投标文件的组成、格式、密封、递交要求

仅输出符合Schema的纯JSON内容。
"""


class ExtractionError(Exception):
    """提取错误"""
    pass
```

### 4.2 流式提取服务

```python
# services/streaming_extractor.py

from typing import AsyncGenerator
import json

async def extract_streaming(
    self,
    document_text: str
) -> AsyncGenerator[dict, None]:
    """
    流式提取招标文档信息
    
    适用于超长文档，逐步返回提取结果
    """
    # 1. 先提取基本信息
    basic_info = await self.extract_basic_info(document_text)
    yield {
        "type": "basic_info",
        "data": basic_info,
        "done": False
    }
    
    # 2. 提取时间节点
    time_schedule = await self.extract_time_schedule(document_text)
    yield {
        "type": "time_schedule",
        "data": time_schedule,
        "done": False
    }
    
    # 3. 提取技术需求
    tech_demand = await self.extract_tech_demand(document_text)
    yield {
        "type": "tech_demand",
        "data": tech_demand,
        "done": False
    }
    
    # 4. 提取商务要求
    business_req = await self.extract_business_requirements(document_text)
    yield {
        "type": "business_requirements",
        "data": business_req,
        "done": False
    }
    
    # 5. 提取评分标准
    scoring = await self.extract_scoring_standard(document_text)
    yield {
        "type": "scoring_standard",
        "data": scoring,
        "done": False
    }
    
    # 6. 提取合规要求
    compliance = await self.extract_compliance_requirements(document_text)
    yield {
        "type": "compliance_requirements",
        "data": compliance,
        "done": False
    }
    
    # 7. 完成
    yield {
        "type": "complete",
        "done": True
    }
```

---

## 5. 前端展示优化

### 5.1 提取结果展示组件

```typescript
// components/TenderExtractionResult.tsx
'use client';

import { useState } from 'react';
import { Card, Tabs, Badge, Table } from '@/components/ui';
import { TenderDocumentExtractionResult } from '@/types/tender-extraction';

interface Props {
  result: TenderDocumentExtractionResult;
}

export function TenderExtractionResult({ result }: Props) {
  return (
    <div className="space-y-4">
      {/* 元数据 */}
      <Card className="p-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-500">文档名称</p>
            <p className="font-semibold">{result.extraction_metadata.document_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">页数</p>
            <p className="font-semibold">{result.extraction_metadata.document_pages} 页</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">置信度</p>
            <p className="font-semibold">
              {(result.extraction_metadata.confidence_score * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <Badge>
              {result.extraction_metadata.extraction_model}
            </Badge>
          </div>
        </div>
      </Card>
      
      {/* 详细信息 */}
      <Tabs defaultValue="basic">
        <Tabs.List>
          <Tabs.Trigger value="basic">项目基本信息</Tabs.Trigger>
          <Tabs.Trigger value="time">时间节点</Tabs.Trigger>
          <Tabs.Trigger value="tech">技术需求</Tabs.Trigger>
          <Tabs.Trigger value="business">商务要求</Tabs.Trigger>
          <Tabs.Trigger value="scoring">评分标准</Tabs.Trigger>
          <Tabs.Trigger value="compliance">合规要求</Tabs.Trigger>
        </Tabs.List>
        
        <Tabs.Content value="basic">
          <ProjectBasicInfoCard data={result.project_basic_info} />
        </Tabs.Content>
        
        <Tabs.Content value="time">
          <TimeScheduleCard data={result.time_schedule} />
        </Tabs.Content>
        
        <Tabs.Content value="tech">
          <TechDemandCard data={result.core_tech_demand} />
        </Tabs.Content>
        
        <Tabs.Content value="business">
          <BusinessRequirementsCard data={result.business_requirements} />
        </Tabs.Content>
        
        <Tabs.Content value="scoring">
          <ScoringStandardCard data={result.scoring_standard} />
        </Tabs.Content>
        
        <Tabs.Content value="compliance">
          <ComplianceCard data={result.key_compliance_requirements} />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}

// 时间节点卡片
function TimeScheduleCard({ data }: { data: TimeSchedule }) {
  const timeItems = [
    { label: '招标公告发布', value: data.bid_publish_date },
    { label: '招标文件发售', value: data.bid_document_sale_start && `${data.bid_document_sale_start} 至 ${data.bid_document_sale_end}` },
    { label: '提问截止', value: data.question_deadline },
    { label: '答疑发布', value: data.answer_publish_date },
    { label: '投标截止', value: data.bid_submission_deadline, highlight: true },
    { label: '开标时间', value: data.bid_opening_date, highlight: true },
    { label: '开标地点', value: data.bid_opening_location },
  ];
  
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">时间节点</h3>
      <div className="space-y-2">
        {timeItems.map(item => (
          <div key={item.label} className="flex justify-between">
            <span className="text-gray-600">{item.label}</span>
            <span className={item.highlight ? 'text-red-600 font-semibold' : ''}>
              {item.value || '-'}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// 评分标准卡片
function ScoringStandardCard({ data }: { data: ScoringStandard }) {
  return (
    <div className="space-y-4">
      {/* 技术评分 */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">技术评分（满分 {data.tech_scoring.total_score} 分）</h3>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>评分项</Table.Head>
              <Table.Head>分值</Table.Head>
              <Table.Head>评分细则</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.tech_scoring.scoring_items.map((item, idx) => (
              <Table.Row key={idx}>
                <Table.Cell>{item.item_name}</Table.Cell>
                <Table.Cell>{item.max_score}</Table.Cell>
                <Table.Cell>
                  <ul className="list-disc list-inside">
                    {item.score_details.map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Card>
      
      {/* 商务评分 */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">商务评分（满分 {data.business_scoring.total_score} 分）</h3>
        </div>
        <Table>
          {/* 类似技术评分表格 */}
        </Table>
      </Card>
      
      {/* 价格评分 */}
      <Card className="p-4">
        <h3 className="font-semibold mb-2">价格评分（满分 {data.price_scoring.total_score} 分）</h3>
        <p className="text-gray-600">{data.price_scoring.scoring_method}</p>
        {data.price_scoring.formula && (
          <p className="text-sm text-gray-500 mt-2">计算公式：{data.price_scoring.formula}</p>
        )}
      </Card>
    </div>
  );
}

// 废标条款卡片
function ComplianceCard({ data }: { data: ComplianceRequirement }) {
  return (
    <div className="space-y-4">
      {/* 废标条款 */}
      <Card className="p-4 border-red-200 bg-red-50">
        <h3 className="font-semibold text-red-700 mb-4">⚠️ 废标条款（重点关注）</h3>
        <ul className="space-y-2">
          {data.disqualification_rules.map((rule, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-red-600 font-bold">•</span>
              <span className="text-red-900">{rule}</span>
            </li>
          ))}
        </ul>
      </Card>
      
      {/* 其他合规要求 */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">投标限制</h3>
        <ul className="list-disc list-inside space-y-1">
          {data.bid_restrictions.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </Card>
      
      <Card className="p-4">
        <h3 className="font-semibold mb-4">诚信要求</h3>
        <ul className="list-disc list-inside space-y-1">
          {data.integrity_requirements.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

---

## 6. 使用示例

### 6.1 API 调用示例

```typescript
// 前端调用提取 API
const extractTenderDocument = async (projectId: string) => {
  const response = await fetch(`/api/projects/${projectId}/parse`, {
    method: 'POST'
  });
  
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const data = JSON.parse(chunk);
    
    if (data.type === 'basic_info') {
      updateBasicInfo(data.data);
    } else if (data.type === 'time_schedule') {
      updateTimeSchedule(data.data);
    }
    // ... 处理其他类型
  }
};
```

### 6.2 后端处理示例

```python
# API 路由
from fastapi import APIRouter, BackgroundTasks
from services.tender_extractor import TenderDocumentExtractor

router = APIRouter()

@router.post("/projects/{project_id}/parse")
async def parse_tender_document(
    project_id: str,
    background_tasks: BackgroundTasks
):
    # 创建提取任务
    task_id = create_extraction_task(project_id)
    
    # 后台执行提取
    background_tasks.add_task(
        extract_and_save,
        task_id,
        project_id
    )
    
    return {"task_id": task_id, "status": "processing"}


async def extract_and_save(task_id: str, project_id: str):
    try:
        # 获取文档
        document = await get_tender_document(project_id)
        document_text = await parse_document(document.file_url)
        
        # 执行提取
        extractor = TenderDocumentExtractor(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL
        )
        
        result = await extractor.extract(
            document_text,
            document.filename,
            document.page_count
        )
        
        # 保存结果
        await save_extraction_result(
            task_id,
            project_id,
            result.model_dump()
        )
        
        update_task_status(task_id, "completed")
        
    except Exception as e:
        update_task_status(task_id, "failed", str(e))
```

---

## 7. 总结与建议

### 7.1 相比原始代码的优化

| 优化项 | 原始代码 | 优化后 |
|--------|----------|--------|
| **字段数量** | ~20个字段 | ~60个字段 |
| **时间节点** | 仅项目周期 | 完整时间轴（7个关键时间） |
| **保证金信息** | ❌ 无 | ✅ 完整（金额、缴纳、退还） |
| **联系方式** | ❌ 无 | ✅ 完整（联系人、电话、邮箱、地址） |
| **废标条款** | 在合规要求中 | ✅ 独立模块，重点标注 |
| **技术参数** | 在需求详情中 | ✅ 独立结构，支持关键参数标注 |
| **资质要求** | 简单列表 | ✅ 结构化（证书、业绩、人员） |
| **元数据** | ❌ 无 | ✅ 提取时间、模型、置信度 |
| **历史记录** | ❌ 无 | ✅ 支持多次提取对比 |

### 7.2 实施建议

1. **分阶段实现**：
   - Phase 1：实现基础字段提取（项目信息、时间节点）
   - Phase 2：实现技术需求、评分标准提取
   - Phase 3：实现完整Schema，包括资质、合规要求

2. **质量控制**：
   - 设置置信度阈值（如 < 0.7 需人工复核）
   - 关键字段（投标截止时间、废标条款）二次验证
   - 提供人工修正接口

3. **性能优化**：
   - 长文档分段提取
   - 使用缓存减少重复提取
   - 异步任务队列处理

---

**文档版本**：v1.0  
**最后更新**：2026-03-17  
**负责人**：技术团队
