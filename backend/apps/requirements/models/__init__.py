# backend/apps/requirements/models/__init__.py
"""requirements app 模型。"""

from .requirement import TenderRequirement
from .extraction_run import RequirementExtractionRun

__all__ = ["TenderRequirement", "RequirementExtractionRun"]
