# Phase 3 手工联调清单

## 1. 启动服务

```bash
cp .env.example .env
docker compose up -d postgres redis minio
cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py sync_permissions
python manage.py runserver 0.0.0.0:8000
```

另开终端：

```bash
cd backend
source .venv/bin/activate
celery -A config worker -l info -Q parse_queue,kb_queue,ai_queue,export_queue,notify_queue
```

前端：

```bash
cd frontend
npm run dev
```

## 2. 准备测试账号与项目

用 Django shell 创建：
- system_admin 或 bid_manager 用户
- Project
- ProjectMember(owner)

## 3. 登录联调

1. 打开 `http://localhost:5173/login`
2. 输入账号密码
3. 成功后跳转 `/dashboard`
4. DevTools 确认：
   - access 不在 localStorage
   - refresh_token 是 httpOnly Cookie
   - csrf_token 是普通 Cookie
5. access 过期后触发 refresh single-flight，接口自动重试
6. 登录后刷新浏览器页面，应保持登录态（refresh + me 自动恢复会话），不被踢回登录页

## 4. 上传联调

1. 进入 `/tender/upload`
2. 输入 project_id
3. 选择 PDF/DOCX
4. 点击上传
5. 确认：
   - `init-upload` 返回 presigned URL
   - 浏览器 PUT 到 MinIO
   - `complete-upload` 返回 `task_id`
   - TaskProgress 轮询到 success
   - 文件列表状态变为 parsed 或 ready

## 5. 权限联调

1. 非项目成员上传应返回 403
2. viewer 上传应返回 403
3. owner 上传成功
4. system_admin 不需要 ProjectMember 也可查看/操作

## 6. 异常联调

1. 上传伪造 pdf 的 txt 内容，应 rejected
2. 删除 MinIO 对象后 complete-upload，应 404
3. 重复 complete-upload，不应重复创建 AsyncTask
