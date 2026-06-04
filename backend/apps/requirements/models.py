from django.db import models

# 模型定义移至 models/ 子目录
from .models import TenderRequirement, RequirementExtractionRun

__all__ = ["TenderRequirement", "RequirementExtractionRun"]
