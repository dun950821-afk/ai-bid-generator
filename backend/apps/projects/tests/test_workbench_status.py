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
    tender_file_factory(lot=lot, status="requirement_extracted")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "outline_generation"
    assert result["steps"]["file_parsing"]["status"] == "done"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "ready"


@pytest.mark.django_db
def test_ready_tender_file_shows_pending_and_blocks_outline_step(lot, tender_file_factory):
    """tender_file 的 status=ready 是"已上传待开始解析"：应显示 pending，file_parsing/大纲步骤不算完成。"""
    from apps.tender.models import TenderFile

    tender_file_factory(lot=lot, status=TenderFile.STATUS_READY)
    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["display_status"] == "pending"
    assert file_data["has_parsed_content"] is False
    assert result["steps"]["file_parsing"]["status"] == "pending"
    assert result["steps"]["outline_generation"]["status"] == "pending"


@pytest.mark.django_db
def test_attachment_ready_stays_ready(lot, tender_file_factory):
    """附件的 status=ready 是终态（随主文件合并解析），展示保持 ready。"""
    from apps.tender.models import TenderFile

    tender_file_factory(lot=lot, status=TenderFile.STATUS_READY, file_category=TenderFile.CATEGORY_ATTACHMENT)
    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["display_status"] == "ready"


@pytest.mark.django_db
def test_ready_file_with_parsed_doc_is_outline_generatable(lot, tender_file_factory):
    """有激活解析文档后应标记为可生成（has_parsed_content=True）。"""
    from apps.tender.models import ParsedDocument, TenderFile

    file = tender_file_factory(lot=lot, status=TenderFile.STATUS_READY)
    ParsedDocument.objects.create(
        tender_file=file,
        is_active=True,
        markdown_uri="parsed/1/document.md",
    )
    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["has_parsed_content"] is True


@pytest.mark.django_db
def test_failed_file_marks_parsing_failed(lot, tender_file_factory):
    """解析失败文件应标记 file_parsing 为 failed。"""
    tender_file_factory(lot=lot, status="parse_failed", error_message="解析超时")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["steps"]["file_parsing"]["status"] == "failed"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "failed"
    assert result["steps"]["tender_file"]["files"][0]["error_message"] == "解析超时"


@pytest.mark.django_db
def test_ready_file_with_failed_pipeline_stage_marks_parsing_failed(lot, tender_file_factory):
    """文件状态就绪但流水线存在失败阶段（如条款抽取失败）：file_parsing 应标记 failed，停留本步。"""
    from apps.tender.constants import PipelineStage, PipelineStatus
    from apps.tender.models import PipelineJob, TenderFile

    file = tender_file_factory(lot=lot, status=TenderFile.STATUS_REQUIREMENT_EXTRACTED)
    PipelineJob.objects.create(
        tender_file=file,
        stage=PipelineStage.REQUIREMENT_EXTRACT,
        status=PipelineStatus.FAILED,
        error_message="抽取失败",
    )
    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["display_status"] == "ready"
    assert any(
        s["stage"] == PipelineStage.REQUIREMENT_EXTRACT and s["status"] == PipelineStatus.FAILED
        for s in file_data["pipeline"]
    )
    assert result["steps"]["file_parsing"]["status"] == "failed"
    assert result["current_step"] == "file_parsing"


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
    tender_file_factory(lot=lot, status="requirement_extracted")
    outline_factory(lot=lot, is_current=True)
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "content_editing"
    assert result["steps"]["outline_generation"]["status"] == "done"
    assert result["steps"]["content_editing"]["status"] == "done"


@pytest.mark.django_db
def test_file_returns_pipeline_and_requirement_count(lot, tender_file_factory):
    """就绪文件应返回 pipeline 4 阶段与 requirement_count 字段。"""
    from apps.tender.constants import PipelineStage, PipelineStatus
    from apps.tender.models import PipelineJob

    f = tender_file_factory(lot=lot, status="requirement_extracted")
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.PARSE,
        status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.CHUNK,
        status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.REQUIREMENT_EXTRACT,
        status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.EMBEDDING,
        status=PipelineStatus.SKIPPED,
    )

    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["requirement_count"] == 0
    assert len(file_data["pipeline"]) == 4
    assert file_data["pipeline"][0]["stage_display"] == "文档解析"
    assert file_data["pipeline"][0]["status_display"] == "成功"
    assert file_data["pipeline"][1]["stage_display"] == "语义分块"
    assert file_data["pipeline"][2]["stage_display"] == "条款抽取"
    assert file_data["pipeline"][3]["stage_display"] == "向量嵌入"
    assert file_data["pipeline"][3]["status_display"] == "已跳过"


