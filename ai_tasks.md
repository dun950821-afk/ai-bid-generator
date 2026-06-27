# 🍤 虾仁任务清单

> 自动化工程任务池，虾仁按顺序逐个执行

## 待办任务

- [x] 修复登录接口缺少 refresh_token 问题：登录响应应同时返回 access_token 和 refresh_token，前端需要能使用 refresh_token 续期
- [ ] 修复登录失败错误提示不精确问题：用户名/密码错误时应返回明确的认证失败提示而非通用"未认证"
- [ ] 修复企业材料包端点 404 问题：检查 enterprise 模块 URL 配置，补全 material-packages 路由
- [ ] 修复企业材料创建必须先上传文件问题：material_type 字段值不匹配（qualification 不是合法选项），需要修正 material_type choices 定义，同时确认 object_key 是否真的必填

## 已完成任务

（暂无）
