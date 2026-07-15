#!/usr/bin/env bash
# scripts/dev.sh
# 本地开发启动：启动依赖容器 + 迁移 + 种子数据 + Django runserver
# 前端开发请另开终端：cd frontend && npm run dev
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }

# 1. 启动依赖服务（postgres / redis / minio）
log "启动依赖容器..."
docker compose up -d postgres redis minio

# 2. 等待 postgres 就绪
log "等待 postgres..."
for i in $(seq 1 30); do
  if docker exec ai-bid-generator-postgres-1 pg_isready -U bid -d bid >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# 3. 启用 pgvector
log "启用 pgvector..."
docker exec ai-bid-generator-postgres-1 psql -U bid -d bid -c "CREATE EXTENSION IF NOT EXISTS vector;" || true

# 4. 后端 venv
cd backend
if [[ ! -d .venv ]]; then
  log "创建虚拟环境..."
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
else
  source .venv/bin/activate
fi

# 5. 迁移
log "执行迁移..."
python manage.py migrate

# 6. 种子数据（首次）
log "种子数据..."
python manage.py sync_permissions
python manage.py seed_prompts
python manage.py seed_workflow_templates
python manage.py seed_section_writing_templates

# 7. 启动 Django
log "启动 Django dev server (0.0.0.0:8000)..."
echo ""
warn "前端开发请另开终端：cd frontend && npm run dev"
warn "访问前端 dev server：http://localhost:5173 （/api 代理到 8000）"
warn "按 Ctrl+C 停止后端"
echo ""
python manage.py runserver 0.0.0.0:8000
