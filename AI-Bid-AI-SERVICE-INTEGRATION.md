# 智能标书生成系统 - AI 服务集成设计

## 1. AI 服务架构

### 1.1 服务分层

```
┌─────────────────────────────────────────────────────────────┐
│                      AI 服务编排层                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AIServiceOrchestrator (TypeScript)                 │   │
│  │  - 统一调用入口                                       │   │
│  │  - 任务编排                                           │   │
│  │  - 结果聚合                                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      AI 能力层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ 文档解析服务  │  │ RAG 检索服务  │  │ LLM 生成服务  │     │
│  │ DocParser    │  │ RAGService   │  │ LLMGenerate  │     │
│  │ (Python)     │  │ (Python)     │  │ (TypeScript) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      模型服务层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Embedding    │  │ LLM Models   │  │ OCR Models   │     │
│  │ Models       │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 文档解析服务 (DocParser)

### 2.1 服务概述

**技术栈**：Python 3.11 + FastAPI
**端口**：5001
**核心能力**：
- PDF/Word/Excel 文档解析
- OCR 文字识别
- 表格提取
- 布局分析

### 2.2 API 设计

#### 解析文档

```python
# POST /parse/document
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import uuid

app = FastAPI()

class ParseRequest(BaseModel):
    file_url: str
    options: dict = {
        "extract_tables": True,
        "extract_images": True,
        "ocr_enabled": True
    }

class ParseResponse(BaseModel):
    task_id: str
    status: str

@app.post("/parse/document", response_model=ParseResponse)
async def parse_document(request: ParseRequest, background_tasks: BackgroundTasks):
    task_id = f"parse_{uuid.uuid4().hex[:12]}"
    
    # 添加后台任务
    background_tasks.add_task(
        process_document,
        task_id,
        request.file_url,
        request.options
    )
    
    return ParseResponse(task_id=task_id, status="processing")

async def process_document(task_id: str, file_url: str, options: dict):
    try:
        # 更新任务状态
        update_task_status(task_id, "processing")
        
        # 1. 下载文件
        file_path = await download_file(file_url)
        update_task_progress(task_id, 20)
        
        # 2. 解析文档
        result = await parse_file(file_path, options)
        update_task_progress(task_id, 80)
        
        # 3. 保存结果
        await save_parse_result(task_id, result)
        update_task_status(task_id, "completed", result)
        
    except Exception as e:
        update_task_status(task_id, "failed", {"error": str(e)})
```

#### 查询任务状态

```python
# GET /parse/task/{task_id}
@app.get("/parse/task/{task_id}")
async def get_task_status(task_id: str):
    task = await get_task_from_cache(task_id)
    
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "result": task.result
    }
```

### 2.3 核心解析逻辑

```python
# services/document_parser.py
import fitz  # PyMuPDF
import pdfplumber
from docx import Document
import pandas as pd
from paddleocr import PaddleOCR

