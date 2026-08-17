# backend/apps/outline/services/template/sandboxed_render.py
"""docxtpl 渲染安全围栏。

背景：docxtpl 默认使用非沙箱 ``jinja2.Environment``，模板作者写入的任意
Jinja 表达式（如 ``{{ cycler.__init__.__globals__ }}``）会在服务端求值，
造成 SSTI / RCE（安全审计 F-10）。

所有 docxtpl 渲染入口（模板校验的测试渲染、标书导出渲染）必须经由
``render_docx`` 走沙箱环境，禁止直接调用 ``tpl.render(...)``。
"""

from jinja2.sandbox import SandboxedEnvironment


def make_sandbox_env() -> SandboxedEnvironment:
    """构造渲染用沙箱环境。

    - 沙箱拦截下划线属性访问（__globals__ / __class__ 等 RCE 跳板）；
    - autoescape 保持开启（原方案 §29 要求），转义输出值中的 XML 特殊字符。
    """
    return SandboxedEnvironment(autoescape=True)


def render_docx(tpl, context: dict) -> None:
    """用沙箱 Jinja 环境渲染 docxtpl 模板。

    等价于 ``tpl.render(context, autoescape=True)``，但表达式求值被限制
    在沙箱内；访问危险属性会抛 ``jinja2.exceptions.SecurityError``。
    """
    tpl.render(context, jinja_env=make_sandbox_env())
