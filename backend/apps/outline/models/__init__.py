# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .batch_task_item import BatchGenerationTaskItem
from .bid_document import BidDocument, BidDocumentStatus
from .bid_word_template import (
    BidWordTemplate,
    BidWordTemplateScope,
    BidWordTemplateStatus,
    BidWordTemplateVersion,
    BidWordTemplateVersionStatus,
)
from .generation_task import GenerationTask
from .global_fact import GlobalFactGroup
from .outline import Outline
from .outline_knowledge_base import OutlineKnowledgeBase
from .preset_template import PresetOutlineTemplate, PresetSectionTemplate
from .section import Section
from .section_generation_record import SectionGenerationRecord
from .section_manual_source import SectionManualSource
from .section_version import SectionVersion
from .section_writing_template import SectionWritingTemplate

__all__ = [
    "BatchGenerationTaskItem",
    "BidDocument",
    "BidDocumentStatus",
    "BidWordTemplate",
    "BidWordTemplateScope",
    "BidWordTemplateStatus",
    "BidWordTemplateVersion",
    "BidWordTemplateVersionStatus",
    "GenerationTask",
    "GlobalFactGroup",
    "Outline",
    "OutlineKnowledgeBase",
    "PresetOutlineTemplate",
    "PresetSectionTemplate",
    "Section",
    "SectionGenerationRecord",
    "SectionManualSource",
    "SectionVersion",
    "SectionWritingTemplate",
]