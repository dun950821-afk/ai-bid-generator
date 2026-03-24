# AI Bid Generator 代码审查报告

**审查日期**: 2026-03-24
**审查范围**: API路由、服务层、数据库配置、前端组件
**审查重点**: 安全漏洞、Bug、代码质量、架构问题

---

## 1. 安全问题

### 1.1 [高危] 项目列表搜索存在 Supabase Filter Injection

**文件**: `src/app/api/projects/route.ts:52`

```typescript
query = query.or(`name.ilike.%${searchTerm}%,project_number.ilike.%${searchTerm}%`);
```

用户输入的 `searchTerm` 被直接拼接到 Supabase PostgREST 过滤器中，未经转义。攻击者可构造特殊的搜索词（如包含 `,`、`.`、`(`）来注入额外的过滤条件，绕过预期查询逻辑。

**建议**: 对 `searchTerm` 进行特殊字符转义（逗号、句号、括号等 PostgREST 元字符），或改用 Supabase 的 `.ilike()` 方法分别构建过滤条件。

### 1.2 [高危] HTML 导出存在 XSS 风险

**文件**: `src/app/api/projects/[id]/export/route.ts:280-313`

```typescript
html += `<title>${project.name} - 投标文件</title>`;
html += `<h1>${project.name}</h1>`;
html += `<p>项目编号: ${project.project_number || '无'}</p>`;
```

`generateHtml` 函数将项目名称、编号等用户输入直接插入 HTML，未进行 HTML 实体转义。如果项目名称包含 `<script>` 标签，导出的 HTML 文件会执行恶意脚本。

**建议**: 在插入 HTML 前对所有用户输入进行 HTML 实体转义（`<` → `&lt;`，`>` → `&gt;` 等）。

### 1.3 [中危] 图片代理 SSRF 域名白名单过于宽松

**文件**: `src/app/api/image-proxy/route.ts:26`

```typescript
const isAllowed = urlObj.hostname.includes('aliyuncs.com');
```

使用 `includes` 检查域名意味着 `evil-aliyuncs.com` 或 `aliyuncs.com.evil.com` 也能通过校验。攻击者可注册包含 `aliyuncs.com` 子串的域名来滥用此代理。

**建议**: 使用 `endsWith('.aliyuncs.com') || hostname === 'aliyuncs.com'` 做更严格的域名后缀匹配。

### 1.4 [中危] 系统设置 API 无认证保护

**文件**: `src/app/api/settings/route.ts`

设置 API（GET/PUT）没有任何认证机制，任何人可以读取和修改系统配置（包括 LLM API Key、数据库凭据等）。虽然 GET 会对敏感字段显示 `******`，但 PUT 接口可直接覆盖配置。

**建议**: 添加管理员认证中间件，至少应验证请求来源或添加 Bearer Token 认证。

### 1.5 [中危] 数据库切换 API 无认证保护

**文件**: `src/app/api/settings/switch-database/route.ts`

任何人可以通过 POST 请求切换应用连接的数据库。攻击者可将应用指向恶意数据库服务器，窃取后续写入的数据。

**建议**: 同 1.4，需要添加认证保护。

### 1.6 [低危] `orderBy` 参数未验证

**文件**: `src/app/api/projects/route.ts:24,32`

```typescript
const orderBy = searchParams.get('orderBy') || 'created_at';
query = query.order(orderBy, { ascending: order === 'asc' });
```

`orderBy` 直接传入 Supabase `.order()`，虽然 Supabase 会校验列名，但不合法的值会导致 500 错误。应添加白名单验证。

---

## 2. Bug 与逻辑错误

### 2.1 [高] 项目删除存在两处入口，逻辑不一致

**文件**:
- `src/app/api/projects/route.ts:155-230` — DELETE 通过 query param `?id=xxx`，**先删除关联数据**再删项目
- `src/app/api/projects/[id]/route.ts:86-117` — DELETE 通过路由 param，**直接删除项目**不清理关联数据

后者会因外键约束而失败（`scoring_items` 等表有 `onDelete: 'cascade'` 设置，但只在 Drizzle schema 定义中，Supabase 直接 REST 操作是否生效取决于数据库层面是否配置了 CASCADE）。如果数据库没有 CASCADE，则会产生孤立的关联记录。

**建议**: 统一为一个删除入口，确保关联数据清理逻辑一致。

### 2.2 [高] `loadModel` 单例缓存导致首次配置固化

**文件**: `src/lib/llm.ts:509-514`

