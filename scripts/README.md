# scripts/ 运维脚本说明

所有脚本都从项目根目录运行，无需进入特定子目录。

| 脚本 | 用途 | 典型场景 |
|------|------|----------|
| `setup.sh` | 首次部署一键初始化 | 新机器首次部署 |
| `deploy.sh` | 代码更新后部署 | 拉取新代码后 |
| `migrate.sh` | 执行数据库迁移 | 新增模型字段后 |
| `seed_data.sh` | 初始化种子数据 | 重置或补全基础数据 |
| `dev.sh` | 本地开发启动（无 Docker） | 本地调试 |
| `db_backup.sh` | 备份 PostgreSQL | 定期备份 |
| `db_restore.sh` | 恢复 PostgreSQL | 灾难恢复 / 数据同步 |

## 使用示例

```bash
# 首次部署
cp .env.example .env
# 编辑 .env...
bash scripts/setup.sh

# 代码更新后
git pull
bash scripts/deploy.sh

# 新增模型字段后
bash scripts/migrate.sh

# 重置种子数据
bash scripts/seed_data.sh

# 备份数据库
bash scripts/db_backup.sh

# 恢复数据库（交互式确认）
bash scripts/db_restore.sh backups/bid_20260715.sql

# 本地开发（另开终端跑前端 cd frontend && npm run dev）
bash scripts/dev.sh
```

## 脚本行为详解

### setup.sh
1. 检查 `.env` 是否存在且关键变量已修改
2. 构建前端 `npm run build`
3. 构建 web/worker/beat Docker 镜像
4. 启动全部容器
5. 等待 postgres 就绪
6. 启用 pgvector 扩展
7. 执行 `migrate`
8. 执行种子数据（权限、角色、提示词、工作流、管理员）
9. 配置 MinIO bucket 公开下载
10. 重启 nginx

### deploy.sh
1. 构建前端
2. 重建 web/worker/beat 镜像
3. 重启服务
4. 等待 web 就绪
5. 执行迁移
6. 重启 nginx（避免 502）
7. 重启 worker/beat 加载新代码
8. 验证登录接口

### migrate.sh
1. 在 web 容器内执行 `makemigrations`
2. 执行 `migrate`
3. 显示迁移状态
4. 重启 web/worker/beat

### seed_data.sh
幂等执行以下命令：
- `sync_permissions` - 同步权限码
- `seed_prompts` - 提示词模板
- `seed_workflow_templates` - 工作流模板
- `seed_section_writing_templates` - 章节写作模板
- 创建管理员 `admin`（随机初始密码，仅打印一次；可用 `ADMIN_INITIAL_PASSWORD` 预设）

### db_backup.sh
- 备份到 `backups/bid_YYYYMMDD_HHMMSS.sql`
- 使用 `--clean --if-exists` 确保恢复时干净覆盖
- 自动清理超过 10 份的旧备份

### db_restore.sh
- 需要交互式确认（输入 `YES`）
- 从 SQL 文件恢复
- 恢复后建议重启后端服务

## 注意事项

- 所有脚本使用 `set -euo pipefail`，遇错即停
- 脚本会检查容器是否运行，未运行时给出提示
- `db_restore.sh` 是破坏性操作，需输入 `YES` 确认
- 备份文件位于 `backups/`，已加入 `.gitignore`
