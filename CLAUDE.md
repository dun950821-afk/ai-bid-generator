# AI Bid Generator - 项目记忆文件

## 项目概述

这是一个投标文件生成系统，包含：
- **Backend**: Django + DRF + Celery + PostgreSQL + MinIO
- **Frontend**: Vue 3 + TypeScript + Element Plus
- **部署方式**: Docker Compose

## 部署注意事项

### 代码更新后部署流程（完整版）

1. **构建前端**
   ```bash
   cd frontend && npm run build
   ```

2. **重建 Docker 镜像**
   ```bash
   docker compose build web worker beat
   ```

3. **重启服务**
   ```bash
   docker compose up -d web worker beat
   ```

4. **运行数据库迁移**（如果有新模型/字段）
   ```bash
   docker exec ai-bid-generator-web-1 python manage.py migrate
   ```

5. **重启 nginx**（避免缓存导致 502）
   ```bash
   docker compose restart nginx
   ```

6. **验证服务状态**
   ```bash
   docker logs --tail 20 ai-bid-generator-web-1
   # admin 初始密码由安装脚本随机生成（见 scripts/setup.sh 输出），不要用默认口令
   curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"<初始密码>"}'
   ```

### 常见问题

#### 502 Bad Gateway
- **原因**: 后端容器启动失败，或 nginx 缓存了旧的 upstream
- **检查**: `docker logs ai-bid-generator-web-1` 查看错误日志
- **解决**: 
  1. 重建镜像：`docker compose build web worker beat`
  2. 运行迁移：`docker exec ai-bid-generator-web-1 python manage.py migrate`
  3. 重启 nginx：`docker compose restart nginx`

#### 数据库字段不存在 (ProgrammingError: column does not exist)
- **原因**: 新增了模型字段但没有运行迁移
- **解决**: 
  ```bash
  docker exec ai-bid-generator-web-1 python manage.py migrate
  docker compose restart web worker beat
  ```

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
| onlyoffice | onlyoffice-document-server | 8082 |

### 环境变量锚点

`docker-compose.yml` 使用锚点 `x-backend-env` 统一后端服务环境：
- `DATABASE_URL`: postgres://bid:bid@postgres:5432/bid
- `REDIS_URL`: redis://redis:6379/1
- `MINIO_ENDPOINT`: minio:9000
- `MINIO_PUBLIC_ENDPOINT`: 163.7.6.60:9000（浏览器/外部访问地址）
- `MINIO_PROXY_ENABLED`: true（使用 /minio/ nginx 代理）

## MinIO 文件存储

### Bucket 访问权限
MinIO bucket `bid-files` 已设置为公开下载模式：
```bash
docker exec ai-bid-generator-minio-1 mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec ai-bid-generator-minio-1 mc anonymous set download local/bid-files
```

### 文件 URL 格式
- **浏览器访问**（通过 nginx 代理）：`/minio/bid-files/path/to/file`
- **外部服务访问**（如 ONLYOFFICE）：`http://163.7.6.60:9000/bid-files/path/to/file`

### 存储服务使用
```python
from apps.common.services.storage import StorageService
storage = StorageService()

# 上传文件
storage.upload_fileobj(file_obj, object_key, content_type)
storage.put_object(object_key, data_bytes, content_type)

# 读取文件
content = storage.get_object(object_key)

# 检查存在
exists = storage.object_exists(object_key)
```

## ONLYOFFICE 集成

### 配置要点
1. **文件 URL**: 必须使用绝对 URL（`http://163.7.6.60:9000/bid-files/...`）
2. **回调 URL**: `http://163.7.6.60/api/onlyoffice/callback/{document_id}/`
3. **JWT 认证**: 配置 `ONLYOFFICE_JWT_SECRET`

### Word 文档模型
```python
from apps.outline.models import BidDocument

# 创建文档
document = BidDocument.objects.create(outline=outline, title=filename, ...)

# 保存到 MinIO
document.save_file(content_bytes, filename)

# 获取访问 URL
url = document.get_file_url(absolute_url=True)  # 用于 ONLYOFFICE
url = document.get_file_url(absolute_url=False) # 用于浏览器
```

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
9. [ ] 如果修改了存储相关代码，确保 MinIO bucket 权限正确

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
| outlines | 标书制作 | None (公开) |
| templates | 流程模板 | None (公开) |
| knowledge | 知识库管理 | None (公开) |
| users | 用户管理 | user.manage |
| roles | 角色权限 | role.manage |
| prompts | 提示词管理 | prompt_template.manage |
| audit | 操作审计 | audit.view |
| settings | 系统设置 | system_settings.manage |