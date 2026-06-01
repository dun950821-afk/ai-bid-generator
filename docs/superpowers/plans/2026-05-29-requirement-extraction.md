# P1.1: Requirement Extraction 条款抽取设计

## 1. 功能概述

条款抽取（Requirement Extraction）是从解析后的招标文档中提取关键条款的核心功能。

**业务场景**：
- 招标文件解析后产生 ParsedDocument 和 KnowledgeChunk
- 需要从中识别和提取实质性响应条款（★条款）
- 为后续条款响应、偏离分析提供数据基础

**输入**：
- TenderFile（招标文件）
- ParsedDocument（解析文档）
- 可选：KnowledgeChunk 列表

**输出**：
- TenderRequirement（条款列表）
- 每条条款包含：条款编号、条款内容、条款类型、响应要求、评分权重等

## 2. 数据模型

### 2.1 TenderRequirement 模型

```python
# backend/apps/tender/models/requirement.py

class RequirementType:
    """条款类型。"""
    MANDATORY = "mandatory"      # 强制条款（★）
    SCORING = "scoring"          # 评分条款
    TECHNICAL = "technical"      # 技术条款
    BUSINESS = "business"        # 商务条款
    LEGAL = "legal"              # 法律条款
    
class ResponseLevel:
    """响应要求级别。"""
    MUST_MEET = "must_meet"      # 必须满足
    SHOULD_MEET = "should_meet"  # 应当满足
    CAN_MEET = "can_meet"        # 可以满足
    OPTIONAL = "optional"        # 可选条款

class TenderRequirement(TimeStampedModel):
    """招标条款。"""
    
    tender_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        related_name="requirements",
        verbose_name="招标文件",
    )
    parsed_document = models.ForeignKey(
        "tender.ParsedDocument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requirements",
        verbose_name="解析文档",
    )
    source_chunk = models.ForeignKey(
        "knowledge.KnowledgeChunk",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requirements",
        verbose_name="来源分块",
    )
    
    # 条款标识
    requirement_code = models.CharField(
        "条款编号",
        max_length=64,
        help_text="如 ★1、2.1.3、P1-评分项1",
    )
    section_path = models.CharField(
        "章节路径",
        max_length=255,
        blank=True,
        help_text="如 投标人须知/资格审查/企业资质",
    )
    
    # 条款内容
    content = models.TextField(
        "条款内容",
        help_text="条款原始文本",
    )
    content_summary = models.CharField(
        "内容摘要",
        max_length=500,
        blank=True,
        help_text="AI 生成的简短摘要",
    )
    
    # 条款分类
    requirement_type = models.CharField(
        "条款类型",
        max_length=16,
        choices=RequirementType.CHOICES,
        default=RequirementType.TECHNICAL,
    )
    response_level = models.CharField(
        "响应要求",
        max_length=16,
        choices=ResponseLevel.CHOICES,
        default=ResponseLevel.CAN_MEET,
    )
    is_starred = models.BooleanField(
        "是否★条款",
        default=False,
        help_text="实质性响应条款",
    )
    
    # 评分信息
    score_weight = models.DecimalField(
        "评分权重",
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="评分条款的权重分数",
    )
    score_criteria = models.TextField(
        "评分标准",
        blank=True,
        help_text="评分细则描述",
    )
    
    # 关键信息提取
    deadline_info = models.CharField(
        "截止信息",
        max_length=255,
        blank=True,
        help_text="投标截止时间等",
    )
    contact_info = models.TextField(
        "联系方式",
        blank=True,
        help_text="联系人、电话等",
    )
    
    # 提取来源
    extraction_method = models.CharField(
        "提取方式",
        max_length=32,
        default="ai_extraction",
        help_text="ai_extraction / manual_add / rule_based",
    )
    prompt_run = models.ForeignKey(
        "generation.PromptRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extracted_requirements",
        verbose_name="AI 运行记录",
    )
    
    # 状态
    is_active = models.BooleanField(
        "是否有效",
        default=True,
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="人工确认人",
    )
    verified_at = models.DateTimeField(
        "确认时间",
        null=True,
        blank=True,
    )
    
    class Meta:
        db_table = "tender_requirement"
        verbose_name = "招标条款"
        verbose_name_plural = "招标条款"
        ordering = ["tender_file", "requirement_code"]
        indexes = [
            models.Index(fields=["tender_file", "requirement_type"]),
            models.Index(fields=["is_starred"]),
            models.Index(fields=["requirement_code"]),
        ]
```

### 2.2 PromptScenario 新增场景

```python
# backend/apps/generation/constants.py

class PromptScenario:
    # 现有场景...
    
    # 新增场景
    REQUIREMENT_EXTRACTION = "requirement_extraction"  # 条款抽取
    
    CHOICES = [
        # 现有选项...
        (REQUIREMENT_EXTRACTION, "条款抽取"),
    ]
```

## 3. 服务层设计

### 3.1 RequirementExtractionService

