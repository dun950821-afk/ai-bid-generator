"""标段工作台聚合状态服务测试。"""

import pytest

from apps.projects.services.workbench_status_service import WorkbenchStatusService


@pytest.mark.django_db
def test_empty_lot_returns_tender_file_step(lot, api_client, bid_manager_user):
    """空标段（无文件无大纲）的 current_step 应为 tender_file。"""
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["lot"]["id"] == lot.id
    assert result["current_step"] == "tender_file"
    assert result["steps"]["tender_file"]["status"] == "pending"
    assert result["steps"]["tender_file"]["file_count"] == 0
    assert result["steps"]["outline_generation"]["status"] == "pending"
    assert result["steps"]["export"]["status"] == "pending"


@pytest.mark.django_db
def test_parsing_file_returns_file_parsing_step(lot, tender_file_factory):
    """有解析中文件时 current_step 应为 file_parsing。"""
    tender_file_factory(lot=lot, status="parsing")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "file_parsing"
    assert result["steps"]["file_parsing"]["status"] == "doing"
    assert result["steps"]["tender_file"]["status"] == "done"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "parsing"


@pytest.mark.django_db
def test_ready_file_without_outline_returns_outline_step(lot, tender_file_factory):
    """有就绪文件但无大纲时 current_step 应为 outline_generation。"""
    tender_file_factory(lot=lot, status="parsed")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "outline_generation"
    assert result["steps"]["file_parsing"]["status"] == "done"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "ready"


@pytest.mark.django_db
def test_failed_file_marks_parsing_failed(lot, tender_file_factory):
    """解析失败文件应标记 file_parsing 为 failed。"""
    tender_file_factory(lot=lot, status="parse_failed", error_message="解析超时")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["steps"]["file_parsing"]["status"] == "failed"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "failed"
    assert result["steps"]["tender_file"]["files"][0]["error_message"] == "解析超时"


@pytest.mark.django_db
def test_generating_task_returns_outline_generation_step(lot, tender_file_factory, bid_manager_user):
    """有生成中大纲任务时 current_step 应为 outline_generation 且 status=doing。"""
    tender_file_factory(lot=lot, status="parsed")
    from apps.common.models import AsyncTask
    AsyncTask.objects.create(
        task_type="generate_outline",
        status="running",
        progress=45,
        related_object_type="lot",
        related_object_id=str(lot.id),
        created_by=bid_manager_user,
    )
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "outline_generation"
    assert result["steps"]["outline_generation"]["status"] == "doing"
    assert result["steps"]["outline_generation"]["tasks"][0]["progress"] == 45


@pytest.mark.django_db
def test_has_outline_returns_content_editing_step(lot, tender_file_factory, outline_factory):
    """有大纲时 current_step 应为 content_editing。"""
    tender_file_factory(lot=lot, status="parsed")
    outline_factory(lot=lot, is_current=True)
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "content_editing"
    assert result["steps"]["outline_generation"]["status"] == "done"
    assert result["steps"]["content_editing"]["status"] == "done"


@pytest.mark.django_db
def test_has_document_returns_export_step(lot, tender_file_factory, outline_factory, bid_document_factory):
    """有 Word 文档时 export 步骤应为 done。"""
    tender_file_factory(lot=lot, status="parsed")
    outline = outline_factory(lot=lot, is_current=True)
    bid_document_factory(outline=outline)
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["steps"]["export"]["status"] == "done"
    assert len(result["steps"]["export"]["documents"]) == 1
