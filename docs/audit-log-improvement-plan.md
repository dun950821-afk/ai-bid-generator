# 日志审计报告与改进方案

## 一、现有日志架构

### 1.1 操作审计日志 (OperationLog)

**位置**: `backend/apps/audit/models.py`

**字段**:
- `actor`: 操作用户
- `action`: 动作类型
- `target_type`: 对象类型
- `target_id`: 对象 ID
- `summary`: 摘要
- `extra`: 附加上下文 (JSON)
- `ip`: 来源 IP
- `user_agent`: User-Agent
- `created_at`: 时间戳

**已记录的操作**:

| 模块 | action | 说明 |
|------|--------|------|
| tender | `tender.reparse` | 重新解析招标文件 |
| tender | `tender.activate_version` | 切换解析版本 |
| enterprise | `material_download` | 下载敏感材料 |

### 1.2 AI 运行记录 (PromptRun)

**位置**: `backend/apps/generation/models/prompt_run.py`

**字段**:
- `prompt_template`: 模板
- `prompt_version`: 版本
- `model_config`: 模型配置
- `scenario`: 场景
- `input_variables`: 输入变量
- `rendered_system_prompt`: 渲染后系统提示词
- `rendered_user_prompt`: 渲染后用户提示词
- `output_text`: 输出文本
- `output_json`: 输出 JSON
- `status`: 状态
- `prompt_tokens` / `completion_tokens` / `total_tokens`: Token 统计
- `latency_ms`: 耗时
- `error_message`: 错误信息
- `metadata`: 元数据 (包含 RAG 信息)

**已记录的 AI 场景**:
- `section_content_generation`: 章节内容生成
- `outline_generation`: 大纲生成
- `content_matrix_generation`: 矩阵生成
- `requirement_analysis`: 条款分析

---

## 二、缺失的日志审计

### 2.1 模板管理操作 (缺失)

| 操作 | action | 重要性 |
|------|--------|--------|
| 创建模板 | `prompt_template.create` | 高 |
| 更新模板 | `prompt_template.update` | 高 |
| 删除模板 | `prompt_template.delete` | 高 |
| 创建版本 | `prompt_version.create` | 高 |
| 发布版本 | `prompt_version.publish` | 高 |
| 下架版本 | `prompt_version.unpublish` | 高 |

### 2.2 模型配置操作 (缺失)

| 操作 | action | 重要性 |
|------|--------|--------|
| 创建模型配置 | `model_config.create` | 高 |
| 更新模型配置 | `model_config.update` | 高 |
| 删除模型配置 | `model_config.delete` | 高 |
| 设置默认模型 | `model_config.set_default` | 高 |

### 2.3 LLM 调用详情 (缺失)

**当前问题**: `PromptRun` 记录了输入输出，但缺少：
- 原始 API 请求/响应 (用于调试)
- 重试次数
- Provider 错误详情
- 思考模式输出 (DeepSeek thinking)
- 流式输出日志

### 2.4 模板执行统计 (缺失)

**需要统计**:
- 每个模板的成功率
- 平均 Token 消耗
- 平均延迟
- 常见错误类型
- Schema 校验失败率

### 2.5 其他业务操作 (缺失)

| 模块 | 操作 | action |
|------|------|--------|
| projects | 创建项目 | `project.create` |
| projects | 删除项目 | `project.delete` |
| projects | 归档项目 | `project.archive` |
| outline | 创建大纲 | `outline.create` |
| outline | 删除大纲 | `outline.delete` |
| knowledge | 上传知识库文件 | `knowledge.upload` |
| knowledge | 删除知识库文件 | `knowledge.delete` |
| workflow | 工作流状态变更 | `workflow.status_change` |

---

## 三、改进方案

### 3.1 新增 LLM 调用日志模型

```python
# backend/apps/generation/models/llm_call_log.py

class LlmCallLog(TimeStampedModel):
    """LLM API 调用日志（调试用）。"""
    
    prompt_run = models.ForeignKey(
        "generation.PromptRun",
        on_delete=models.CASCADE,
        related_name="llm_calls",
    )
    provider = models.CharField("Provider", max_length=32)
    model_name = models.CharField("模型名称", max_length=128)
    
    # 请求详情
    request_messages = models.JSONField("请求消息")
    request_params = models.JSONField("请求参数")
    
    # 响应详情
    response_content = models.TextField("响应内容", blank=True)
    response_headers = models.JSONField("响应头", default=dict)
    
    # 元数据
    attempt = models.IntegerField("重试次数", default=1)
    http_status = models.IntegerField("HTTP 状态码", null=True)
    error_type = models.CharField("错误类型", max_length=64, blank=True)
    error_detail = models.TextField("错误详情", blank=True)
    
    # 思考模式 (DeepSeek)
    thinking_content = models.TextField("思考过程", blank=True)
    
    # 耗时
    latency_ms = models.IntegerField("耗时毫秒", default=0)
    
    class Meta:
        db_table = "generation_llm_call_log"
        ordering = ["-created_at"]
```