```python
# backend/apps/tender/services/requirement_extraction_service.py

class RequirementExtractionService:
    """条款抽取服务。"""
    
    def __init__(self):
        self.ai_task_service = AiTaskExecutionService()
    
    def extract_requirements(
        self,
        tender_file_id: int,
        created_by,
        prompt_version_id: int | None = None,
        model_config_id: int | None = None,
        rag_options: dict | None = None,
        force: bool = False,
    ) -> list[TenderRequirement]:
        """执行条款抽取。
        
        Args:
            tender_file_id: 招标文件 ID
            created_by: 创建人
            prompt_version_id: 指定提示词版本（可选）
            model_config_id: 指定模型配置（可选）
            rag_options: RAG 配置（可选）
            force: 是否强制重新抽取（默认 false，已有条款则跳过）
            
        Returns:
            提取的条款列表
            
        Raises:
            TenderFileNotFoundError: 文件不存在
            ParsedDocumentNotFoundError: 文件未解析
            AiTaskExecutionError: AI 执行失败
        """
        # 1. 校验文件状态
        tender_file = self._validate_tender_file(tender_file_id)
        parsed_doc = self._get_parsed_document(tender_file)
        
        # 2. 检查是否已有条款（force=false 时跳过）
        if not force:
            existing = TenderRequirement.objects.filter(
                tender_file=tender_file,
                is_active=True,
            ).exists()
            if existing:
                return list(TenderRequirement.objects.filter(
                    tender_file=tender_file,
                    is_active=True,
                ))
        
        # 3. 准备输入变量
        variables = self._prepare_variables(tender_file, parsed_doc)
        
        # 4. 执行 AI 任务
        prompt_run = self.ai_task_service.execute(
            scenario=PromptScenario.REQUIREMENT_EXTRACTION,
            variables=variables,
            created_by=created_by,
            prompt_version_id=prompt_version_id,
            model_config_id=model_config_id,
            rag_options=rag_options,
            source="requirement_extraction",
            business_context={
                "tender_file_id": tender_file.id,
                "parsed_document_id": parsed_doc.id,
            },
        )
        
        # 5. 解析输出并创建条款
        if prompt_run.status == PromptRunStatus.SUCCEEDED:
            requirements = self._create_requirements_from_output(
                prompt_run.output_json,
                tender_file,
                parsed_doc,
                prompt_run,
                created_by,
            )
            return requirements
        
        # 6. 失败时抛出异常
        raise AiTaskExecutionError(
            f"条款抽取失败: {prompt_run.error_message}"
        )
    
    def _validate_tender_file(self, tender_file_id: int) -> TenderFile:
        """校验招标文件。"""
        tender_file = TenderFile.objects.get(pk=tender_file_id)
        if tender_file.status not in ["parsed", "completed"]:
            raise ValueError(f"文件状态为 {tender_file.status}，需要先完成解析")
        return tender_file
    
    def _get_parsed_document(self, tender_file: TenderFile) -> ParsedDocument:
        """获取解析文档。"""
        parsed_doc = ParsedDocument.objects.filter(
            tender_file=tender_file,
            is_active=True,
        ).order_by("-version").first()
        if not parsed_doc:
            raise ValueError("文件尚未完成解析，无法提取条款")
        return parsed_doc
    
    def _prepare_variables(
        self,
        tender_file: TenderFile,
        parsed_doc: ParsedDocument,
    ) -> dict:
        """准备输入变量。
        
        关键信息：
        - 文件基本信息（文件名、页数等）
        - 分块内容（KnowledgeChunk 列表）
        - 重点关注：★条款、评分项、截止时间等
        """
        # 获取分块内容
        chunks = KnowledgeChunk.objects.filter(
            document__tender_file=tender_file,
            document__is_deleted=False,
        ).select_related("document").order_by("chunk_index")
        
        # 组装分块文本
        chunk_texts = []
        for chunk in chunks[:100]:  # 限制数量避免过长
            chunk_texts.append({
                "chunk_id": chunk.id,
                "chunk_index": chunk.chunk_index,
                "section_path": chunk.section_path,
                "title": chunk.title,
                "content": chunk.content[:2000],  # 截断过长内容
                "chunk_type": chunk.chunk_type,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
            })
        
        return {
            "file_name": tender_file.original_name,
            "page_count": parsed_doc.page_count,
            "parse_quality": parsed_doc.parse_quality,
            "chunks": chunk_texts,
            "total_chunks": chunks.count(),
            "query": "提取招标文件中的实质性响应条款（★条款）和评分条款",
        }
    
    def _create_requirements_from_output(
        self,
        output_json: dict,
        tender_file: TenderFile,
        parsed_doc: ParsedDocument,
        prompt_run: PromptRun,
        created_by,
    ) -> list[TenderRequirement]:
        """从 AI 输出创建条款。"""
        requirements_data = output_json.get("requirements", [])
        requirements = []
        
        for item in requirements_data:
            # 匹配来源分块
            source_chunk = None
            if item.get("source_chunk_id"):
                try:
                    source_chunk = KnowledgeChunk.objects.get(
                        pk=item["source_chunk_id"]
                    )
                except KnowledgeChunk.DoesNotExist:
                    pass
            
            requirement = TenderRequirement.objects.create(
                tender_file=tender_file,
                parsed_document=parsed_doc,
                source_chunk=source_chunk,
                requirement_code=item.get("requirement_code", ""),
                section_path=item.get("section_path", ""),
                content=item.get("content", ""),
                content_summary=item.get("content_summary", ""),
                requirement_type=item.get("requirement_type", "technical"),
                response_level=item.get("response_level", "can_meet"),
                is_starred=item.get("is_starred", False),
                score_weight=item.get("score_weight"),
                score_criteria=item.get("score_criteria", ""),
                deadline_info=item.get("deadline_info", ""),
                contact_info=item.get("contact_info", ""),
                extraction_method="ai_extraction",
                prompt_run=prompt_run,
                created_by=created_by,
            )
            requirements.append(requirement)
        
        return requirements
```

