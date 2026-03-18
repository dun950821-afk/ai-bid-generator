# 基于文件ID的智能标书生成优化方案

## 一、当前系统架构分析

### 1.1 现有流程（问题）
```
用户上传招标文件
    ↓
解析文档提取文本内容
    ↓
每次操作都传递完整文本给LLM：
  - 提取评分项 → 传递完整文档
  - 提取废标风险 → 传递完整文档
  - 生成大纲 → 传递评分项文本
  - 生成章节 → 传递评分项+知识库内容
  - 内容校验 → 再次传递内容
```

**问题**：
- Token消耗巨大：一个10万字的文档，提取9次就要传递90万字
- 响应速度慢：大量数据传输增加延迟
- 成本高昂：重复传递相同内容

### 1.2 优化后流程（目标）
```
用户上传招标文件 → 上传到阿里云百炼 → 获取 file_id
    ↓
所有后续操作使用 file_id：
  - 提取评分项 → file_id + 提取指令
  - 提取废标风险 → file_id + 提取指令
  - 生成大纲 → file_id + 评分项ID列表
  - 生成章节 → file_id + 知识库file_id + 生成指令
  - 内容校验 → file_id + 生成的章节内容
```

**优势**：
- Token节省80-90%
- 响应速度提升50%以上
- 成本大幅降低

---

## 二、技术架构设计

### 2.1 数据库设计

#### projects 表 - metadata 字段扩展
```json
{
  "uploadedDocument": {
    "name": "招标文件.pdf",
    "url": "https://storage.xxx/xxx.pdf",
    "llmFileId": "file-abc123",           // 百炼文件ID
    "llmFileUploadedAt": "2024-03-18T...", // 上传时间
    "extracted": true
  },
  "outline": { ... },
  "knowledgeBaseFileIds": [               // 知识库文件ID列表
    {
      "knowledgeBaseId": "kb-001",
      "fileId": "file-kb-001",
      "uploadedAt": "2024-03-18T..."
    }
  ]
}
```

#### knowledge_bases 表扩展
```sql
ALTER TABLE knowledge_bases ADD COLUMN llm_file_ids JSONB;
-- 存储该知识库下所有文档的百炼file_id
```

### 2.2 服务层架构

```
┌─────────────────────────────────────────────────────────┐
│                    LLMFileService                        │
│  - uploadFile(fileUrl, filename) → fileId               │
│  - checkFileAvailable(fileId) → boolean                 │
│  - analyzeWithFileId(fileId, task) → result             │
│  - multiFileAnalyze(fileIds[], task) → result           │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Extraction   │ │ Outline      │ │ Content      │
│ Service      │ │ Service      │ │ Generation   │
│ (file_id)    │ │ (file_id)    │ │ Service      │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 三、核心功能优化

### 3.1 文档解析与信息提取（已完成）

```typescript
// 使用 file_id 进行提取
const result = await llmFileService.analyzeWithFileId(
  fileId, 
  "提取项目基本信息..."
);
```

### 3.2 大纲生成优化

```typescript
// 原方案：传递评分项文本
const prompt = `根据以下评分项生成大纲：
${JSON.stringify(scoringItems)}`;  // 可能几万字

// 优化后：使用 file_id
const prompt = `根据招标文档(file_id: ${fileId})中的评分标准，生成投标文件大纲。
重点关注以下评分项：
${scoringItems.map(item => `- ${item.item_name} (${item.max_score}分)`).join('\n')}
`;
// 只传递评分项名称，不传递完整细则
```

### 3.3 章节生成优化（核心）

#### 原方案：
```typescript
// 1. 检索知识库
const context = await ragService.getRelevantContext(query, kbId, 2000);

// 2. 构建提示
const prompt = `
## 评分项详情
${JSON.stringify(scoringItems)}  // 可能耗费大量token

## 知识库内容
${context}  // 可能耗费大量token

## 风险提示
${risks}

请生成章节内容...
`;
```

#### 优化方案：
```typescript
// 1. 准备文件ID列表
const fileIds = [
  { id: tenderFileId, name: '招标文件', type: 'tender' },
  { id: kbFileId1, name: '公司资质', type: 'knowledge' },
  { id: kbFileId2, name: '案例库', type: 'knowledge' },
];

// 2. 精简提示
const prompt = `
请基于以下文档生成"${sectionTitle}"章节：

## 相关文档
- 招标文件 (file_id: ${tenderFileId})
- 公司资质库 (file_id: ${kbFileId1})
- 案例库 (file_id: ${kbFileId2})

## 章节要求
- 类型: ${sectionType}
- 评分项: ${scoringItems.map(i => i.item_name).join(', ')}
- 预计字数: ${estimatedWords}字

## 生成要求
1. 严格按照招标文件的评分细则响应
2. 从知识库中引用相关的资质证书、案例等
3. 确保响应所有评分项
4. 使用Markdown格式输出
`;
```

### 3.4 多文件联合分析

```typescript
/**
 * 多文件联合分析
 * 适用于章节生成场景：同时引用招标文件和知识库
 */
