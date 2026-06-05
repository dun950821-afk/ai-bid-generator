# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .bid_document import BidDocument
from .generation_task import GenerationTask
from .outline import Outline
from .preset_template import PresetOutlineTemplate, PresetSectionTemplate
from .section import Section
from .section_generation_record import SectionGenerationRecord
from .section_version import SectionVersion
from .section_writing_template import SectionWritingTemplate

__all__ = [
    "BidDocument",
    "GenerationTask",
    "Outline",
    "PresetOutlineTemplate",
    "PresetSectionTemplate",
    "Section",
    "SectionGenerationRecord",
    "SectionVersion",
    "SectionWritingTemplate",
]