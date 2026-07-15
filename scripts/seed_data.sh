#!/usr/bin/env bash
# scripts/seed_data.sh
# 初始化种子数据：权限、角色、提示词模板、工作流模板、章节写作模板、管理员账号
# 所有命令均幂等，可重复执行
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[seed]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }

CONTAINER="ai-bid-generator-web-1"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  warn "容器 $CONTAINER 未运行，尝试本地执行..."
  cd backend
  python manage.py sync_permissions
  python manage.py seed_prompts
  python manage.py seed_workflow_templates
  python manage.py seed_section_writing_templates
  exit 0
fi

log "1/5 同步权限码..."
docker exec "$CONTAINER" python manage.py sync_permissions

log "2/5 初始化提示词模板..."
docker exec "$CONTAINER" python manage.py seed_prompts

log "3/5 初始化工作流模板..."
docker exec "$CONTAINER" python manage.py seed_workflow_templates

log "4/5 初始化章节写作模板..."
docker exec "$CONTAINER" python manage.py seed_section_writing_templates

log "5/5 检查管理员账号..."
docker exec "$CONTAINER" python manage.py shell <<'PY'
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print("已创建默认管理员 admin / admin123")
else:
    print("管理员 admin 已存在，跳过")
PY

log "✅ 种子数据初始化完成"
