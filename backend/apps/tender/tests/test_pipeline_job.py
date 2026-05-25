"""PipelineJob 模型测试。"""

import pytest
from django.db import IntegrityError

from apps.tender.constants import PipelineStage, PipelineStatus
from apps.tender.models import PipelineJob, TenderFile


@pytest.mark.django_db
class TestPipelineJob:
    """PipelineJob 模型测试。"""

    def test_create_pipeline_job(self, tender_file):
        """测试创建流水线任务。"""
        job = PipelineJob.objects.create(
            tender_file=tender_file,
            stage=PipelineStage.PARSE,
            status=PipelineStatus.RUNNING,
            version="mock-parser-v1",
            input_hash="abc123",
        )
        assert job.id is not None
        assert job.stage == PipelineStage.PARSE
        assert job.status == PipelineStatus.RUNNING
        assert job.retry_count == 0

    def test_pipeline_job_str(self, tender_file):
        """测试字符串表示。"""
        job = PipelineJob.objects.create(
            tender_file=tender_file,
            stage=PipelineStage.PARSE,
            status=PipelineStatus.RUNNING,
            version="v1",
        )
        assert str(job) == f"parse#{job.id} (running)"

    def test_different_stages_allowed(self, tender_file):
        """测试同一文件可以创建不同阶段的任务。"""
        job1 = PipelineJob.objects.create(
            tender_file=tender_file,
            stage=PipelineStage.PARSE,
            status=PipelineStatus.RUNNING,
            version="v1",
        )
        job2 = PipelineJob.objects.create(
            tender_file=tender_file,
            stage=PipelineStage.CHUNK,
            status=PipelineStatus.RUNNING,
            version="v1",
        )
        assert job1.id is not None
        assert job2.id is not None
        assert job1.stage != job2.stage

    def test_multiple_succeeded_jobs_same_stage(self, tender_file):
        """测试同一文件同一阶段可以有多个已成功的任务（版本历史）。"""
        job1 = PipelineJob.objects.create(
            tender_file=tender_file,
            stage=PipelineStage.PARSE,
            status=PipelineStatus.SUCCEEDED,
            version="v1",
            input_hash="hash1",
        )
        job2 = PipelineJob.objects.create(
            tender_file=tender_file,
            stage=PipelineStage.PARSE,
            status=PipelineStatus.SUCCEEDED,
            version="v2",
            input_hash="hash2",
        )
        assert job1.id is not None
        assert job2.id is not None