class DocumentParser:
    def __init__(self):
        self.ocr = PaddleOCR(use_angle_cls=True, lang='ch')
    
    async def parse(self, file_path: str, options: dict) -> dict:
        file_type = self.detect_file_type(file_path)
        
        if file_type == 'pdf':
            return await self.parse_pdf(file_path, options)
        elif file_type == 'docx':
            return await self.parse_docx(file_path, options)
        elif file_type == 'xlsx':
            return await self.parse_xlsx(file_path, options)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
    
    async def parse_pdf(self, file_path: str, options: dict) -> dict:
        result = {
            "text": "",
            "tables": [],
            "images": [],
            "metadata": {}
        }
        
        # 1. 提取文本
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                result["text"] += page.extract_text() + "\n"
                
                # 提取表格
                if options.get("extract_tables"):
                    tables = page.extract_tables()
                    result["tables"].extend(tables)
        
        # 2. OCR 补充（针对扫描件）
        if options.get("ocr_enabled"):
            ocr_result = self.ocr.ocr(file_path, cls=True)
            for idx in range(len(ocr_result)):
                for line in ocr_result[idx]:
                    result["text"] += line[1][0] + "\n"
        
        # 3. 提取图片
        if options.get("extract_images"):
            doc = fitz.open(file_path)
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                images = page.get_images()
                for img in images:
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    result["images"].append({
                        "page": page_num + 1,
                        "data": base_image["image"],
                        "format": base_image["ext"]
                    })
        
        # 4. 元数据
        doc = fitz.open(file_path)
        result["metadata"] = {
            "page_count": len(doc),
            "title": doc.metadata.get("title"),
            "author": doc.metadata.get("author"),
            "created": doc.metadata.get("creationDate")
        }
        
        return result
    
    async def parse_docx(self, file_path: str, options: dict) -> dict:
        doc = Document(file_path)
        
        result = {
            "text": "",
            "tables": [],
            "images": [],
            "metadata": {}
        }
        
        # 提取文本
        for para in doc.paragraphs:
            result["text"] += para.text + "\n"
        
        # 提取表格
        if options.get("extract_tables"):
            for table in doc.tables:
                table_data = []
                for row in table.rows:
                    row_data = [cell.text for cell in row.cells]
                    table_data.append(row_data)
                result["tables"].append(table_data)
        
        return result
    
    async def parse_xlsx(self, file_path: str, options: dict) -> dict:
        excel_file = pd.ExcelFile(file_path)
        
        result = {
            "text": "",
            "tables": [],
            "images": [],
            "metadata": {}
        }
        
        for sheet_name in excel_file.sheet_names:
            df = pd.read_excel(excel_file, sheet_name=sheet_name)
            result["tables"].append({
                "sheet": sheet_name,
                "data": df.to_dict(orient='records')
            })
            
            # 转换为文本
            result["text"] += f"### {sheet_name}\n\n"
            result["text"] += df.to_string(index=False) + "\n\n"
        
        return result
    
    def detect_file_type(self, file_path: str) -> str:
        import magic
        mime = magic.from_file(file_path, mime=True)
        
        mime_map = {
            'application/pdf': 'pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
        }
        
        return mime_map.get(mime, 'unknown')
```

---

## 3. RAG 检索服务 (RAGService)

### 3.1 服务概述

**技术栈**：Python 3.11 + FastAPI + 向量数据库
**端口**：5002
**核心能力**：
- 文档向量化
- 语义检索
- 混合检索
- 检索结果重排序

### 3.2 API 设计

#### 向量化文档

```python
# POST /rag/index
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

class Document(BaseModel):
    id: str
    content: str
    metadata: dict = {}

class IndexRequest(BaseModel):
    documents: List[Document]
    options: dict = {
        "chunk_size": 500,
        "overlap": 100
    }

@app.post("/rag/index")
async def index_documents(request: IndexRequest):
    results = []
    
    for doc in request.documents:
        # 1. 文档分块
        chunks = chunk_document(
            doc.content,
            chunk_size=request.options.get("chunk_size", 500),
            overlap=request.options.get("overlap", 100)
        )
        
        # 2. 向量化
        for idx, chunk in enumerate(chunks):
            embedding = await get_embedding(chunk)
            
            # 3. 存储到向量数据库
            chunk_id = f"{doc.id}_chunk_{idx}"
            await store_embedding(
                chunk_id,
                embedding,
                {
                    "document_id": doc.id,
                    "chunk_index": idx,
                    "content": chunk,
                    **doc.metadata
                }
            )
            
            results.append({
                "chunk_id": chunk_id,
                "document_id": doc.id,
                "chunk_index": idx
            })
    
    return {
        "success": True,
        "indexed": len(results),
        "chunks": results
    }
```

#### 语义检索

```python
# POST /rag/search
class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filters: dict = {}
    rerank: bool = True

class SearchResult(BaseModel):
    chunk_id: str
    document_id: str
    content: str
    score: float
    metadata: dict

