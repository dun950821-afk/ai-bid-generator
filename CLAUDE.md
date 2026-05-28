# AI Bid Generator - 项目记忆文件

## 项目概述

这是一个投标文件生成系统，包含：
- **Backend**: Django + DRF + Celery + PostgreSQL + MinIO
- **Frontend**: Vue 3 + TypeScript + Element Plus
- **部署方式**: Docker Compose

## 部署注意事项

### 代码更新后部署流程

1. **修改代码后必须检查依赖变化**
   - 如果添加了新的 Python 包导入，必须更新 `backend/requirements.txt`
   - 如果添加了新的前端依赖，必须更新 `frontend/package.json`

2. **重建 Docker 镜像**
   ```bash
   docker compose build web worker beat
   ```

3. **重启服务**
   ```bash
   docker compose up -d web worker beat
   ```

4. **验证服务状态**
   ```bash
   docker logs --tail 20 ai-bid-generator-web-1
   curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
   ```

### 常见问题

#### 502 Bad Gateway
- **原因**: 后端容器启动失败，通常是依赖缺失
- **检查**: `docker logs ai-bid-generator-web-1` 查看错误日志
- **解决**: 添加缺失依赖到 requirements.txt，重建镜像

#### 容器网络问题
- **现象**: 容器内无法解析其他服务名（如 `minio`, `postgres`）
- **检查**: `docker exec ai-bid-generator-web-1 python -c "import socket; print(socket.gethostbyname('minio'))"`
- **解决**: 重启容器 `docker restart ai-bid-generator-web-1`

#### 测试失败
- **ProjectMember.project_role**: 必须使用 ProjectRole 实例，不能使用字符串
  ```python
  # 正确方式
  roles = RoleService.initialize_builtin_roles(project)
  role = next(r for r in roles if r.code == "editor")
  ProjectMember.objects.create(project=project, user=user, project_role=role)
  ```
- **菜单测试**: 公开菜单项包括 `dashboard`, `projects`, `templates`

### Docker 服务清单

| 服务 | 容器名 | 端口 |
|------|--------|------|
| postgres | ai-bid-generator-postgres-1 | 5432 |
| redis | ai-bid-generator-redis-1 | 6379 |
| minio | ai-bid-generator-minio-1 | 9000, 9001 |
| web | ai-bid-generator-web-1 | 8000 |
| nginx | ai-bid-generator-nginx-1 | 80 |
| beat | ai-bid-generator-beat-1 | - |
| worker | ai-bid-generator-worker-1 | - |

### 环境变量锚点

`docker-compose.yml` 使用锚点 `x-backend-env` 统一后端服务环境：
- `DATABASE_URL`: postgres://bid:bid@postgres:5432/bid
- `REDIS_URL`: redis://redis:6379/1
- `MINIO_ENDPOINT`: minio:9000

## 新增功能 Checklist

添加新功能时检查以下事项：

1. [ ] 后端模型/序列化器/视图/URL 是否完整
2. [ ] 是否需要新的 Python 依赖？→ 更新 `requirements.txt`
3. [ ] 是否需要数据库迁移？→ `python manage.py makemigrations && migrate`
4. [ ] 前端 API/路由/组件是否完整
5. [ ] 测试是否使用正确的 fixture（ProjectRole 等）
6. [ ] 菜单项是否需要更新？→ `menu_service.py` 的 `MENU_DEFINITION`
7. [ ] 权限码是否已注册？→ `permissions_registry.py`
8. [ ] 重建 Docker 镜像后验证登录正常

## 测试运行

```bash
cd backend
source .venv/bin/activate
python -m pytest --tb=short -q
```

## 当前菜单项

| key | title | permission |
|-----|-------|------------|
| dashboard | 工作台 | None (公开) |
| projects | 项目管理 | None (公开) |
| templates | 流程模板 | None (公开) |
| users | 用户管理 | user.manage |
| roles | 角色权限 | role.manage |
| prompts | 提示词管理 | prompt_template.manage |
| audit | 操作审计 | audit.view |