```typescript
export function loadModel(config?: LLMConfig): LLMService {
  if (!defaultModel) {
    defaultModel = new LLMService(config);
  }
  return defaultModel;
}
```

`loadModel` 创建的单例永远使用首次调用时的 `config`。后续调用传入不同 `config` 会被忽略。这意味着如果首次调用未传 config 或传了错误的 config，后续所有使用 `loadModel` 的地方都会共享错误的配置。

**建议**: 如果需要不同配置，应使用 `createModel`；或修改 `loadModel` 使其能在 config 变化时更新实例。

### 2.3 [中] 流式生成 SSE 解析未处理跨 chunk 的 `data:` 行

**文件**: `src/app/api/projects/[id]/sections/[sectionId]/generate/stream/route.ts:260-261`

```typescript
const chunk = decoder.decode(value, { stream: true });
const lines = chunk.split('\n').filter((line) => line.trim() !== '');
```

SSE 数据可能跨越多个 TCP chunk，一个 `data: {...}` 行可能被拆分到两个 chunk 中。`llm.ts:295-296` 中的 `stream` 方法正确处理了 buffer 拼接，但此处的 `streamGenerateWithLLM` 没有做 buffer 处理，可能丢失部分内容。

**建议**: 添加行缓冲区逻辑，确保不完整的行在下一个 chunk 到来时完整拼接。

### 2.4 [中] `repairIncompleteJSON` 不处理字符串内的括号

**文件**: `src/app/api/projects/[id]/extract-tender/route.ts:120-128`

在正则提取字段值时的嵌套解析器（第二个 try-catch 块 line 131-163）没有处理字符串内部的 `"`（escape 检测不足），遇到包含转义引号的 JSON 字符串值可能错误判断字符串边界。

### 2.5 [低] 分片上传 `uploadedBytes` 计算不精确

**文件**: `src/app/api/upload/chunk/route.ts:534`

```typescript
uploadedBytes: uploadedPartNumbers.size * session.chunkSize,
```

最后一个分片通常小于 `CHUNK_SIZE`，这会导致 `uploadedBytes` 在上传最后一个分片后超过实际文件大小。

---

## 3. 架构与代码质量问题

### 3.1 大量重复代码

以下函数在两个文件中完全复制：
- `findSection` — 在 `generate/route.ts` 和 `generate/stream/route.ts` 中各有一份完全相同的实现（包括 `chineseNumbers` 常量、`findWithNumber` 递归逻辑等）
- `prepareSectionData` — 非流式版本多了锁检查，但核心逻辑一样

**建议**: 提取到共享模块（如 `lib/services/section-utils.ts`）。

### 3.2 Supabase 客户端未复用

每次 API 请求调用 `getSupabaseClient()` 都会调用 `createClient()` 创建新的 Supabase 客户端实例。对于频繁的 API 调用，这会产生大量不必要的对象创建。

**建议**: 使用模块级单例或连接池模式缓存客户端实例。

### 3.3 评分项循环插入效率低

**文件**: `src/app/api/projects/[id]/extract-tender/route.ts:463-474`

```typescript
for (let i = 0; i < scoringItems.length; i++) {
  await client.from('scoring_items').insert({...});
}
```

逐条 INSERT 评分项和风险项，当数量较多时会发送大量请求。Supabase 支持批量插入。

**建议**: 使用 `client.from('scoring_items').insert(items)` 批量插入。

### 3.4 `supabase-client.ts` 中使用 `execSync` 调用 Python

**文件**: `src/storage/database/supabase-client.ts:44`

`loadEnv()` 使用 `execSync` 同步执行 Python 脚本获取环境变量。这会阻塞 Node.js 事件循环，且有 10 秒超时。如果 Python 环境异常或网络慢，会严重影响启动时间。

**建议**: 改为异步执行或在构建阶段完成环境变量注入。

---

## 4. 总结

| 类别 | 高危 | 中危 | 低危 |
|------|------|------|------|
| 安全问题 | 2 | 3 | 1 |
| Bug | 2 | 2 | 1 |
| 架构问题 | - | - | 4 |

**优先修复建议**:
1. HTML 导出 XSS（1.2）— 影响下载的文档安全
2. 搜索注入（1.1）— 影响数据查询安全
3. 图片代理 SSRF（1.3）— 可被滥用
4. 删除逻辑不一致（2.1）— 可能导致数据残留
5. 设置 API 添加认证（1.4, 1.5）— 防止未授权修改
