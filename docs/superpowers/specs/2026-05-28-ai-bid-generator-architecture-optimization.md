# AI 标书生成系统架构优化与功能规划

> **版本：** 1.0
> **日期：** 2026-05-28
> **状态：** 规划中

---

## 1. 核心设计理念

### 1.1 架构转型

**提示词管理不是独立后台功能，而是整个 AI 标书生成系统的"AI 能力配置中心"。**

后续所有 AI 生成/抽取/分析功能，都应该变成：

```
PromptVersion + RAG + LLM + PromptRun + 业务入库
```

的标准链路。

### 1.2 统一执行链路

```
业务输入（TenderChunk / TenderRequirement / Outline / Section）
    ↓
选择 PromptScenario
    ↓
获取已发布 PromptVersion
    ↓
可选 RAG 检索（RetrievalService + RagContextBuilder）
    ↓
变量组装（retrieved_knowledge / retrieval_sources）
    ↓
PromptExecutionService（或新增 AiTaskExecutionService）
    ↓
LLMService 调用
    ↓
OutputSchemaValidator
    ↓
业务结果入库（TenderRequirement / Outline / Section）
    ↓
PromptRun 追踪
```

---

## 2. 当前实现状态分析

### 2.1 已完成的核心基础设施

| 模块 | 实现状态 | 说明 |
|------|----------|------|
| **用户认证与权限** | ✅ 完成 | JWT + RBAC，权限码注册机制完善 |
| **项目管理** | ✅ 完成 | Project / Lot / Member / Role 完整 |
| **招标文件解析** | ✅ 完成 | ParseService + TenderChunk 分块 |
| **工作流模板** | ✅ 完成 | WorkflowTemplate / NodeTemplate |
| **提示词管理** | ✅ 完成 | PromptTemplate / PromptVersion / ModelConfig |
| **Prompt Playground** | ✅ 完成 | 渲染预览 + 运行测试 + RAG 配置 |
| **知识库基础** | ✅ 完成 | KnowledgeBase / Document / Chunk |
| **RAG 检索** | ✅ 完成 | PostgreSQL 全文检索 + jieba 分词 |
| **系统设置** | ✅ 完成 | 模型配置 / 存储配置 / 安全设置 |

### 2.2 待开发/待接入的功能

| 功能 | 状态 | 优先级 | 依赖 |
|------|------|--------|------|
| **真实 LLM 接入（DeepSeek）** | ⏳ 框架已有，未实现 | P0 | 无 |
| **统一 AI 任务执行服务** | ❌ 未开发 | P0 | LLM 接入 |
| **条款抽取（AI 驱动）** | ❌ 未开发 | P1 | AI 任务服务 |
| **Embedding 向量检索** | ❌ 未开发 | P1 | 百炼接入 |
| **大纲生成** | ❌ 未开发 | P2 | AI 任务服务 |
| **章节撰写** | ❌ 未开发 | P2 | AI 任务服务 + RAG |
| **评分点分析** | ❌ 未开发 | P2 | AI 任务服务 |
| **工作流执行引擎** | ❌ 未开发 | P2 | AI 任务服务 |

### 2.3 已有代码架构分析

#### generation 模块（已完成）

```text
backend/apps/generation/
├── models/
│   ├── prompt_template.py    # ✅ 提示词模板
│   ├── prompt_version.py     # ✅ 版本管理
│   ├── model_provider.py     # ✅ 供应商配置
│   ├── model_config.py       # ✅ 模型配置
│   └── prompt_run.py         # ✅ 运行记录
├── services/
│   ├── prompt_render_service.py     # ✅ Jinja2 渲染
│   ├── prompt_execution_service.py  # ✅ 执行服务
│   └── llm_service.py               # ⚠️ 框架已有，BailianClient 未实现
├── providers/
│   ├── base.py              # ✅ 抽象基类
│   ├── mock_client.py       # ✅ Mock 实现
│   └── bailian_client.py    # ⚠️ 抛出 NotImplementedError
└── views/
    ├── template_views.py    # ✅ 模板管理 API
    └── playground_views.py  # ✅ Playground API
```

#### knowledge 模块（已完成）

