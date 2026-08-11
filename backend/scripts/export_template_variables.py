# backend/scripts/export_template_variables.py
"""把模板变量注册表导出为 OnlyOffice 插件的 variables.js。

用法：cd backend && .venv/bin/python scripts/export_template_variables.py
输出：../onlyoffice-plugins/bid-template-designer/variables.js

变量定义变更后需重新运行本脚本并重启 onlyoffice 容器（或让用户强刷页面）。
"""

import json
import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from apps.outline.services.template.template_variable_registry import registry  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "onlyoffice-plugins/bid-template-designer/variables.js",
)


def main():
    payload = {"groups": registry.grouped()}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 由 scripts/export_template_variables.py 生成，勿手改 */\n")
        f.write("window.BID_TEMPLATE_VARIABLES = ")
        f.write(json.dumps(payload, ensure_ascii=False, indent=2))
        f.write(";\n")
    count = sum(len(g["variables"]) for g in payload["groups"])
    print(f"exported {count} variables -> {OUT}")


if __name__ == "__main__":
    main()