@pytest.mark.django_db
def test_pipeline_dedupes_rounds_by_stage(lot, tender_file_factory):
    """重新解析后 pipeline 每个阶段只显示最新 job，不重复展示历史轮次。

    回归 BUG：文件重新解析（或重试）后 PipelineJob 会累积多轮记录，
    get_status 原先全量拼接，导致工作台阶段列表重复
    （文档解析/语义分块各出现两次）。
    """
    from apps.tender.constants import PipelineStage, PipelineStatus
    from apps.tender.models import PipelineJob

    f = tender_file_factory(lot=lot, status="requirement_extracted")

    # 第一轮（旧解析）
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.PARSE, status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.CHUNK, status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.REQUIREMENT_EXTRACT,
        status=PipelineStatus.SUCCEEDED,
    )

    # 第二轮（重新解析后）：extract 被复用（get_or_create），embedding 新建
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.PARSE, status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.CHUNK, status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.EMBEDDING, status=PipelineStatus.SKIPPED,
    )

    result = WorkbenchStatusService.get_status(lot.id)
    pipeline = result["steps"]["tender_file"]["files"][0]["pipeline"]

    # 每个阶段只出现一次，且顺序稳定
    stages = [s["stage"] for s in pipeline]
    assert len(stages) == len(set(stages))
    assert stages == ["parse", "chunk", "requirement_extract", "embedding"]

    # 各阶段显示最新一轮的状态
    by_stage = {s["stage"]: s for s in pipeline}
    assert by_stage["parse"]["status"] == "succeeded"
    assert by_stage["chunk"]["status"] == "succeeded"
    assert by_stage["requirement_extract"]["status"] == "succeeded"
    assert by_stage["embedding"]["status"] == "skipped"


@pytest.mark.django_db
def test_pipeline_latest_stage_status_reflects_running_extract(lot, tender_file_factory):
    """extract job 被复用并置为运行中时，pipeline 应显示运行中而非旧的成功。"""
    from apps.tender.constants import PipelineStage, PipelineStatus
    from apps.tender.models import PipelineJob

    f = tender_file_factory(lot=lot, status="chunked")

    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.PARSE, status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.CHUNK, status=PipelineStatus.SUCCEEDED,
    )
    # 第二轮重新解析后 extract 复用旧 job 并置 RUNNING
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.PARSE, status=PipelineStatus.SUCCEEDED,
    )
    PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.CHUNK, status=PipelineStatus.SUCCEEDED,
    )
    reused = PipelineJob.objects.create(
        tender_file=f, stage=PipelineStage.REQUIREMENT_EXTRACT,
        status=PipelineStatus.SUCCEEDED,
    )
    reused.status = PipelineStatus.RUNNING
    reused.save(update_fields=["status"])

    result = WorkbenchStatusService.get_status(lot.id)
    pipeline = result["steps"]["tender_file"]["files"][0]["pipeline"]
    stages = [s["stage"] for s in pipeline]
    assert len(stages) == len(set(stages))
    by_stage = {s["stage"]: s for s in pipeline}
    assert by_stage["requirement_extract"]["status"] == "running"


@pytest.mark.django_db
def test_extracted_empty_status_maps_to_ready(lot, tender_file_factory):
    """requirement_extracted_empty 状态应映射为 ready（警告但不阻塞）。"""
    tender_file_factory(lot=lot, status="requirement_extracted_empty")
    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["display_status"] == "ready"
    assert file_data["status"] == "requirement_extracted_empty"
    # 仍可继续生成大纲
    assert result["current_step"] == "outline_generation"


@pytest.mark.django_db
def test_requirement_count_reflects_actual_requirement_rows(lot, tender_file_factory):
    """requirement_count 应反映 TenderRequirement 表实际行数。"""
    from apps.requirements.models import TenderRequirement, RequirementExtractionRun
    from apps.requirements.constants import ExtractionRunStatus
    from apps.tender.constants import ExtractionMethod

    f = tender_file_factory(lot=lot, status="requirement_extracted")
    run = RequirementExtractionRun.objects.create(
        tender_file=f, project=f.project,
        status=ExtractionRunStatus.SUCCESS,
        created_by=f.created_by,
    )
    for i in range(3):
        TenderRequirement.objects.create(
            tender_file=f,
            requirement_key=f"k{i}",
            title=f"条款{i}",
            content=f"内容{i}",
            requirement_type="scoring",
            extraction_type="scoring",
            extraction_method=ExtractionMethod.LLM,
            extraction_run=run,
            created_by=f.created_by,
        )

    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["requirement_count"] == 3