```text
backend/apps/knowledge/
├── models/
│   ├── knowledge_base.py    # ✅ 知识库
│   ├── knowledge_document.py # ✅ 文档管理
│   ├── knowledge_chunk.py   # ✅ 分块存储
│   └── retrieval_log.py     # ✅ 检索日志
├── services/
│   ├── retrieval_service.py      # ✅ 检索服务
│   ├── rag_context_builder.py    # ✅ 上下文构建
│   └── search_vector_service.py  # ✅ 全文索引
└── views/
    ├── knowledge_base_views.py   # ✅ 知识库 API
    ├── document_views.py         # ✅ 文档 API
    └── retrieval_views.py        # ✅ 检索测试 API
```

#### tender 模块（已完成解析，待接入 AI）

```text
backend/apps/tender/
├── models/
│   ├── tender_file.py       # ✅ 招标文件元数据
│   ├── parsed_document.py   # ✅ 解析结果
│   ├── tender_chunk.py      # ✅ 文档分块
│   └── pipeline_job.py      # ✅ 流水线任务
├── services/
│   ├── parse_service.py     # ✅ 文档解析
│   ├── chunk_service.py     # ✅ 分块服务
│   └── upload_service.py    # ✅ 上传服务
└── views.py                 # ✅ 上传/解析 API
```

---

## 3. PromptScenario 统一设计

### 3.1 场景枚举（已有）

```python
# backend/apps/generation/constants.py（已存在）

class PromptScenario:
    OUTLINE_GENERATION = "outline_generation"       # 大纲生成
    SECTION_WRITING = "section_writing"             # 章节撰写
    REQUIREMENT_ANALYSIS = "requirement_analysis"   # 条款分析
    REQUIREMENT_RESPONSE = "requirement_response"   # 条款响应
    SCORING_ANALYSIS = "scoring_analysis"           # 评分点分析
    DEVIATION_ANALYSIS = "deviation_analysis"       # 偏离分析
    EVIDENCE_MATCHING = "evidence_matching"         # 资料匹配
    CONTENT_POLISHING = "content_polishing"         # 内容润色
    CONSISTENCY_CHECK = "consistency_check"         # 一致性检查
    TENDER_QA = "tender_qa"                         # 招标问答
```

### 3.2 需新增的场景

```python
# 建议新增
REQUIREMENT_EXTRACTION = "requirement_extraction"   # 条款抽取（新增）
```

### 3.3 场景与业务模型对应关系

| 场景 | 输入 | 输出 | 业务模型 |
|------|------|------|----------|
| requirement_extraction | TenderChunk | JSON Array | TenderRequirement |
| requirement_analysis | TenderRequirement | JSON | RequirementAnalysis |
| outline_generation | ParsedDocument | JSON | Outline / OutlineSection |
| section_writing | OutlineSection + RAG | Markdown | Section |
| scoring_analysis | TenderRequirement | JSON | ScoringPoint |
| deviation_analysis | TenderRequirement | JSON | DeviationRecord |

---

## 4. 统一 AI 任务执行服务设计

### 4.1 AiTaskExecutionService 新增