@app.post("/rag/search", response_model=List[SearchResult])
async def search(request: SearchRequest):
    # 1. 查询向量化
    query_embedding = await get_embedding(request.query)
    
    # 2. 向量检索
    vector_results = await vector_search(
        query_embedding,
        top_k=request.top_k * 2,  # 多检索一些用于重排序
        filters=request.filters
    )
    
    # 3. 关键词检索（混合检索）
    keyword_results = await keyword_search(
        request.query,
        top_k=request.top_k
    )
    
    # 4. 合并结果
    merged_results = merge_results(vector_results, keyword_results)
    
    # 5. 重排序
    if request.rerank:
        reranked_results = await rerank_results(
            request.query,
            merged_results
        )
        return reranked_results[:request.top_k]
    
    return merged_results[:request.top_k]
```

### 3.3 核心检索逻辑

```python
# services/rag_service.py
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Tuple

class RAGService:
    def __init__(self):
        self.embedding_model = SentenceTransformer('BAAI/bge-large-zh-v1.5')
        self.vector_db = VectorDB()  # 抽象的向量数据库客户端
    
    async def get_embedding(self, text: str) -> np.ndarray:
        """生成文本向量"""
        return self.embedding_model.encode(text, normalize_embeddings=True)
    
    async def vector_search(
        self,
        query_embedding: np.ndarray,
        top_k: int,
        filters: dict
    ) -> List[dict]:
        """向量相似度检索"""
        results = await self.vector_db.search(
            query_embedding,
            top_k=top_k,
            filter_clause=filters
        )
        
        return [
            {
                "chunk_id": r.id,
                "document_id": r.metadata["document_id"],
                "content": r.metadata["content"],
                "score": r.score,
                "metadata": r.metadata
            }
            for r in results
        ]
    
    async def keyword_search(self, query: str, top_k: int) -> List[dict]:
        """关键词检索（BM25）"""
        # 使用 Elasticsearch 或 Meilisearch
        results = await self.search_engine.search(
            query,
            limit=top_k
        )
        
        return results
    
    async def rerank_results(
        self,
        query: str,
        results: List[dict]
    ) -> List[dict]:
        """使用 Cross-Encoder 重排序"""
        from sentence_transformers import CrossEncoder
        
        reranker = CrossEncoder('BAAI/bge-reranker-large')
        
        # 构建查询-文档对
        pairs = [(query, r["content"]) for r in results]
        
        # 计算重排序分数
        scores = reranker.predict(pairs)
        
        # 按分数排序
        reranked = [
            {**results[i], "rerank_score": float(scores[i])}
            for i in range(len(results))
        ]
        reranked.sort(key=lambda x: x["rerank_score"], reverse=True)
        
        return reranked
    
    def merge_results(
        self,
        vector_results: List[dict],
        keyword_results: List[dict]
    ) -> List[dict]:
        """合并向量和关键词检索结果"""
        # 使用 Reciprocal Rank Fusion (RRF)
        k = 60  # RRF 参数
        
        score_map = {}
        
        # 向量检索分数
        for rank, result in enumerate(vector_results):
            chunk_id = result["chunk_id"]
            score_map[chunk_id] = score_map.get(chunk_id, 0) + 1 / (k + rank + 1)
        
        # 关键词检索分数
        for rank, result in enumerate(keyword_results):
            chunk_id = result["chunk_id"]
            score_map[chunk_id] = score_map.get(chunk_id, 0) + 1 / (k + rank + 1)
        
        # 合并结果
        all_results = {r["chunk_id"]: r for r in vector_results + keyword_results}
        
        merged = [
            {**all_results[chunk_id], "merged_score": score}
            for chunk_id, score in score_map.items()
        ]
        
        merged.sort(key=lambda x: x["merged_score"], reverse=True)
        
        return merged

def chunk_document(
    text: str,
    chunk_size: int = 500,
    overlap: int = 100
) -> List[str]:
    """智能文档分块"""
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", "。", "；", "，", " ", ""]
    )
    
    chunks = splitter.split_text(text)
    
    return chunks
```

---

## 4. LLM 生成服务 (LLMGenerate)

### 4.1 服务概述

**技术栈**：TypeScript + Express
**端口**：5003
**核心能力**：
- 内容生成（流式输出）
- 提示词模板管理
- 多模型支持
- Token 计数

### 4.2 API 设计

#### 流式生成

```typescript
// POST /llm/generate/stream
import express, { Request, Response } from 'express';
import { LLMClient } from './llm-client';

