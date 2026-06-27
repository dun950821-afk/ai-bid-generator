# 项目长期上下文

## 项目信息

- **项目名称**：AI 投标文件生成系统
- **项目路径**：/home/newaibook/ai-bid-generator
- **技术栈**：
  - 后端：Django + DRF + Celery + PostgreSQL + MinIO
  - 前端：Vue 3 + TypeScript + Element Plus + Vite
  - 部署：Docker Compose (nginx 反向代理, 前端 :80, 后端 :8000)
- **认证方式**：JWT (SimpleJWT)
- **当前阶段**：功能开发中

## 架构概览

```
前端 (Vue3, :80) → nginx → 后端 (Django, :8000)
                              ├── accounts (用户/权限/认证)
                              ├── projects (项目管理)
                              ├── enterprise (企业资料中心) ← 新模块
                              ├── generation (AI生成/Token统计)
                              ├── outline (大纲/章节生成)
                              ├── knowledge (知识库/RAG)
                              ├── workflows (工作流)
                              ├── tender (招标文件解析)
                              ├── audit (审计日志)
                              └── system_config (系统配置)
```

## 关键路径

- 后端代码：`backend/apps/`
- 前端代码：`frontend/src/`
- Django 设置：`backend/config/settings.py`
- URL 路由：`backend/config/urls.py`
- Docker 配置：`docker-compose.yml`
- 登录视图：`backend/apps/accounts/views/` (LoginView)
- JWT 配置：`backend/config/settings.py` 中的 SIMPLE_JWT

## 已知问题（2026-06-27 测试发现）

1. 登录响应缺少 refresh_token
2. 登录失败返回通用"未认证"而非具体错误
3. /api/enterprise/material-packages/ 返回 404
4. 企业材料创建时 material_type="qualification" 不是合法选项

## 开发规范

- 提交格式：Conventional Commits (中文)
- 后端代码在 `backend/apps/<模块>/` 下
- 前端 API 调用在 `frontend/src/api/` 下
