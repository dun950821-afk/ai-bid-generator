#!/usr/bin/env bash
# scripts/db_backup.sh
# 备份 PostgreSQL 数据库（结构 + 数据）
# 用法：bash scripts/db_backup.sh [输出文件名]
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[backup]${NC} $1"; }
err() { echo -e "${RED}[error]${NC} $1" >&2; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"

OUTPUT="${1:-bid_$(date +%Y%m%d_%H%M%S).sql}"
OUTPUT_PATH="$BACKUP_DIR/$OUTPUT"

CONTAINER="ai-bid-generator-postgres-1"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  err "容器 $CONTAINER 未运行"
  err "若本地有 postgres，请用 pg_dump -U bid -d bid > \"$OUTPUT_PATH\""
  exit 1
fi

log "备份 PostgreSQL 到 $OUTPUT_PATH ..."
docker exec "$CONTAINER" pg_dump -U bid -d bid --clean --if-exists > "$OUTPUT_PATH"

FILE_SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
log "✅ 备份完成：$OUTPUT_PATH ($FILE_SIZE)"

# 保留最近 10 份备份
cd "$BACKUP_DIR"
ls -1t bid_*.sql 2>/dev/null | tail -n +11 | while read -r old; do
  rm -f "$old"
  log "清理旧备份：$old"
done
