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
log "检查管理员账号..."
docker exec ai-bid-generator-web-1 python manage.py shell <<'PY'
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print("已创建默认管理员 admin / admin123")
else:
    print("管理员 admin 已存在，跳过")
PY

# 9. 设置 MinIO bucket 公开下载
log "配置 MinIO bucket 权限..."
docker exec ai-bid-generator-minio-1 mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1 || true
docker exec ai-bid-generator-minio-1 mc anonymous set download local/bid-files >/dev/null 2>&1 || \
  warn "MinIO bucket 权限设置失败，请手动执行 mc anonymous set download local/bid-files"

# 10. 重启 nginx
log "重启 nginx..."
docker compose restart nginx

log "✅ 初始化完成"
echo ""
echo "访问地址：http://localhost"
echo "默认账号：admin / admin123（请立即修改密码）"
echo ""
echo "查看日志：docker compose logs -f"
echo "停止服务：docker compose down"