const app = express();
const llmClient = new LLMClient();

interface GenerateRequest {
  prompt: string;
  model?: 'doubao-pro-32k' | 'deepseek-chat' | 'kimi';
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
}

app.post('/llm/generate/stream', async (req: Request, res: Response) => {
  const { prompt, model = 'doubao-pro-32k', temperature = 0.7, max_tokens = 2000, system_prompt }: GenerateRequest = req.body;
  
  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const stream = await llmClient.generateStream({
      model,
      messages: [
        ...(system_prompt ? [{ role: 'system', content: system_prompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature,
      max_tokens
    });
    
    let totalTokens = 0;
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      totalTokens = chunk.usage?.total_tokens || totalTokens;
      
      // 发送 SSE 事件
      res.write(`data: ${JSON.stringify({
        content,
        done: chunk.choices[0]?.finish_reason === 'stop',
        usage: chunk.usage
      })}\n\n`);
    }
    
    res.write(`data: ${JSON.stringify({ done: true, usage: { total_tokens: totalTokens } })}\n\n`);
    res.end();
    
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
```

### 4.3 LLM 客户端封装

```typescript
// services/llm-client.ts
import { OpenAI } from 'openai';

interface LLMConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export class LLMClient {
  private clients: Map<string, OpenAI> = new Map();
  
  constructor() {
    // 初始化多个模型客户端
    this.clients.set('doubao', new OpenAI({
      apiKey: process.env.DOUBAO_API_KEY,
      baseURL: process.env.DOUBAO_BASE_URL
    }));
    
    this.clients.set('deepseek', new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1'
    }));
    
    this.clients.set('kimi', new OpenAI({
      apiKey: process.env.KIMI_API_KEY,
      baseURL: 'https://api.moonshot.cn/v1'
    }));
  }
  
  async generateStream(config: LLMConfig) {
    const client = this.getClient(config.model);
    
    return client.chat.completions.create({
      model: config.model,
      messages: config.messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 2000,
      stream: true
    });
  }
  
  async generate(config: LLMConfig) {
    const client = this.getClient(config.model);
    
    const response = await client.chat.completions.create({
      model: config.model,
      messages: config.messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 2000
    });
    
    return response.choices[0].message.content;
  }
  
  private getClient(model: string): OpenAI {
    if (model.startsWith('doubao')) return this.clients.get('doubao')!;
    if (model.startsWith('deepseek')) return this.clients.get('deepseek')!;
    if (model.startsWith('kimi')) return this.clients.get('kimi')!;
    
    throw new Error(`Unsupported model: ${model}`);
  }
  
  countTokens(text: string): number {
    // 使用 tiktoken 计算 token 数
    const tiktoken = require('tiktoken');
    const enc = tiktoken.get_encoding('cl100k_base');
    return enc.encode(text).length;
  }
}
```

### 4.4 提示词模板管理

```typescript
// services/prompt-templates.ts
export class PromptTemplateManager {
  private templates: Map<string, string> = new Map();
  
  constructor() {
    this.loadTemplates();
  }
  
  private loadTemplates() {
    // 招标文档解析提示词
    this.templates.set('tender_analysis', `
你是一位专业的招标文件分析专家。请仔细阅读以下招标文件内容，提取关键信息。

招标文件内容：
{document_content}

请按以下格式输出：
1. 项目基本信息
   - 项目名称：
   - 项目编号：
   - 采购人：
   - 预算金额：
   - 投标保证金：

2. 时间节点
   - 投标截止时间：
   - 开标时间：
   - 投标有效期：

3. 技术要求
   - 核心技术参数：
   - 性能指标：
   - 安全要求：

4. 资质要求
   - 企业资质：
   - 人员资质：
   - 业绩要求：

5. 评分标准
   {scoring_criteria}

6. 废标条款
   {disqualification_rules}

注意事项：
- 如果信息缺失，标注"未提及"
- 准确提取数字和日期
- 保持原文的专业术语
`);
    
    // 章节内容生成提示词
    this.templates.set('section_generation', `
你是一位专业的标书编写专家。请根据以下要求编写章节内容。

## 章节信息
标题：{section_title}
要求：{section_requirements}
字数要求：{word_count}字

## 参考资料（必须引用）
{reference_materials}

## 编写要求
1. 内容必须基于参考资料，不能编造事实
2. 每段内容后用 [来源N] 标注引用来源，例如：
   "本系统采用微服务架构设计[来源1]，具有高可用性和可扩展性[来源2]。"
3. 如果参考资料不足以回答要求，明确指出需要补充什么材料
4. 专业术语使用准确，符合招标文件规范
5. 内容结构清晰，逻辑严密
6. 语言专业、简洁、有力

## 输出格式
直接输出章节内容，不需要其他说明。
`);
    
    // 大纲生成提示词
    this.templates.set('outline_generation', `
你是一位专业的标书结构设计专家。请根据招标文件要求生成投标文件大纲。

## 招标文件信息
项目名称：{project_name}
主要内容：{document_summary}

## 招标文件格式要求
{format_requirements}

## 大纲生成要求
1. 严格按照招标文件的格式要求组织章节
2. 每个章节标注对应的要求和得分点
3. 章节层级不超过 3 级
4. 保持结构清晰、逻辑严密

## 输出格式（JSON）
{
  "sections": [
    {
      "title": "章节标题",
      "level": 1,
      "requirements": "章节要求",
      "score_point": "对应得分点",
      "children": []
    }
  ]
}
`);
  }
  
  getTemplate(name: string): string {
    return this.templates.get(name) || '';
  }
  
  fillTemplate(templateName: string, variables: Record<string, string>): string {
    let template = this.getTemplate(templateName);
    
    for (const [key, value] of Object.entries(variables)) {
      template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    
    return template;
  }
}
```

---

## 5. AI 服务编排层

### 5.1 编排服务设计

```typescript
// services/ai-orchestrator.ts
export class AIServiceOrchestrator {
  private docParserClient: DocParserClient;
  private ragServiceClient: RAGServiceClient;
  private llmClient: LLMClient;
  
  constructor() {
    this.docParserClient = new DocParserClient('http://localhost:5001');
    this.ragServiceClient = new RAGServiceClient('http://localhost:5002');
    this.llmClient = new LLMClient();
  }
  
  /**
   * 完整的招标文档解析流程
   */
  async parseTenderDocument(fileUrl: string, projectId: string): Promise<TenderAnalysis> {
    // 1. 调用文档解析服务
    const parseTask = await this.docParserClient.parseDocument({
      file_url: fileUrl,
      options: {
        extract_tables: true,
        extract_images: false,
        ocr_enabled: true
      }
    });
    
    // 2. 轮询解析状态
    const parseResult = await this.pollTaskStatus(
      parseTask.task_id,
      this.docParserClient.getTaskStatus.bind(this.docParserClient)
    );
    
    // 3. 调用 LLM 提取关键信息
    const analysis = await this.llmClient.generate({
      model: 'doubao-pro-32k',
      messages: [
        {
          role: 'user',
          content: this.buildTenderAnalysisPrompt(parseResult)
        }
      ],
      temperature: 0.3
    });
    
    // 4. 解析并结构化输出
    return JSON.parse(analysis);
  }
  
  /**
   * 完整的章节内容生成流程
   */
  async generateSectionContent(
    sectionId: string,
    requirements: string,
    projectId: string
  ): Promise<AsyncGenerator<GenerationChunk>> {
    // 1. RAG 检索相关资料
    const relevantDocs = await this.ragServiceClient.search({
      query: requirements,
      top_k: 10,
      filters: {
        project_id: projectId
      },
      rerank: true
    });
    
    // 2. 构建提示词
    const prompt = this.buildSectionPrompt(sectionId, requirements, relevantDocs);
    
    // 3. 流式生成内容
    const stream = await this.llmClient.generateStream({
      model: 'doubao-pro-32k',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 3000
    });
    
    // 4. 流式返回结果
    return this.processGenerationStream(stream, relevantDocs);
  }
  
  private async *processGenerationStream(
    stream: AsyncIterable<any>,
    sources: Source[]
  ): AsyncGenerator<GenerationChunk> {
    let accumulatedContent = '';
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      accumulatedContent += content;
      
      // 提取引用标注
      const citations = this.extractCitations(accumulatedContent, sources);
      
      yield {
        content,
        done: chunk.choices[0]?.finish_reason === 'stop',
        sources: citations
      };
    }
  }
  
  private extractCitations(content: string, sources: Source[]): Source[] {
    const citationPattern = /\[来源(\d+)\]/g;
    const citedSources: Source[] = [];
    const citedIndexes = new Set<number>();
    
    let match;
    while ((match = citationPattern.exec(content)) !== null) {
      const index = parseInt(match[1]) - 1;
      if (index >= 0 && index < sources.length && !citedIndexes.has(index)) {
        citedSources.push(sources[index]);
        citedIndexes.add(index);
      }
    }
    
    return citedSources;
  }
  
  private async pollTaskStatus(
    taskId: string,
    getStatusFn: (taskId: string) => Promise<any>
  ): Promise<any> {
    const maxAttempts = 60; // 最多等待 5 分钟
    const interval = 5000; // 5秒轮询一次
    
    for (let i = 0; i < maxAttempts; i++) {
      const status = await getStatusFn(taskId);
      
      if (status.status === 'completed') {
        return status.result;
      }
      
      if (status.status === 'failed') {
        throw new Error(status.error);
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Task timeout');
  }
}
```

---

## 6. 部署配置

### 6.1 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  # 文档解析服务
  doc-parser:
    build: ./services/doc-parser
    ports:
      - "5001:5001"
    environment:
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY=minioadmin
      - S3_SECRET_KEY=minioadmin
    depends_on:
      - redis
      - minio
    volumes:
      - ./services/doc-parser:/app
      - /tmp:/tmp
  
  # RAG 检索服务
  rag-service:
    build: ./services/rag-service
    ports:
      - "5002:5002"
    environment:
      - REDIS_URL=redis://redis:6379
      - VECTOR_DB_URL=http://qdrant:6333
    depends_on:
      - redis
      - qdrant
    volumes:
      - ./services/rag-service:/app
  
  # LLM 生成服务
  llm-generate:
    build: ./services/llm-generate
    ports:
      - "5003:5003"
    environment:
      - REDIS_URL=redis://redis:6379
      - DOUBAO_API_KEY=${DOUBAO_API_KEY}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - KIMI_API_KEY=${KIMI_API_KEY}
    depends_on:
      - redis
    volumes:
      - ./services/llm-generate:/app
  
  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
  
  # Qdrant 向量数据库
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
  
  # MinIO (S3 兼容存储)
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data

volumes:
  redis_data:
  qdrant_data:
  minio_data:
```

---

## 7. 性能优化

### 7.1 模型缓存

```typescript
// 缓存 Embedding 模型
const embeddingCache = new Map<string, number[]>();

async function getEmbeddingWithCache(text: string): Promise<number[]> {
  const hash = createHash('md5').update(text).digest('hex');
  
  if (embeddingCache.has(hash)) {
    return embeddingCache.get(hash)!;
  }
  
  const embedding = await getEmbedding(text);
  embeddingCache.set(hash, embedding);
  
  return embedding;
}
```

### 7.2 批量处理

```python
# 批量向量化
async def batch_embed(texts: List[str], batch_size: int = 32) -> List[np.ndarray]:
    embeddings = []
    
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch_embeddings = await get_embeddings(batch)
        embeddings.extend(batch_embeddings)
    
    return embeddings
```

### 7.3 并行生成

```typescript
// 并行生成多个章节
async function generateSectionsParallel(sectionIds: string[]) {
  const promises = sectionIds.map(id => generateSection(id));
  return Promise.all(promises);
}
```

---

**文档版本**：v1.0  
**最后更新**：2026-03-17  
**负责人**：AI 服务团队
