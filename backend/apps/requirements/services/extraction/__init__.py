"""条款抽取流程（阶段化重构）。

模块职责：
- errors        - 异常类型
- progress      - 进度管理（ProgressCallback 写库 / ProgressTracker 并行聚合）
- context       - 共享输入上下文（全文/分块参考/模型配置，一次构建）
- output_parser - LLM 输出结构识别 + 大类映射（纯函数）
- filter        - 误分类三级过滤
- writer        - 条款落库（幂等）
- single_type   - 单场景抽取（AI 调用/重试/解析/过滤/落库）
- orchestrator  - 阶段编排与结果汇总
"""

from .errors import RequirementExtractionError
from .output_parser import detect_output_mode, parse_page_range
from .orchestrator import ExtractionOrchestrator
from .progress import ProgressCallback, ProgressTracker
from .single_type import MAX_AI_ATTEMPTS

__all__ = [
    "RequirementExtractionError",
    "ExtractionOrchestrator",
    "ProgressCallback",
    "ProgressTracker",
    "MAX_AI_ATTEMPTS",
    "detect_output_mode",
    "parse_page_range",
]
