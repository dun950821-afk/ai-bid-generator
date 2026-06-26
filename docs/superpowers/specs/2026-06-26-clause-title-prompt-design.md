# 条款抽取提示词模板 — 标题规则强化

**日期**：2026-06-26
**主题**：修改 7 个条款抽取提示词模板，要求 LLM 为每条条款生成简短标题（≤10 字），并加固服务层 fallback
**方案**：方案 C（prompt 改动 + schema 加固 + 服务层 fallback 加固）

## 背景与目标

### 当前状态
- 7 个条款抽取模板的 `output_schema` 中 `title` 字段已存在
- 服务层 `requirement_extract_service.py:314` 已读取 `title` 并落库
- 问题：LLM 经常返回空 `title`，触发 `title or content[:100]` fallback，导致标题过长、不体面

### 目标
- 从根源（prompt）解决空 title 问题：明确要求 LLM 必须为每条条款生成 ≤10 字的简短标题
- 优先采用原文小节/段落标题（如「资格要求」「付款方式」），原文无标题时由 LLM 概括
- schema 加固：`title` 加入 required，description 统一
- 服务层 fallback 加固：LLM 仍违反时，用 `content[:10] + "…"` 兜底，避免 100 字长标题

### 非目标
- 不处理旧数据（已有条款的空 title 仍是 `content[:100]`，不批量迁移）
- 不加 few-shot 示例（保持 token 消耗稳定，靠 LLM 自觉发挥）
- 不做端到端 LLM 行为验证（留给手动验证）

## 涉及范围

### 7 个 prompt 模板 key
1. `requirement_extraction.default` — 通用条款抽取（旧版）
2. `requirement_extraction_scoring.default` — 评分项
3. `requirement_extraction_mandatory.default` — 强制条款
4. `requirement_extraction_qualification.default` — 资格要求
5. `requirement_extraction_commercial.default` — 商务条款
6. `requirement_extraction_technical.default` — 技术要求
7. `requirement_extraction_submission.default` — 递交要求

### 代码文件
| 文件 | 改动类型 |
|------|----------|
| `backend/apps/generation/management/commands/seed_prompts.py` | 修改：同步更新 7 个模板内容 |
| `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py` | 新建：迁移命令，参考 `update_outline_prompt.py` 模式 |
| `backend/apps/requirements/services/requirement_extract_service.py` | 修改：fallback 加固（第 314 行附近） |

## 详细设计

### 1. prompt 改动

#### 1.1 统一的「标题规则」段

插入到 7 个模板的 `system_prompt` 末尾（在现有规则之后）：

```
**条款标题规则**：
1. title 必须有值，不得为空字符串
2. 优先使用原文中的小节/段落标题（如「资格要求」「付款方式」「投标截止时间」）
3. 原文无明确标题时，由你基于 content 概括生成不超过 10 个字的简短标题
4. 不得直接复制 content 全文作为 title
5. title 应能让评审人快速识别该条款要点，避免「其他」「相关要求」等模糊表述
```

7 个模板都用同一段文字，保持一致性。

#### 1.2 schema 改动

**`requirement_extraction.default`**（旧版）：
- `required` 从 `["requirement_type", "content", "mandatory_level", "risk_level"]` 改为 `["requirement_type", "title", "content", "mandatory_level", "risk_level"]`
- `title` 字段 description 从 `"条款标题"` 改为 `"条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"`

**V2 6 个模板**：
- `required` 已包含 `title`，不动
- `title` 字段 description 统一改为 `"条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"`
- 当前 6 个 V2 模板的 `title` description 不一致：`requirement_extraction_scoring.default` 写的是 `"条款标题"`，其他 5 个 V2 模板的 `title` 字段没有 description。统一补上。

#### 1.3 user_prompt 不改

不加 few-shot 示例，保持 token 消耗稳定。

### 2. 服务层 fallback 加固

#### 当前代码（`requirement_extract_service.py:314` 附近）

```python
title = item.get("title", "")[:255]
content = item.get("content", "")
if not content:
    return None

requirement_key = generate_requirement_key(
    tender_file.id,
    extraction_type,
    title or content[:100],  # ← 这里 fallback
)
```

问题：LLM 返回空 title 时，用 `content[:100]` 做 requirement_key 和显示标题，100 字太长。

#### 改动方案

```python
title = (item.get("title", "") or "").strip()[:255]
content = item.get("content", "")
if not content:
    return None

# fallback 加固：LLM 未返回 title 时，用 content 前 10 字 + "…" 兜底
if not title:
    title = content[:10].strip()
    if len(content) > 10:
        title = title + "…"
```

#### 注意点
- `[:255]` 保留——title 模型字段 max_length=255
- fallback 后 title 最多 11 字（10 字 + "…"），远低于 255，安全
- `requirement_key` 用加固后的 title 生成，保证唯一键稳定
- 落库的 `requirement_data["title"]` 也是加固后的值，前端展示一致

#### 影响面
- 只影响「LLM 返回空 title」的条款；正常返回 title 的条款不受影响
- 旧数据不动；旧数据的空 title 仍是原来的 `content[:100]`
- `requirement_key` 算法不变，仍是 `generate_requirement_key(tender_file_id, extraction_type, title_or_content)`——只是 title 内容变了
- 对同一份文件重新抽取时，key 会与旧数据不同（旧数据用 content[:100] 算 key，新数据用 content[:10]+… 算 key），可能出现重复条款
- `_create_requirement` 里有 `existing` 检查会跳过重复 key，不会报错，新抽取条款以新 key 入库
- 保持现状，不加额外处理