async analyzeWithMultipleFiles(
  fileIds: Array<{ id: string; name: string; type: string }>,
  task: string
): Promise<any> {
  const messages = [
    {
      role: 'system',
      content: '你是专业的标书编写专家，请根据提供的多份文档生成章节内容。'
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: task },
        // 支持多个文件引用
        ...fileIds.map(f => ({
          type: 'file',
          file_id: f.id,
          file_name: f.name
        }))
      ]
    }
  ];
  
  // 调用LLM
  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 8192,
      stream: true
    })
  });
  
  // 流式返回
  return response;
}
```

---

## 四、完整实现流程

### 4.1 文件上传阶段

```typescript
// 1. 用户上传招标文件
async function handleTenderUpload(file: File, projectId: string) {
  // 上传到对象存储
  const storageUrl = await storageService.upload(file);
  
  // 同时上传到百炼
  const llmFileService = getLLMFileService();
  const { id: fileId } = await llmFileService.uploadFile(storageUrl, file.name);
  
  // 保存到项目元数据
  await updateProject(projectId, {
    metadata: {
      uploadedDocument: {
        url: storageUrl,
        llmFileId: fileId,
        name: file.name,
        uploadedAt: new Date()
      }
    }
  });
  
  return { storageUrl, fileId };
}

// 2. 上传知识库文档
async function handleKnowledgeUpload(file: File, knowledgeBaseId: string) {
  // 上传到对象存储
  const storageUrl = await storageService.upload(file);
  
  // 上传到百炼
  const { id: fileId } = await llmFileService.uploadFile(storageUrl, file.name);
  
  // 保存到知识库
  await updateKnowledgeBase(knowledgeBaseId, {
    llm_file_ids: [...existingIds, { documentId: docId, fileId }]
  });
  
  return { storageUrl, fileId };
}
```

### 4.2 信息提取阶段

```typescript
async function extractTenderInfo(projectId: string) {
  const project = await getProject(projectId);
  const fileId = project.metadata.uploadedDocument.llmFileId;
  
  // 检查文件是否可用
  const available = await llmFileService.checkFileAvailable(fileId);
  if (!available) {
    // 重新上传
    const newFileId = await llmFileService.uploadFile(
      project.metadata.uploadedDocument.url,
      project.metadata.uploadedDocument.name
    );
    await updateProjectFileId(projectId, newFileId);
  }
  
  // 分段提取（使用file_id）
  const extractionService = createFileIdExtractionService();
  const result = await extractionService.extract(
    projectId,
    fileId,
    project.metadata.uploadedDocument.url,
    project.metadata.uploadedDocument.name
  );
  
  return result;
}
```

### 4.3 章节生成阶段

```typescript
async function generateSection(
  projectId: string,
  sectionId: string,
  options: { knowledgeBaseIds?: string[] }
) {
  const project = await getProject(projectId);
  const section = findSection(project.metadata.outline, sectionId);
  
  // 准备文件ID列表
  const fileIds = [];
  
  // 1. 招标文件
  fileIds.push({
    id: project.metadata.uploadedDocument.llmFileId,
    name: '招标文件',
    type: 'tender'
  });
  
  // 2. 知识库文件（如果指定）
  if (options.knowledgeBaseIds?.length) {
    const kbFiles = await getKnowledgeBaseFileIds(options.knowledgeBaseIds);
    fileIds.push(...kbFiles);
  }
  
  // 3. 构建精简提示
  const prompt = buildSectionPrompt(section, project);
  
  // 4. 多文件联合生成
  const llmFileService = getLLMFileService();
  const result = await llmFileService.analyzeWithMultipleFiles(fileIds, prompt);
  
  // 5. 流式返回
  return result;
}
```

---

## 五、关键技术点

### 5.1 文件状态管理

```typescript
// 检查并恢复文件
async function ensureFileAvailable(fileId: string, fallbackUrl: string, filename: string) {
  const available = await llmFileService.checkFileAvailable(fileId);
  
  if (!available) {
    console.log(`文件 ${fileId} 不可用，重新上传...`);
    const newFileInfo = await llmFileService.uploadFile(fallbackUrl, filename);
    return newFileInfo.id;
  }
  
  return fileId;
}
```

### 5.2 错误处理与降级

```typescript
async function analyzeWithFallback(fileId: string, textContent: string, task: string) {
  try {
    // 优先使用file_id模式
    return await llmFileService.analyzeWithFileId(fileId, task);
  } catch (error) {
    if (error.message === 'FILE_NOT_FOUND') {
      // 文件不存在，尝试重新上传
      // ...
    }
    
    // 降级到文本模式
    console.log('降级到文本模式');
    return await llmService.invoke(task + '\n\n' + textContent);
  }
}
```

### 5.3 成本监控

```typescript
// 记录token消耗
interface TokenUsage {
  mode: 'file_id' | 'text';
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;  // 相比文本模式节省的token
}

// 对比分析
const fileIdMode = {
  inputTokens: 500,   // 只传递提示词
  outputTokens: 2000,
  total: 2500
};

const textMode = {
  inputTokens: 50000,  // 传递完整文档
  outputTokens: 2000,
  total: 52000
};

// 节省约 95% 的token
```

---

## 六、实施计划

### Phase 1: 基础设施（已完成）
- [x] LLMFileService - 文件上传与管理
- [x] FileIdExtractionService - 基于file_id的提取
- [x] 后台任务服务升级

### Phase 2: 章节生成优化
- [ ] 扩展LLMFileService支持多文件
- [ ] 创建FileIdContentGenerationService
- [ ] 修改章节生成API

### Phase 3: 知识库集成
- [ ] 知识库文档上传时同步到百炼
- [ ] 存储知识库file_id
- [ ] 章节生成时引用知识库file_id

### Phase 4: 监控与优化
- [ ] Token消耗统计
- [ ] 成本对比分析
- [ ] 性能监控仪表盘

---

## 七、预期效果

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 提取阶段Token | ~500K | ~50K | 90% |
| 章节生成Token | ~30K/章节 | ~3K/章节 | 90% |
| 提取响应时间 | ~3分钟 | ~1分钟 | 67% |
| 月度成本估算 | ¥5000+ | ¥500+ | 90% |
