#!/usr/bin/env bash
# scripts/migrate.sh
# 在 web 容器内执行数据库迁移：makemigrations → migrate → 重启服务
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[migrate]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }

CONTAINER="ai-bid-generator-web-1"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  warn "容器 $CONTAINER 未运行，尝试本地执行..."
  cd backend
  python manage.py makemigrations
  python manage.py migrate
  exit 0
fi

log "生成迁移文件..."
docker exec "$CONTAINER" python manage.py makemigrations

log "执行迁移..."
docker exec "$CONTAINER" python manage.py migrate

log "查看迁移状态..."
docker exec "$CONTAINER" python manage.py showmigrations | tail -30

log "重启 web / worker / beat..."
docker compose restart web worker beat

log "✅ 迁移完成"