### 3.2 新增模板执行统计模型

```python
# backend/apps/generation/models/prompt_stats.py

class PromptTemplateStats(TimeStampedModel):
    """模板执行统计（每日聚合）。"""
    
    prompt_template = models.ForeignKey(
        "generation.PromptTemplate",
        on_delete=models.CASCADE,
        related_name="daily_stats",
    )
    prompt_version = models.ForeignKey(
        "generation.PromptVersion",
        on_delete=models.CASCADE,
        related_name="daily_stats",
    )
    date = models.DateField("日期")
    
    # 执行统计
    total_runs = models.IntegerField("总执行次数", default=0)
    success_runs = models.IntegerField("成功次数", default=0)
    failed_runs = models.IntegerField("失败次数", default=0)
    
    # Token 统计
    total_prompt_tokens = models.BigIntegerField("总输入 Token", default=0)
    total_completion_tokens = models.BigIntegerField("总输出 Token", default=0)
    avg_prompt_tokens = models.IntegerField("平均输入 Token", default=0)
    avg_completion_tokens = models.IntegerField("平均输出 Token", default=0)
    
    # 延迟统计
    avg_latency_ms = models.IntegerField("平均延迟 ms", default=0)
    max_latency_ms = models.IntegerField("最大延迟 ms", default=0)
    min_latency_ms = models.IntegerField("最小延迟 ms", default=0)
    
    # Schema 校验
    schema_validation_runs = models.IntegerField("Schema 校验次数", default=0)
    schema_validation_failed = models.IntegerField("Schema 校验失败", default=0)
    
    class Meta:
        db_table = "generation_prompt_template_stats"
        unique_together = ["prompt_version", "date"]
```

### 3.3 增强 DeepSeek Provider 日志

在 `deepseek_client.py` 中添加详细日志：

```python
import logging

logger = logging.getLogger(__name__)

def chat(self, model_config, system_prompt, user_prompt, response_format=None):
    call_log = None
    try:
        # 记录请求
        logger.info(
            "LLM call starting",
            extra={
                "provider": "deepseek",
                "model": model_config.model_name,
                "temperature": model_config.temperature,
                "max_tokens": model_config.max_tokens,
                "enable_thinking": getattr(model_config, "enable_thinking", False),
                "has_response_format": response_format is not None,
            }
        )
        
        # ... 执行调用 ...
        
        # 记录成功响应
        logger.info(
            "LLM call succeeded",
            extra={
                "provider": "deepseek",
                "model": model_config.model_name,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "latency_ms": latency_ms,
            }
        )
        
    except Exception as e:
        # 记录失败
        logger.error(
            "LLM call failed",
            extra={
                "provider": "deepseek",
                "model": model_config.model_name,
                "error_type": type(e).__name__,
                "error_message": str(e),
            }
        )
        raise
```

### 3.4 新增审计服务装饰器

```python
# backend/apps/audit/services/audit_decorator.py

def audit_operation(action: str, target_type: str = ""):
    """审计装饰器，自动记录操作日志。"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            request = args[0] if args else None
            result = func(*args, **kwargs)
            
            if request and hasattr(request, 'user'):
                OperationLog.objects.create(
                    actor=request.user,
                    action=action,
                    target_type=target_type,
                    summary=f"{action} - {func.__name__}",
                    ip=get_client_ip(request),
                    user_agent=get_user_agent(request),
                )
            return result
        return wrapper
    return decorator

# 使用示例
@audit_operation("prompt_template.create", "PromptTemplate")
def create_template(request, *args, **kwargs):
    ...
```

---

## 四、实施优先级

### P0 - 立即实施

1. **增强 DeepSeek Provider 日志** - 在 `deepseek_client.py` 添加详细日志
2. **模板管理操作审计** - 在 `prompt_template` 视图添加 OperationLog
3. **模型配置操作审计** - 在 `model_config` 视图添加 OperationLog

### P1 - 短期实施

4. **新增 LlmCallLog 模型** - 记录完整的 API 请求/响应
5. **新增 PromptTemplateStats 模型** - 每日聚合统计
6. **项目/大纲操作审计** - 在关键业务视图添加 OperationLog

### P2 - 中期实施

7. **审计日志查询 API** - 按场景、模板、模型筛选
8. **模板调优仪表盘** - 展示成功率、Token 消耗、延迟趋势
9. **告警规则** - 失败率超过阈值时告警

---

## 五、当前可实现项

无需新增模型即可实现：

1. ✅ 在 `deepseek_client.py` 添加 `logger` 日志
2. ✅ 在 `ai_task_execution_service.py` 添加执行日志
3. ✅ 在模板/模型视图添加 `OperationLog` 记录
4. ✅ 在 `PromptRun.metadata` 中增加更多调试信息
