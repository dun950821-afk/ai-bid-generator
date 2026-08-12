# 响应模板(Response Template)功能实施计划 — Phase 1

> 状态: 已通过 Phase 0 验证(常熟农商银行文件 8/8 附件识别成功, 核心类型 100% 命中)
> 原则: 复用优先 — 不维护两套解析/生成/提示词体系

## Goal

在现有"文件解析 → 大纲生成 → 内容编写"流程中,从**文件解析后**增加一个分支:
**招标响应模板识别与生成** — 上传招标文件 → 自动定位"响应文件格式"章节 → AI 识别附件
与填充位置 → 用户确认 → 在原模板上原位填充 → 生成响应文件 docx。

## 架构(3 句话)

新增 `apps/response_template` 领域,输入是现有 tender 解析产物(TenderFile/ParsedDocument),
识别用现有 LLMService(DeepSeek),生成用新写的 OoxmlFiller(python-docx + lxml, 原位填充,
不重建 Word),产物存 MinIO 并复用 ONLYOFFICE 预览链路。AI 生成内容复用现有
generation 的 prompt 执行体系,不另起炉灶。

## 复用清单(已有,不改)

| 模块 | 复用点 |
|------|--------|
| apps/tender | TenderFile/ParsedDocument/TenderChunk、DocxParser、PipelineJob 状态模式、celery task 注册方式 |
| apps/generation | LLMService + ModelConfig(DeepSeek)、prompt_execution_service |
| apps/enterprise | CompanyProfile(企业数据)、BidMaterialPackage(材料包) |
| apps/outline | template_variable_registry(控件协议)、BidDocument/MinIO/ONLYOFFICE 产物链路 |
| apps/common | StorageService、AsyncTask |
| apps/accounts | menu_service、permissions_registry |

## 新增文件

后端:
- apps/response_template/__init__.py, apps.py, admin.py
- apps/response_template/models.py — TenderResponseTemplate / TenderTemplateBlock / TenderResponseDocument
- apps/response_template/constants.py — 块类型/状态枚举(与 Phase 0 验证的 10 种类型对齐)
- apps/response_template/services/analyzer.py — 附件定位(正则)+ AI 识别 + 落款规则 + attachment_no 规范化
- apps/response_template/services/filler.py — OoxmlFiller v1(文本替换/表格行复制/图片插入)
- apps/response_template/tasks.py — analyze_response_template / fill_response_template
- apps/response_template/serializers.py, views.py, urls.py
- apps/response_template/migrations/0001_initial.py
- apps/response_template/tests/test_analyzer.py, test_filler.py

前端:
- src/api/responseTemplate.ts
- src/views/response-template/ResponseTemplateView.vue(识别+块确认)
- src/views/response-template/ResponseGenerateView.vue(生成+产物) — 可与上合并为一个页面
- src/router/index.ts 增加路由
- TenderFileDetailView.vue 增加"识别响应模板"入口按钮

配置:
- config/settings.py INSTALLED_APPS 注册
- config/urls.py 挂载路由
- apps/accounts/services/menu_service.py 菜单项(response_template.manage)
- apps/accounts/services/permissions_registry.py 权限码

## 块类型 v1(与 Phase 0 验证对齐,REPEAT_BLOCK 二期)

FIXED / AUTO_FIELD / AI_GENERATE / AI_RESPONSE / DATA_TABLE / REPEAT_TABLE /
MATERIAL_SLOT / MANUAL / PRICE — 识别全部支持;填充 v1 支持除 REPEAT_BLOCK 外全部。

## 关键设计决策

1. **附件定位**: 正则 `^#{1,4}\s*附件\d+` 命中解析后 markdown(Phase 0 验证 100% 可靠),
   不依赖 LLM。
2. **填充定位 v1(妥协,记录已知限制)**: 用"文本锚点"在 docx 中定位(段落文本 / 表格 cell),
   因为 markdown offset 无法映射回 XML。锚点唯一性校验: 定位到多个位置时报 warning。
   v2 升级为 Content Control 编译(复用 template_compiler 协议 bid.<type>:<key>)。
3. **AUTO_FIELD 数据源**: CompanyProfile + Project + 招标文件条款(TenderChunk,
   Phase 0 意外收获: 投标保证金金额从条款抽取)。
4. **AI_RESPONSE 风险闸门**: 响应值枚举 [完全响应/部分响应/偏离/待确认],
   "待确认"条目生成后必须人工过目,不允许默认出文件。
5. **REPEAT_TABLE 数据源**: 企业案例库(CompanyCase)不存在 → Phase 1 行复制框架 +
   每行留空/人工确认,Phase 2 建案例库后自动匹配。
6. **AI 内容生成**: 复用 LLMService + 项目上下文(项目需求/条款),不走独立提示词体系;
   生成的 prompt 模板后续可迁入 PromptTemplate 管理。

## 实施步骤(每步可验证)

1. 计划与罗盘(本文档 + todo)
2. 后端 app 骨架 + 模型 + 迁移 + settings 注册
3. analyzer(从 Phase 0 脚本迁移: 附件切分 → AI 识别 → 规范化 → 落款规则 → 置信度降级)
4. filler v1(文本替换 → 表格行复制 → 图片插入)
5. celery tasks + PipelineJob 状态
6. serializers/views/urls + 权限码 + 菜单
7. 前端: api → 页面(识别进度/块确认/生成产物)→ 路由 → tender 入口按钮
8. 后端单测(analyzer/filler)
9. 常熟文件端到端验证(容器内脚本)
10. 前端构建 + docker compose build/up + 迁移 + 部署验证
11. 提交 git

## 验证方式

- 单测: pytest apps/response_template
- 端到端: scripts/phase1_e2e_response_template.py(容器内跑, 常熟文件 → 识别 → 确认 → 生成 → 产物下载检查)
- 部署: docker compose build web worker beat && up -d && migrate && nginx restart
