# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .batch_task_item import BatchGenerationTaskItem
from .bid_document import BidDocument
from .generation_task import GenerationTask
from .outline import Outline
from .outline_knowledge_base import OutlineKnowledgeBase
from .preset_template import PresetOutlineTemplate, PresetSectionTemplate
from .section import Section
from .section_generation_record import SectionGenerationRecord
from .section_version import SectionVersion
from .section_writing_template import SectionWritingTemplate

__all__ = [
    "BatchGenerationTaskItem",
    "BidDocument",
    "GenerationTask",
    "Outline",
    "OutlineKnowledgeBase",
    "PresetOutlineTemplate",
    "PresetSectionTemplate",
    "Section",
    "SectionGenerationRecord",
    "SectionVersion",
    "SectionWritingTemplate",
]