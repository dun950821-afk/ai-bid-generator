#!/usr/bin/env bash
# scripts/setup.sh
# 首次部署一键初始化：构建前端 → 构建镜像 → 启动容器 → 迁移 → 种子数据 → MinIO 权限
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1" >&2; }

# 检查 .env
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    warn ".env 不存在，从 .env.example 复制"
    cp .env.example .env
    warn "请编辑 .env 修改 DJANGO_SECRET_KEY / MINIO_PUBLIC_ENDPOINT / ONLYOFFICE_JWT_SECRET 后重跑"
    exit 1
  else
    err ".env 和 .env.example 都不存在"
    exit 1
  fi
fi

# 检查关键变量是否仍是默认值
if grep -q "^DJANGO_SECRET_KEY=dev-insecure-change-me$" .env; then
  err ".env 中 DJANGO_SECRET_KEY 仍是默认值，请改成随机字符串"
  err "生成方式：openssl rand -base64 32"
  exit 1
fi

# 1. 构建前端
log "构建前端..."
cd frontend
if [[ ! -d node_modules ]]; then
  log "安装前端依赖..."
  npm install
fi
npm run build
cd "$ROOT_DIR"

# 2. 构建镜像
log "构建 Docker 镜像..."
docker compose build web worker beat

# 3. 启动容器
log "启动容器..."
docker compose up -d

# 4. 等待 postgres 就绪
log "等待 postgres 就绪..."
for i in $(seq 1 30); do
  if docker exec ai-bid-generator-postgres-1 pg_isready -U bid -d bid >/dev/null 2>&1; then
    log "postgres 已就绪"
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    err "postgres 30s 内未就绪，请检查 docker logs ai-bid-generator-postgres-1"
    exit 1
  fi
done

# 5. 启用 pgvector 扩展
log "启用 pgvector 扩展..."
docker exec ai-bid-generator-postgres-1 psql -U bid -d bid -c "CREATE EXTENSION IF NOT EXISTS vector;" || \
  warn "pgvector 扩展创建失败，请确认镜像为 pgvector/pgvector:pg16"

# 6. 执行迁移
log "执行数据库迁移..."
docker exec ai-bid-generator-web-1 python manage.py migrate

# 7. 种子数据
log "执行种子数据初始化..."
docker exec ai-bid-generator-web-1 python manage.py sync_permissions
docker exec ai-bid-generator-web-1 python manage.py seed_prompts
docker exec ai-bid-generator-web-1 python manage.py seed_workflow_templates
docker exec ai-bid-generator-web-1 python manage.py seed_section_writing_templates

# 8. 创建超级用户（如不存在）
# 不再使用默认口令：优先取 ADMIN_INITIAL_PASSWORD，否则生成随机密码并打印一次
log "检查管理员账号..."
docker exec -e ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-}" ai-bid-generator-web-1 python manage.py shell <<'PY'
import os
import secrets
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    password = os.environ.get("ADMIN_INITIAL_PASSWORD") or (secrets.token_urlsafe(12) + "Aa1")
    User.objects.create_superuser('admin', 'admin@example.com', password)
    print(f"已创建管理员 admin，初始密码：{password}")
    print("请立即登录并修改密码。")
else:
    print("管理员 admin 已存在，跳过")
PY

# 9. 校验 MinIO bucket 可达性
# bucket 与公开前缀策略（editor/images、converted）由后端启动时自动配置，
# 此处不再设置全桶匿名下载，root 凭据从 .env 读取
log "校验 MinIO bucket..."
MINIO_ROOT_USER=$(grep -E '^MINIO_ROOT_USER=' .env | cut -d= -f2- || true)
MINIO_ROOT_PASSWORD=$(grep -E '^MINIO_ROOT_PASSWORD=' .env | cut -d= -f2- || true)
docker exec ai-bid-generator-minio-1 mc alias set local http://localhost:9000 \
  "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin}" >/dev/null 2>&1 || true
docker exec ai-bid-generator-minio-1 mc ls local/bid-files >/dev/null 2>&1 || \
  warn "MinIO bucket bid-files 不存在，将在后端首次启动时自动创建"

# 10. 重启 nginx
log "重启 nginx..."
docker compose restart nginx

log "✅ 初始化完成"
echo ""
echo "访问地址：http://localhost"
echo "管理员账号：admin（初始密码见上方输出，请立即登录修改）"
echo ""
echo "查看日志：docker compose logs -f"
echo "停止服务：docker compose down"