### 3. update 命令

#### 3.1 文件位置
`backend/apps/generation/management/commands/update_requirement_extraction_prompts.py`

参考 `update_outline_prompt.py` 的模式。

#### 3.2 命令逻辑

```python
class Command(BaseCommand):
    help = "更新条款抽取提示词模板（7 个模板统一加标题规则）"

    @transaction.atomic
    def handle(self, *args, **options):
        templates_data = [...]  # 7 个模板的 (key, system_prompt, user_prompt, output_schema) 元组

        for tmpl_data in templates_data:
            template = PromptTemplate.objects.filter(key=tmpl_data["key"]).first()
            if not template:
                self.stdout.write(self.style.WARNING(f"未找到模板 {tmpl_data['key']}，跳过"))
                continue

            # 创建或更新版本 2.0
            existing_v2 = PromptVersion.objects.filter(template=template, version='2.0').first()
            if existing_v2:
                existing_v2.system_prompt = tmpl_data["system_prompt"]
                existing_v2.user_prompt = tmpl_data["user_prompt"]
                existing_v2.output_schema = tmpl_data["output_schema"]
                existing_v2.changelog = '增加条款标题规则，title 加入 required，title description 统一'
                existing_v2.save()
                version = existing_v2
            else:
                version = PromptVersion.objects.create(
                    template=template,
                    version='2.0',
                    system_prompt=tmpl_data["system_prompt"],
                    user_prompt=tmpl_data["user_prompt"],
                    output_schema=tmpl_data["output_schema"],
                    changelog='增加条款标题规则，title 加入 required，title description 统一',
                    status=PromptVersionStatus.DRAFT,
                )

            # 发布新版本
            version.publish()
            self.stdout.write(self.style.SUCCESS(f"已发布 {tmpl_data['key']} v2.0"))
```

#### 3.3 关键决策
- **版本号**：固定 `2.0`，幂等。已存在则更新内容，不存在则创建。由 `PromptVersion` 的 `uniq_prompt_version` (template, version) 唯一约束保证
- **同时更新 output_schema**：因为改了 schema（title required + description），命令需要同步更新 `output_schema` 字段
- **publish 行为**：`version.publish()` 自动把旧 published 版本改为 archived，保证一个模板同时只有一个 published

#### 3.4 部署流程（按 CLAUDE.md 标准流程）
1. 代码合并到 master
2. `docker compose build web worker beat`
3. `docker compose up -d web worker beat`
4. **关键步骤**：`docker exec ai-bid-generator-web-1 python manage.py update_requirement_extraction_prompts` — 运行迁移命令，把现有部署的 7 个模板升到 v2.0 并 publish
5. `docker compose restart nginx`
6. 验证：admin 页面查看 7 个模板的 v2.0 已发布，重新抽取一份招标文件验证 title 不为空

### 4. 测试

#### 4.1 seed_prompts 单元测试（扩展已有）
`backend/apps/generation/tests/test_seed_prompts.py`：
- 7 个条款抽取模板的 system_prompt 都包含 `**条款标题规则**` 段
- `requirement_extraction.default` 的 `output_schema.required` 包含 `title`
- 7 个模板的 `title` 字段都有 description

#### 4.2 update 命令测试（新增）
`backend/apps/generation/tests/test_update_requirement_extraction_prompts.py`：
- 命令执行后，7 个模板都有 v2.0 published 版本
- 重复执行幂等（第二次执行不报错，v2.0 内容正确）
- v2.0 的 system_prompt 包含标题规则段
- v2.0 的 output_schema 中 title 在 required 列表
- 原 v1.x 版本被改为 archived

#### 4.3 服务层 fallback 测试
`backend/apps/requirements/tests/`（找现有测试文件扩展）：
- LLM 返回空 title 时，落库的 title 为 `content[:10] + "…"`（当 content > 10 字）
- LLM 返回空 title 且 content ≤ 10 字时，落库的 title 为 content 本身
- LLM 返回非空 title 时，落库的 title 为 LLM 返回值（不加工）

#### 4.4 开发完成后的验证
开发完成后实际运行测试套件：
```bash
cd backend
source .venv/bin/activate
python -m pytest apps/generation/tests/test_seed_prompts.py \
  apps/generation/tests/test_update_requirement_extraction_prompts.py \
  apps/requirements/tests/ \
  --tb=short -q
```
所有测试必须通过才算完成。

#### 4.5 不做的测试
- 不测 LLM 是否遵守 prompt（LLM 行为，不是代码契约）
- 不做端到端抽取测试（旧数据不退田，留给手动验证）

## 风险与权衡

| 风险 | 缓解措施 |
|------|----------|
| LLM 仍可能返回空 title | 服务层 fallback 加固为 `content[:10] + "…"`，体面兜底 |
| 重新抽取同一份文件产生重复条款 | `_create_requirement` 的 existing check 会跳过同 key 条款；新 key 入库是预期行为，不报错 |
| prompt token 消耗略增 | 仅加约 80 字规则段，影响可忽略 |
| 7 个模板规则措辞需保持一致 | 集中在 update 命令的常量定义中，避免散落 |

## 实施顺序

1. 修改 `seed_prompts.py`：7 个模板加规则段 + schema 加固
2. 修改 `requirement_extract_service.py`：fallback 加固
3. 新建 `update_requirement_extraction_prompts.py` 命令
4. 扩展 `test_seed_prompts.py` 测试
5. 新建 `test_update_requirement_extraction_prompts.py` 测试
6. 扩展 `requirements` 服务层测试
7. 运行全部测试套件验证通过