## 4. API 设计

### 4.1 端点

```
POST /api/tender/tender-files/{id}/extract-requirements/
```

### 4.2 Request

```json
{
    "prompt_version_id": 1,      // 可选
    "model_config_id": 1,        // 可选
    "rag_options": {             // 可选
        "enabled": true,
        "knowledge_base_ids": [1, 2],
        "top_k": 10
    },
    "force": false               // 可选，默认 false
}
```

### 4.3 Response

```json
{
    "success": true,
    "message": "条款抽取完成",
    "data": {
        "total_count": 15,
        "starred_count": 5,
        "scoring_count": 3,
        "requirements": [
            {
                "id": 1,
                "requirement_code": "★1",
                "content": "...",
                "requirement_type": "mandatory",
                "is_starred": true,
                ...
            }
        ],
        "prompt_run_id": 100
    }
}
```

## 5. Prompt 设计

### 5.1 条款抽取提示词模板

```
# 系统提示词

你是一个专业的招标文件分析专家。你的任务是从招标文件中提取关键条款。

重点关注：
1. ★条款（实质性响应条款）- 必须完全响应，否则投标无效
2. 评分条款 - 影响中标概率的重要条款
3. 截止时间、联系方式等关键信息

输出格式要求：
- JSON 格式
- 每个条款包含编号、内容、类型、响应要求等字段

# 用户提示词

文件名称：{{file_name}}
总页数：{{page_count}}
总分块数：{{total_chunks}}

以下是招标文件的分块内容：
{% for chunk in chunks %}
【分块 {{chunk.chunk_index}}】{{chunk.section_path}}
{{chunk.content}}
{% endfor %}

{% if retrieved_knowledge %}
参考知识：
{{retrieved_knowledge}}
{% endif %}

请提取所有实质性响应条款（★条款）和评分条款。

# 输出 Schema

{
    "type": "object",
    "properties": {
        "requirements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "requirement_code": {"type": "string"},
                    "section_path": {"type": "string"},
                    "content": {"type": "string"},
                    "content_summary": {"type": "string"},
                    "requirement_type": {
                        "type": "string",
                        "enum": ["mandatory", "scoring", "technical", "business", "legal"]
                    },
                    "response_level": {
                        "type": "string",
                        "enum": ["must_meet", "should_meet", "can_meet", "optional"]
                    },
                    "is_starred": {"type": "boolean"},
                    "score_weight": {"type": "number"},
                    "score_criteria": {"type": "string"},
                    "deadline_info": {"type": "string"},
                    "contact_info": {"type": "string"},
                    "source_chunk_id": {"type": "integer"}
                },
                "required": ["requirement_code", "content", "requirement_type"]
            }
        },
        "summary": {
            "type": "object",
            "properties": {
                "total_requirements": {"type": "integer"},
                "starred_count": {"type": "integer"},
                "scoring_count": {"type": "integer"},
                "key_deadlines": {"type": "array", "items": {"type": "string"}},
                "key_contacts": {"type": "array", "items": {"type": "string"}}
            }
        }
    },
    "required": ["requirements"]
}
```

## 6. 实现步骤

1. **创建 TenderRequirement 模型** - 数据库表
2. **添加 REQUIREMENT_EXTRACTION 场景常量**
3. **创建 RequirementExtractionService** - 服务层
4. **创建 API 视图** - REST 端点
5. **创建测试用例** - 单元测试和集成测试
6. **数据库迁移** - makemigrations + migrate

## 7. 依赖关系

- P0.3 DeepSeek LLM 接入 ✅
- P0.4 AiTaskExecutionService ✅
- KnowledgeChunk 模型（已存在）
- ParsedDocument 模型（已存在）
- TenderFile 模型（已存在）

## 8. 验证标准

1. API 调用成功返回条款列表
2. ★条款正确识别（is_starred=true）
3. 评分条款权重正确提取
4. PromptRun 记录完整的 metadata
5. 重复调用时（force=false）不重复创建条款
6. force=true 时删除旧条款重新抽取