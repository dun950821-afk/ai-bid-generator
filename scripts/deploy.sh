#!/usr/bin/env bash
# scripts/deploy.sh
# 代码更新后部署：构建前端 → 重建镜像 → 重启 → 迁移 → 重启 nginx → 验证
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1" >&2; }

# 1. 构建前端
log "构建前端..."
cd frontend
npm run build
cd "$ROOT_DIR"

# 2. 重建镜像
log "重建 Docker 镜像..."
docker compose build web worker beat

# 3. 重启服务
log "重启 web / worker / beat..."
docker compose up -d web worker beat

# 4. 等待 web 就绪
log "等待 web 容器就绪..."
for i in $(seq 1 30); do
  if docker exec ai-bid-generator-web-1 python -c "import django" >/dev/null 2>&1; then
    log "web 已就绪"
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    err "web 30s 内未就绪"
    docker logs --tail 30 ai-bid-generator-web-1
    exit 1
  fi
done

# 5. 执行迁移
log "执行数据库迁移..."
docker exec ai-bid-generator-web-1 python manage.py migrate

# 6. 重启 nginx（避免缓存 502）
log "重启 nginx..."
docker compose restart nginx

# 7. 重启 worker/beat 以加载新代码
log "重启 worker/beat 以加载新代码..."
docker compose restart worker beat

# 8. 验证
log "验证服务状态..."
sleep 3

echo ""
echo "--- web 容器日志（最近 20 行）---"
docker logs --tail 20 ai-bid-generator-web-1

echo ""
log "验证登录接口..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' || echo "000")

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" ]]; then
  log "✅ 登录接口正常 (HTTP $HTTP_CODE)"
elif [[ "$HTTP_CODE" == "400" || "$HTTP_CODE" == "401" ]]; then
  warn "登录接口返回 $HTTP_CODE（可能是密码已修改，属正常）"
else
  err "登录接口异常 HTTP $HTTP_CODE，请检查 docker logs ai-bid-generator-web-1"
fi

echo ""
log "✅ 部署完成"
echo "访问地址：http://localhost"
