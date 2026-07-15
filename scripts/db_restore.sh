#!/usr/bin/env bash
# scripts/db_restore.sh
# 从 SQL 文件恢复 PostgreSQL 数据库
# 用法：bash scripts/db_restore.sh backups/bid_YYYYMMDD.sql
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[restore]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1" >&2; }

if [[ $# -lt 1 ]]; then
  err "用法：bash scripts/db_restore.sh <sql_file>"
  err "例：bash scripts/db_restore.sh backups/bid_20260715.sql"
  exit 1
fi

SQL_FILE="$1"
if [[ ! -f "$SQL_FILE" ]]; then
  err "文件不存在：$SQL_FILE"
  exit 1
fi

CONTAINER="ai-bid-generator-postgres-1"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  err "容器 $CONTAINER 未运行"
  exit 1
fi

warn "⚠️ 此操作将覆盖当前数据库的内容！"
warn "目标文件：$SQL_FILE"
warn "目标数据库：$CONTAINER:5432/bid"
echo ""
read -p "确认恢复？输入 YES 继续：" confirm
if [[ "$confirm" != "YES" ]]; then
  log "已取消"
  exit 0
fi

log "恢复 PostgreSQL ..."
docker exec -i "$CONTAINER" psql -U bid -d bid < "$SQL_FILE"

log "✅ 恢复完成"
log "建议重启后端服务以清理缓存：docker compose restart web worker beat"
