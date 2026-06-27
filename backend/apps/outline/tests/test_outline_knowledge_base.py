# backend/apps/outline/tests/test_outline_knowledge_base.py
"""OutlineKnowledgeBase 中间表测试。"""

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.knowledge.models import KnowledgeBase
from apps.outline.models import Outline, OutlineKnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestOutlineKnowledgeBase:
    """OutlineKnowledgeBase 模型测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )

    def test_bind_kb(self):
        binding = OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb, sort_order=0
        )
        assert binding.is_active is True
        assert self.outline.kb_bindings.count() == 1
        assert self.kb.outline_bindings.count() == 1

    def test_unique_constraint(self):
        OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb
        )
        with pytest.raises(IntegrityError):
            OutlineKnowledgeBase.objects.create(
                outline=self.outline, knowledge_base=self.kb
            )

    def test_ordering(self):
        kb2 = KnowledgeBase.objects.create(
            name="KB2", kb_type="bid_history", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb, sort_order=2
        )
        OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=kb2, sort_order=1
        )
        bindings = list(self.outline.kb_bindings.all())
        assert bindings[0].knowledge_base_id == kb2.id
        assert bindings[1].knowledge_base_id == self.kb.id
