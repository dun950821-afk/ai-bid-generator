"""轻量标段进度摘要测试（get_lot_step_summary）。

核心不变量：摘要的 current_step 与各步骤 status 必须与完整聚合 get_status 完全一致。
"""

import pytest

from apps.common.models import AsyncTask
from apps.projects.services.workbench_status_service import WorkbenchStatusService


def _assert_summary_matches_status(lot_id: int):
    full = WorkbenchStatusService.get_status(lot_id)
    summary = WorkbenchStatusService.get_lot_step_summary(lot_id)
    assert summary["current_step"] == full["current_step"]
    for key in full["steps"]:
        assert summary["steps"][key]["status"] == full["steps"][key]["status"], key


@pytest.mark.django_db
def test_empty_lot_matches(lot):
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_parsing_file_matches(lot, tender_file_factory):
    tender_file_factory(lot=lot, status="parsing")
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_ready_file_without_outline_matches(lot, tender_file_factory):
    tender_file_factory(lot=lot, status="requirement_extracted")
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_failed_file_matches(lot, tender_file_factory):
    tender_file_factory(lot=lot, status="parse_failed", error_message="解析超时")
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_generating_task_matches(lot, tender_file_factory, bid_manager_user):
    tender_file_factory(lot=lot, status="parsed")
    AsyncTask.objects.create(
        task_type="generate_outline",
        status="running",
        progress=45,
        related_object_type="lot",
        related_object_id=str(lot.id),
        created_by=bid_manager_user,
    )
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_outline_matches(lot, tender_file_factory, outline_factory):
    tender_file_factory(lot=lot, status="requirement_extracted")
    outline_factory(lot=lot, is_current=True)
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_document_matches(lot, tender_file_factory, outline_factory, bid_document_factory):
    tender_file_factory(lot=lot, status="parsed")
    outline = outline_factory(lot=lot, is_current=True)
    bid_document_factory(outline=outline)
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_generating_outline_matches(lot, tender_file_factory, outline_factory):
    """生成中的草稿大纲：摘要也不应跳转 content_editing。"""
    tender_file_factory(lot=lot, status="requirement_extracted")
    outline_factory(lot=lot, is_current=True, status="generating")
    _assert_summary_matches_status(lot.id)


@pytest.mark.django_db
def test_failed_pipeline_stage_matches(lot, tender_file_factory):
    """文件就绪但流水线阶段失败（抽取失败回退后）：摘要与工作台一致标记 file_parsing 为 failed。"""
    from apps.tender.constants import PipelineStage, PipelineStatus
    from apps.tender.models import PipelineJob, TenderFile

    file = tender_file_factory(lot=lot, status=TenderFile.STATUS_REQUIREMENT_EXTRACTED)
    PipelineJob.objects.create(
        tender_file=file,
        stage=PipelineStage.REQUIREMENT_EXTRACT,
        status=PipelineStatus.FAILED,
        error_message="抽取失败",
    )
    _assert_summary_matches_status(lot.id)
    summary = WorkbenchStatusService.get_lot_step_summary(lot.id)
    assert summary["steps"]["file_parsing"]["status"] == "failed"