```python
# backend/apps/generation/services/ai_task_execution_service.py

class AiTaskExecutionService:
    """统一 AI 任务执行服务。
    
    所有 AI 业务任务统一调用此服务，确保：
    - 提示词版本可追溯
    - RAG 上下文可配置
    - 输出 Schema 可校验
    - PromptRun 可追踪
    """
    
    def execute(
        self,
        scenario: str,
        variables: dict,
        created_by,
        model_config_id: int | None = None,
        prompt_version_id: int | None = None,
        rag_options: dict | None = None,
        source: str = "business_task",
        business_context: dict | None = None,
    ) -> PromptRun:
        """执行 AI 任务。
        
        Args:
            scenario: PromptScenario 枚举值
            variables: 输入变量
            created_by: 创建人
            model_config_id: 模型配置ID（可选，默认使用场景默认）
            prompt_version_id: 提示词版本ID（可选，默认使用已发布版本）
            rag_options: RAG 配置
            source: 任务来源（business_task / playground / scheduled）
            business_context: 业务上下文（project_id / tender_file_id 等）
            
        Returns:
            PromptRun 运行记录
        """
        # 1. 获取 PromptVersion
        if prompt_version_id:
            prompt_version = PromptVersion.objects.get(pk=prompt_version_id)
        else:
            prompt_version = self._get_published_version(scenario)
        
        # 2. 处理 RAG
        rag_context = ""
        rag_metadata = {"rag_enabled": False}
        
        if rag_options and rag_options.get("enabled"):
            rag_result = self._execute_rag(rag_options, created_by)
            rag_context = rag_result["context"]
            rag_metadata = rag_result["metadata"]
            
            # 注入变量
            variables["retrieved_knowledge"] = rag_context
            variables["retrieval_sources"] = rag_metadata["sources"]
        
        # 3. 确定模型配置
        if model_config_id:
            model_config = ModelConfig.objects.get(pk=model_config_id)
        else:
            model_config = self._get_default_model_config()
        
        # 4. 渲染提示词
        rendered = self.render_service.render(prompt_version, variables)
        
        # 5. 创建 PromptRun
        run = PromptRun.objects.create(
            prompt_template=prompt_version.template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=scenario,
            input_variables=variables,
            rendered_system_prompt=rendered.system_prompt,
            rendered_user_prompt=rendered.user_prompt,
            status=PromptRunStatus.RUNNING,
            created_by=created_by,
            metadata={
                "source": source,
                **rag_metadata,
                **(business_context or {}),
            },
        )
        
        # 6. 调用 LLM
        start_time = time.time()
        try:
            response = self.llm_service.chat(
                model_config=model_config,
                system_prompt=rendered.system_prompt,
                user_prompt=rendered.user_prompt,
                response_format=prompt_version.output_schema or None,
            )
            
            # 7. 校验 Schema
            output_json = self._parse_and_validate(
                response.text,
                prompt_version.output_schema,
            )
            
            # 8. 更新成功
            run.output_text = response.text
            run.output_json = output_json
            run.prompt_tokens = response.prompt_tokens
            run.completion_tokens = response.completion_tokens
            run.total_tokens = response.total_tokens
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.status = PromptRunStatus.SUCCEEDED
            run.save()
            
            # 9. 反向绑定 RetrievalLog
            if rag_metadata.get("retrieval_log_id"):
                RetrievalLog.objects.filter(
                    id=rag_metadata["retrieval_log_id"]
                ).update(prompt_run=run)
            
        except Exception as e:
            run.status = PromptRunStatus.FAILED
            run.error_message = str(e)[:2000]
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.save()
            raise
        
        return run
    
    def _get_published_version(self, scenario: str) -> PromptVersion:
        """获取场景的已发布版本。"""
        template = PromptTemplate.objects.get(
            scenario=scenario,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        return PromptVersion.objects.get(
            template=template,
            status=PromptVersionStatus.PUBLISHED,
        )
    
    def _execute_rag(self, rag_options: dict, created_by) -> dict:
        """执行 RAG 检索。"""
        from apps.knowledge.services.retrieval_service import RetrievalService
        from apps.knowledge.services.rag_context_builder import RagContextBuilder
        
        retrieval_service = RetrievalService()
        context_builder = RagContextBuilder()
        
        retrieval = retrieval_service.search(
            query=rag_options["query"],
            knowledge_base_ids=rag_options["knowledge_base_ids"],
            top_k=rag_options.get("top_k", 5),
            filters=rag_options.get("filters"),
            created_by=created_by,
        )
        
        context = context_builder.build(
            retrieval["results"],
            max_tokens=rag_options.get("max_context_tokens", 4000),
        )
        
        return {
            "context": context["text"],
            "metadata": {
                "rag_enabled": True,
                "retrieval_log_id": retrieval["log_id"],
                "retrieval_sources": context["sources"],
            },
        }
```

---

## 5. 真实 LLM 接入设计（DeepSeek）

### 5.1 DeepSeek Provider 实现

```python
# backend/apps/generation/providers/deepseek_client.py

import os
import json
import time
import httpx
from apps.generation.providers.base import ProviderClient, LLMResponse


class DeepSeekClient(ProviderClient):
    """DeepSeek LLM 客户端。"""
    
    BASE_URL = "https://api.deepseek.com/v1"
    
    def __init__(self):
        self.api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    
    def chat(
        self,
        model_config,
        system_prompt: str,
        user_prompt: str,
        response_format: dict | None = None,
    ) -> LLMResponse:
        """执行 DeepSeek 调用。"""
        start_time = time.time()
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # 构建消息
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})
        
        # 构建请求体
        payload = {
            "model": model_config.model_name or "deepseek-chat",
            "messages": messages,
            "temperature": model_config.temperature,
            "max_tokens": model_config.max_tokens,
            "top_p": model_config.top_p,
        }
        
        # JSON 模式（DeepSeek 支持 response_format）
        if response_format:
            payload["response_format"] = {"type": "json_object"}
        
        # 发送请求
        with httpx.Client(timeout=model_config.timeout_seconds) as client:
            response = client.post(
                f"{self.BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        
        # 解析响应
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        
        # 解析 JSON
        output_json = {}
        if content:
            try:
                output_json = json.loads(content)
            except json.JSONDecodeError:
                pass
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        return LLMResponse(
            text=content,
            json=output_json,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            latency_ms=latency_ms,
        )
```

