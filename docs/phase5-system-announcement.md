# Phase 5: 系统公告功能（System Announcement）

> 需求：系统维护等场景下向全体用户发布公告。
> 1. 每个用户第一次登录、系统公告发布期间 → 弹窗展示公告内容，右上角两个按钮「不再提示」「关闭」。
> 2. 系统设置页新增「系统公告」维护能力：发布 / 下线 / 编辑 / 删除。

## 设计决策

- **落点**：扩展现有 `apps/notifications`（站内通知领域），新增 `Announcement`（公告内容，全局广播）+ `AnnouncementAck`（用户级确认状态：dismiss=不再提示 / seen=仅本次关闭）。不新建 app，避免重复基建。
- **弹窗规则**（幂等、可解释）：
  - 登录成功后前端拉 `GET /api/notifications/announcements/active/`：返回 `is_active=True` 且**未被当前用户 dismiss** 的公告（按发布时间倒序）。
  - 弹窗展示；「不再提示」→ `POST .../ack/ {action:"dismiss"}`，永久不再弹（幂等，重复点击无害）；「关闭」→ `POST .../ack/ {action:"seen"}`，本次会话关闭，下次登录若公告仍在发布中会再次弹出。
  - 多条公告依次展示（弹窗内序号指示）。
- **管理端**：系统设置页新增「系统公告」tab（复用已有 `system_settings.manage` 权限，无需新权限码/菜单项）。管理 API 与用户端 API 分开路由，管理端全量列表附带「已读/未读人数」统计。
- **数据模型**：

```python
class Announcement(TimeStampedModel):
    title = CharField(200)
    content = TextField()                       # 正文，支持换行（弹窗 white-space: pre-wrap）
    is_active = BooleanField(default=False)     # True=发布中, False=草稿/已下线
    created_by = FK(User, SET_NULL, null=True)
    published_at = DateTimeField(null=True)     # 首次发布上线时间
    offline_at = DateTimeField(null=True)       # 最近下线时间

class AnnouncementAck(models.Model):
    announcement = FK(Announcement, CASCADE, related_name="acks")
    user = FK(AUTH_USER_MODEL, CASCADE, related_name="announcement_acks")
    dismissed = BooleanField(default=False)     # 不再提示
    seen_at = DateTimeField(null=True)          # 最近一次看到
    dismissed_at = DateTimeField(null=True)
    UniqueConstraint(announcement, user)
```

## API 一览（挂在 /api/notifications/ 下）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/notifications/announcements/active/` | 登录用户 | 当前用户待弹窗的公告列表 |
| POST | `/api/notifications/announcements/<pk>/ack/` | 登录用户 | body `{action: "dismiss"\|"seen"}`，幂等 |
| GET | `/api/notifications/announcements/manage/` | system_settings.manage | 管理列表（含统计） |
| POST | `/api/notifications/announcements/manage/` | system_settings.manage | 新建（body 可带 `publish: true` 直接上线） |
| PATCH | `/api/notifications/announcements/manage/<pk>/` | system_settings.manage | 编辑标题/内容 |
| POST | `/api/notifications/announcements/manage/<pk>/publish/` | system_settings.manage | 发布上线（幂等） |
| POST | `/api/notifications/announcements/manage/<pk>/offline/` | system_settings.manage | 下线（幂等） |
| DELETE | `/api/notifications/announcements/manage/<pk>/` | system_settings.manage | 删除 |

发布/下线动作同步写 `published_at` / `offline_at`；重复 publish/offline 幂等（已处于目标状态直接返回 OK）。

## 前端改动

1. `frontend/src/api/announcement.ts` —— 全部路径带 `/api/` 前缀（项目坑 3）。
2. `frontend/src/components/announcement/AnnouncementDialog.vue` —— 登录后弹窗：
   - 顶部标题 + 右上角两个按钮：「不再提示」（primary 描边）、「关闭」。
   - 正文区 `white-space: pre-wrap` 可滚动；多条公告以「第 x / n 条」切换，关闭/不再提示后自动显示下一条。
   - `@dismiss` / `@close` 事件回调父组件（MainLayout）继续处理下一条。
3. `frontend/src/layout/MainLayout.vue` —— `onMounted` 拉取 active 公告，非空则显示弹窗（登录态守卫）。
4. `frontend/src/components/settings/AnnouncementSettingsPanel.vue` —— 管理表格 + 新建/编辑弹窗。
5. `frontend/src/views/admin/SystemSettingsView.vue` —— 新增「系统公告」tab。

## 部署与验证

1. 本地 `makemigrations notifications` + `pytest apps/notifications/tests/`。
2. 前端 `npm run build`（vue-tsc 零错误）。
3. `docker compose build web worker beat` + `up -d`（后台）。
4. `docker exec web python manage.py migrate`。
5. e2e 脚本验证：建公告 → publish → 用户 A 拉 active 可见 → ack dismiss → 再拉 active 为空 → 管理端列表统计正确 → offline 后用户 B 不可见。
6. git 提交。
