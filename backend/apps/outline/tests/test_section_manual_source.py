# backend/apps/outline/tests/test_section_manual_source.py
"""SectionManualSource 模型测试。"""

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.outline.models import Outline, Section, SectionManualSource
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestSectionManualSource:
    """SectionManualSource 模型测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="S", level=1, sort_order=1
        )

    def test_create_manual_source(self):
        ms = SectionManualSource.objects.create(
            section=self.section, chunk_id=1, document_id=10,
            document_title="doc.pdf", kb_id=1, kb_name="KB",
            channel="company_info", content_preview="...",
            selected_by=self.user,
        )
        assert ms.channel == "company_info"
        assert self.section.manual_sources.count() == 1

    def test_unique_section_chunk(self):
        SectionManualSource.objects.create(
            section=self.section, chunk_id=1, document_id=10,
            document_title="d", kb_id=1, kb_name="K", channel="company_info"
        )
        with pytest.raises(IntegrityError):
            SectionManualSource.objects.create(
                section=self.section, chunk_id=1, document_id=10,
                document_title="d", kb_id=1, kb_name="K", channel="company_info"
            )