### 5.2 LLMService 更新

```python
# backend/apps/generation/services/llm_service.py

from apps.generation.providers import (
    MockLLMClient,
    BailianClient,
    DeepSeekClient,  # 新增
)


class LLMService:
    """LLM 调用服务。"""

    def __init__(self):
        self._providers = {
            "mock": MockLLMClient(),
            "dashscope": BailianClient(),
            "deepseek": DeepSeekClient(),  # 新增
            "openai_compatible": OpenAICompatibleClient(),
        }
```

### 5.3 系统设置配置

在 ModelProvider 表中添加 DeepSeek 配置：

```sql
INSERT INTO generation_model_provider (key, name, provider_type, base_url, is_active)
VALUES ('deepseek', 'DeepSeek', 'deepseek', 'https://api.deepseek.com/v1', true);
```

---

## 6. 条款抽取功能设计（AI 驱动）

### 6.1 TenderRequirement 模型增强

```python
# backend/apps/tender/models/tender_requirement.py（新增字段）

class TenderRequirement(TimeStampedModel):
    """招标需求条款。"""
    
    # ... 已有字段 ...
    
    # 新增：AI 追踪字段
    source_prompt_run = models.ForeignKey(
        "generation.PromptRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extracted_requirements",
        verbose_name="来源 PromptRun",
    )
    prompt_version = models.ForeignKey(
        "generation.PromptVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extracted_requirements",
        verbose_name="提示词版本",
    )
    extraction_mode = models.CharField(
        "抽取方式",
        max_length=32,
        default="ai",
        choices=[
            ("ai", "AI 抽取"),
            ("rule", "规则抽取"),
            ("manual", "人工录入"),
        ],
    )
    rag_enabled = models.BooleanField("是否启用 RAG", default=False)
```

### 6.2 条款抽取 API

```python
# backend/apps/tender/views.py

class RequirementExtractView(APIView):
    """条款抽取视图。"""
    
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "tender.manage"
    
    def post(self, request, file_id):
        serializer = RequirementExtractRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        tender_file = get_object_or_404(TenderFile, pk=file_id)
        
        # 获取候选 chunk
        chunks = self._get_candidate_chunks(tender_file)
        
        # 调用 AI 任务执行服务
        ai_service = AiTaskExecutionService()
        
        requirements = []
        for chunk in chunks:
            run = ai_service.execute(
                scenario=PromptScenario.REQUIREMENT_EXTRACTION,
                variables={
                    "chunk_content": chunk.content,
                    "chunk_type": chunk.chunk_type,
                    "section_path": chunk.section_path,
                },
                created_by=request.user,
                prompt_version_id=serializer.validated_data.get("prompt_version_id"),
                rag_options=serializer.validated_data.get("rag_options"),
                business_context={
                    "tender_file_id": tender_file.id,
                    "chunk_id": chunk.id,
                },
            )
            
            if run.status == PromptRunStatus.SUCCEEDED:
                # 解析结果入库
                for req_data in run.output_json.get("requirements", []):
                    req = TenderRequirement.objects.create(
                        tender_file=tender_file,
                        chunk=chunk,
                        content=req_data.get("content", ""),
                        requirement_type=req_data.get("type", "general"),
                        mandatory_level=req_data.get("mandatory_level", "optional"),
                        source_prompt_run=run,
                        prompt_version=run.prompt_version,
                        extraction_mode="ai",
                        rag_enabled=serializer.validated_data.get("rag_options", {}).get("enabled", False),
                    )
                    requirements.append(req)
        
        # 更新文件状态
        tender_file.status = TenderFile.STATUS_REQUIREMENT_EXTRACTED
        tender_file.save()
        
        return Response({
            "extracted_count": len(requirements),
            "requirements": TenderRequirementSerializer(requirements, many=True).data,
        })
```

### 6.3 条款抽取 PromptTemplate 示例