@pytest.mark.django_db
def test_generating_outline_does_not_jump_to_content_editing(lot, tender_file_factory, outline_factory):
    """生成中（status=generating）的草稿 outline 不应触发 current_step=content_editing。

    回归 BUG 1：task.py 一启动就创建 is_current draft outline，旧逻辑下 outline_status=done
    导致前端切到内容编辑面板，用户看到空大纲。修复后 generating 状态的 outline 不算可编辑。
    """
    tender_file_factory(lot=lot, status="requirement_extracted")
    outline_factory(lot=lot, is_current=True, status="generating")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] != "content_editing"
    assert result["steps"]["outline_generation"]["status"] == "pending"


@pytest.mark.django_db
def test_has_document_returns_export_step(lot, tender_file_factory, outline_factory, bid_document_factory):
    """有 Word 文档时 export 步骤应为 done。"""
    tender_file_factory(lot=lot, status="parsed")
    outline = outline_factory(lot=lot, is_current=True)
    bid_document_factory(outline=outline)
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["steps"]["export"]["status"] == "done"
    assert len(result["steps"]["export"]["documents"]) == 1


@pytest.mark.django_db
def test_workbench_status_api_requires_auth(lot, api_client):
    """未认证访问应返回 401。"""
    resp = api_client.get(f"/api/lots/{lot.id}/workbench_status/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_workbench_status_api_returns_aggregation(lot, api_client, bid_manager_user):
    """项目成员应能拿到聚合状态。"""
    from apps.projects.models import ProjectMember
    from apps.projects.services.role_service import RoleService
    roles = RoleService.initialize_builtin_roles(lot.project)
    editor_role = next(r for r in roles if r.code == "editor")
    ProjectMember.objects.create(
        project=lot.project, user=bid_manager_user, project_role=editor_role
    )
    api_client.force_authenticate(user=bid_manager_user)
    resp = api_client.get(f"/api/lots/{lot.id}/workbench_status/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["lot"]["id"] == lot.id
    assert data["current_step"] == "tender_file"


@pytest.mark.django_db
def test_workbench_status_api_non_member_forbidden(lot, api_client, normal_user):
    """非项目成员应返回 403。"""
    api_client.force_authenticate(user=normal_user)
    resp = api_client.get(f"/api/lots/{lot.id}/workbench_status/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_project_lots_api_returns_current_step(lot, api_client, bid_manager_user, tender_file_factory):
    """项目标段列表应返回 current_step 供概览看板使用。"""
    from apps.projects.models import ProjectMember
    from apps.projects.services.role_service import RoleService
    roles = RoleService.initialize_builtin_roles(lot.project)
    editor_role = next(r for r in roles if r.code == "editor")
    ProjectMember.objects.create(project=lot.project, user=bid_manager_user, project_role=editor_role)
    tender_file_factory(lot=lot, status="requirement_extracted")

    api_client.force_authenticate(user=bid_manager_user)
    resp = api_client.get(f"/api/projects/{lot.project.id}/lots/")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data[0]["id"] == lot.id
    assert data[0]["current_step"] == "outline_generation"
    assert "step_summary" in data[0]
    assert data[0]["step_summary"]["tender_file"] == "done"
    assert data[0]["step_summary"]["outline_generation"] == "pending"


@pytest.mark.django_db
def test_lot_step_summary_does_not_mark_export_done_without_documents(
    lot, tender_file_factory, outline_factory
):
    """轻量摘要中，无文档时 export 不应被误标为 done。

    回归 BUG：get_lot_step_summary 曾用假文档占位，导致标段列表里
    export 恒为 done。
    """
    tender_file_factory(lot=lot, status="requirement_extracted")
    outline_factory(lot=lot, is_current=True)
    result = WorkbenchStatusService.get_lot_step_summary(lot.id)
    assert result["steps"]["export"]["status"] == "pending"
    assert result["current_step"] == "content_editing"


@pytest.mark.django_db
def test_lot_step_summary_marks_export_done_with_documents(
    lot, tender_file_factory, outline_factory, bid_document_factory
):
    """轻量摘要中，有真实文档时 export 应为 done。"""
    tender_file_factory(lot=lot, status="requirement_extracted")
    outline = outline_factory(lot=lot, is_current=True)
    bid_document_factory(outline=outline)
    result = WorkbenchStatusService.get_lot_step_summary(lot.id)
    assert result["steps"]["export"]["status"] == "done"
    assert result["current_step"] == "export"


@pytest.mark.django_db
def test_chunking_status_maps_to_parsing(lot, tender_file_factory):
    """chunking 状态应映射为 parsing，并驱动 file_parsing 为 doing。"""
    tender_file_factory(lot=lot, status="chunking")
    result = WorkbenchStatusService.get_status(lot.id)
    file_data = result["steps"]["tender_file"]["files"][0]
    assert file_data["display_status"] == "parsing"
    assert result["steps"]["file_parsing"]["status"] == "doing"
    assert result["current_step"] == "file_parsing"