```text
# requirement_extraction.default v1.0.0

## System Prompt

你是一位专业的招标文件分析专家，擅长从招标文件中识别和抽取关键条款。
请分析提供的招标文件片段，识别其中的要求条款，并输出结构化 JSON。

## User Prompt

请分析以下招标文件片段，抽取所有要求条款：

章节路径：{{ section_path }}
片段类型：{{ chunk_type }}
内容：
{{ chunk_content }}

请以 JSON 格式输出，包含 requirements 数组，每个元素包含：
- content: 条款内容原文
- type: 条款类型（qualification/technical/scoring/legal/other）
- mandatory_level: 强制程度（must/should/optional）
- keywords: 关键词数组

## Output Schema

{
  "type": "object",
  "properties": {
    "requirements": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "content": {"type": "string"},
          "type": {"type": "string", "enum": ["qualification", "technical", "scoring", "legal", "other"]},
          "mandatory_level": {"type": "string", "enum": ["must", "should", "optional"]},
          "keywords": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["content", "type", "mandatory_level"]
      }
    }
  },
  "required": ["requirements"]
}
```

---

## 7. Embedding 向量检索设计（百炼）

### 7.1 Embedding 服务实现

```python
# backend/apps/knowledge/services/embedding_service.py

import os
import httpx
from typing import List


class EmbeddingService:
    """Embedding 向量生成服务。"""
    
    def __init__(self):
        self.api_key = os.environ.get("BAILIAN_API_KEY", "")
        self.base_url = "https://dashscope.aliyuncs.com/api/v1"
    
    def embed(self, texts: List[str]) -> List[List[float]]:
        """生成文本向量。"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": "text-embedding-v4",
            "input": texts,
        }
        
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f"{self.base_url}/embeddings",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        
        return [item["embedding"] for item in data["data"]]
    
    def embed_chunks(self, chunk_ids: List[int]) -> int:
        """批量为 chunk 生成向量。"""
        from apps.knowledge.models import KnowledgeChunk
        
        chunks = KnowledgeChunk.objects.filter(id__in=chunk_ids)
        texts = [chunk.content for chunk in chunks]
        
        embeddings = self.embed(texts)
        
        # 更新 chunk
        for chunk, embedding in zip(chunks, embeddings):
            chunk.embedding = embedding
            chunk.embedding_status = "done"
            chunk.save()
        
        return len(chunks)
```

### 7.2 KnowledgeChunk 模型增强

```python
# backend/apps/knowledge/models/knowledge_chunk.py（新增字段）

from django.contrib.postgres.fields import VectorField
from pgvector.django import VectorField as PGVectorField


class KnowledgeChunk(TimeStampedModel):
    # ... 已有字段 ...
    
    # 新增：向量字段
    embedding = PGVectorField(null=True, blank=True, dimensions=1536)
    embedding_status = models.CharField(
        "嵌入状态",
        max_length=16,
        default="pending",
        choices=[
            ("pending", "待嵌入"),
            ("processing", "嵌入中"),
            ("done", "已完成"),
            ("failed", "失败"),
        ],
    )
    
    class Meta:
        # ... 已有配置 ...
        indexes = [
            # ... 已有索引 ...
            # 向量索引（hnsw）
            GinIndex(fields=["embedding"], name="knowledge_chunk_embedding_gin"),
        ]
```

### 7.3 混合检索服务更新

```python
# backend/apps/knowledge/services/retrieval_service.py

class RetrievalService:
    """知识检索服务。"""
    
    def search(
        self,
        query: str,
        knowledge_base_ids: list[int],
        top_k: int = 10,
        retrieval_mode: str = RetrievalMode.HYBRID,  # 新增 hybrid 模式
        # ...
    ) -> dict:
        """执行检索。"""
        
        if retrieval_mode == RetrievalMode.HYBRID:
            # 1. 全文检索
            fulltext_results = self._fulltext_search(query, knowledge_base_ids, top_k * 2)
            
            # 2. 向量检索
            vector_results = self._vector_search(query, knowledge_base_ids, top_k * 2)
            
            # 3. 融合排序（RRF）
            results = self._reciprocal_rank_fusion(fulltext_results, vector_results, top_k)
            
        # ... 其他模式 ...
        
        return results
    
    def _vector_search(self, query: str, knowledge_base_ids: list[int], top_k: int) -> list:
        """向量检索。"""
        from apps.knowledge.services.embedding_service import EmbeddingService
        
        # 1. 生成查询向量
        embedding_service = EmbeddingService()
        query_embedding = embedding_service.embed([query])[0]
        
        # 2. 向量相似度搜索
        results = KnowledgeChunk.objects.filter(
            document__knowledge_base_id__in=knowledge_base_ids,
            embedding_status="done",
        ).annotate(
            similarity=CosineDistance("embedding", query_embedding)
        ).order_by("similarity")[:top_k]
        
        return list(results)
    
    def _reciprocal_rank_fusion(self, results_a: list, results_b: list, top_k: int) -> list:
        """倒数排名融合（RRF）。"""
        k = 60  # RRF 参数
        scores = {}
        
        for i, item in enumerate(results_a):
            if item.id not in scores:
                scores[item.id] = {"item": item, "score": 0}
            scores[item.id]["score"] += 1 / (k + i + 1)
        
        for i, item in enumerate(results_b):
            if item.id not in scores:
                scores[item.id] = {"item": item, "score": 0}
            scores[item.id]["score"] += 1 / (k + i + 1)
        
        # 按分数排序
        sorted_items = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
        return [s["item"] for s in sorted_items[:top_k]]
```

---

## 8. 开发优先级与路线图

### Phase 1: LLM 接入（P0，1周）

```
✓ DeepSeekClient 实现
✓ LLMService 集成
✓ Provider 配置入库
✓ Playground 真实运行测试
✓ PromptRun 真实记录
```

### Phase 2: 统一 AI 任务服务（P0，1周）

```
✓ AiTaskExecutionService 实现
✓ PromptScenario 统一调度
✓ RAG 注入流程
✓ Schema 校验流程
✓ PromptRun 追踪
```

### Phase 3: 条款抽取（P1，2周）

```
✓ requirement_extraction PromptTemplate
✓ TenderRequirement 模型增强
✓ 条款抽取 API
✓ 前端条款抽取配置
✓ 人工修正入口
```

### Phase 4: Embedding + 向量检索（P1，1周）

```
✓ 百炼 Embedding 接入
✓ KnowledgeChunk 向量字段
✓ 混合检索实现
✓ 批量嵌入任务
```

### Phase 5: 大纲生成与章节撰写（P2，3周）

```
✓ outline_generation PromptTemplate
✓ section_writing PromptTemplate
✓ Outline / Section 模型
✓ RAG 企业知识引用
✓ 生成结果入库
```

---

## 9. 文件变更清单

### 9.1 新增文件

```
backend/apps/generation/
├── services/
│   └── ai_task_execution_service.py    # 统一 AI 任务执行服务
├── providers/
│   └── deepseek_client.py              # DeepSeek 客户端

backend/apps/knowledge/
├── services/
│   └── embedding_service.py            # Embedding 服务

backend/apps/tender/
├── models/
│   └── tender_requirement.py           # 需求条款模型
├── services/
│   └── requirement_extract_service.py   # 条款抽取服务
└── views/
    └── requirement_views.py            # 条款管理 API
```

### 9.2 修改文件

```
backend/apps/generation/
├── constants.py                         # 新增 REQUIREMENT_EXTRACTION
├── services/llm_service.py             # 新增 DeepSeek provider

backend/apps/knowledge/
├── models/knowledge_chunk.py           # 新增 embedding 字段
├── services/retrieval_service.py      # 新增混合检索

frontend/src/views/
├── tender/
│   └── RequirementExtractView.vue     # 条款抽取配置页面
└── admin/
    └── PromptListView.vue              # 增加场景筛选
```

---

## 10. 验收标准

### P0 验收

- [ ] DeepSeek 真实调用通过
- [ ] Playground 真实运行成功
- [ ] PromptRun 记录真实 Token 消耗
- [ ] AiTaskExecutionService 可执行
- [ ] RAG 注入正确

### P1 验收

- [ ] 条款抽取 API 可用
- [ ] TenderRequirement 正确入库
- [ ] 条款可追溯 PromptRun
- [ ] Embedding 批量生成成功
- [ ] 混合检索返回结果

### P2 验收

- [ ] 大纲生成功能完整
- [ ] 章节撰写功能完整
- [ ] RAG 企业知识正确引用
- [ ] 所有 AI 任务可审计

---

## 修订历史

| 版本 | 日期 | 修订内容 |
|------|------|----------|
| 1.0 | 2026-05-28 | 初始版本，基于现有代码分析和架构优化需求 |
