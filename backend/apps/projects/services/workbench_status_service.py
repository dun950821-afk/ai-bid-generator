"""标段工作台聚合状态服务。"""

from apps.common.models import AsyncTask
from apps.outline.models import BidDocument, Outline
from apps.projects.models import Lot
from apps.requirements.models import TenderRequirement
from apps.tender.constants import PipelineStatus
from apps.tender.models import ParsedDocument, TenderFile, PipelineJob

# 步骤顺序（与前端对齐）
STEP_ORDER = [
    "tender_file",
    "file_parsing",
    "outline_generation",
    "content_editing",
    "export",
]

# 文件内部状态 → 前端展示状态映射
FILE_DISPLAY_STATUS = {
    TenderFile.STATUS_UPLOADING: "uploading",
    TenderFile.STATUS_PARSE_PENDING: "parsing",
    TenderFile.STATUS_PARSING: "parsing",
    TenderFile.STATUS_CHUNKING: "parsing",
    TenderFile.STATUS_CHUNKED: "parsing",
    TenderFile.STATUS_PARSED: "ready",
    TenderFile.STATUS_REQUIREMENT_EXTRACTED: "ready",
    TenderFile.STATUS_REQUIREMENT_EXTRACTED_EMPTY: "ready",
    TenderFile.STATUS_READY: "ready",
    TenderFile.STATUS_INDEXED: "ready",
    TenderFile.STATUS_PARSE_FAILED: "failed",
    TenderFile.STATUS_REJECTED: "failed",
    TenderFile.STATUS_ARCHIVED: "failed",
    TenderFile.STATUS_UPLOAD_EXPIRED: "failed",
}

PARSING_INTERNAL_STATUSES = {
    TenderFile.STATUS_PARSE_PENDING,
    TenderFile.STATUS_PARSING,
    TenderFile.STATUS_CHUNKING,
    TenderFile.STATUS_CHUNKED,
}

READY_INTERNAL_STATUSES = {
    TenderFile.STATUS_PARSED,
    TenderFile.STATUS_REQUIREMENT_EXTRACTED,
    TenderFile.STATUS_REQUIREMENT_EXTRACTED_EMPTY,
    TenderFile.STATUS_INDEXED,
}


def _display_status_of(status: str, file_category: str) -> str:
    """文件内部状态 → 前端展示状态。

    tender_file 的 STATUS_READY 是"已上传待开始解析"（工作台上传后 auto_parse=false
    停在此状态），必须与真解析完成的 parsed/requirement_extracted 区分开，
    否则用户会误以为已解析完成。附件/澄清的 ready 是终态（随主文件合并解析），保持 ready。
    """
    if (
        status == TenderFile.STATUS_READY
        and file_category == TenderFile.CATEGORY_TENDER
    ):
        return "pending"
    return FILE_DISPLAY_STATUS.get(status, "parsing")


class WorkbenchStatusService:
    """标段工作台聚合状态服务。

    一次返回标段的完整制作状态，供前端轮询。
    """

    @staticmethod
    def get_status(lot_id: int) -> dict:
        try:
            lot = Lot.objects.select_related("project").get(pk=lot_id)
        except Lot.DoesNotExist:
            return {"error": "lot_not_found"}

        files = list(
            TenderFile.objects.filter(lot_id=lot_id)
            .exclude(status=TenderFile.STATUS_UPLOADING)
            .order_by("-created_at")
            .values("id", "original_name", "status", "error_message", "file_category")
        )

        file_ids = [f["id"] for f in files]

        # 一次性预取关联数据，避免 N+1 查询
        from django.db.models import Count
        requirement_counts = {
            r["tender_file_id"]: r["count"]
            for r in TenderRequirement.objects.filter(tender_file_id__in=file_ids)
            .values("tender_file_id")
            .annotate(count=Count("id"))
        }
        outline_counts = {
            r["source_tender_file_id"]: r["count"]
            for r in Outline.objects.filter(source_tender_file_id__in=file_ids)
            .values("source_tender_file_id")
            .annotate(count=Count("id"))
        }
        # 真正可生成大纲的文件：有激活的解析文档（markdown 全文已落地）。
        # 状态 ready 也可能是"已上传待开始解析"（auto_parse=false），不能仅凭状态判断。
        parsed_content_file_ids = set(
            ParsedDocument.objects.filter(
                tender_file_id__in=file_ids,
                is_active=True,
            )
            .exclude(markdown_uri__isnull=True)
            .exclude(markdown_uri="")
            .values_list("tender_file_id", flat=True)
        )

        # 每个文件按 stage 去重、保留最新 job（id 升序后写覆盖）。
        # 重新解析会累积多轮 PipelineJob，全量拼接会重复显示阶段；
        # extract job 通过 get_or_create 复用，最新状态即当前轮状态。
        latest_by_stage = {}
        for job in PipelineJob.objects.filter(tender_file_id__in=file_ids).order_by("id"):
            latest_by_stage.setdefault(job.tender_file_id, {})[job.stage] = job

        pipeline_map = {
            file_id: [
                {
                    "stage": job.stage,
                    "stage_display": job.get_stage_display(),
                    "status": job.status,
                    "status_display": job.get_status_display(),
                    "error_message": job.error_message or "",
                }
                for job in latest.values()  # dict 保持 stage 首次出现顺序
            ]
            for file_id, latest in latest_by_stage.items()
        }

        async_task_map = {}
        for t in AsyncTask.objects.filter(
            related_object_type="TenderFile",
            related_object_id__in=[str(fid) for fid in file_ids],
        ).order_by("-id"):
            # 取每个文件最近一个 task
            if t.related_object_id not in async_task_map:
                async_task_map[str(t.related_object_id)] = {
                    "id": t.id,
                    "status": t.status,
                    "progress": t.progress,
                    "current_step": t.current_step or "",
                }

        file_items = [
            {
                "id": f["id"],
                "name": f["original_name"],
                "status": f["status"],
                "file_category": f["file_category"],
                "display_status": _display_status_of(f["status"], f["file_category"]),
                "has_parsed_content": f["id"] in parsed_content_file_ids,
                "error_message": f["error_message"] or "",
                "requirement_count": requirement_counts.get(f["id"], 0),
                "outline_count": outline_counts.get(f["id"], 0),
                "pipeline": pipeline_map.get(f["id"], []),
                "async_task": async_task_map.get(str(f["id"])),
            }
            for f in files
        ]

        parsing_files = [f for f in file_items if f["display_status"] == "parsing"]
        ready_files = [f for f in file_items if f["display_status"] == "ready"]
        pending_files = [f for f in file_items if f["display_status"] == "pending"]
        failed_files = [f for f in file_items if f["display_status"] == "failed"]

        outlines = list(
            Outline.objects.filter(lot_id=lot_id)
            .order_by("-is_current", "-created_at")
            .values("id", "name", "status", "is_current")
        )

        # 查找关联此标段的进行中大纲生成任务
        generating_tasks = list(
            AsyncTask.objects.filter(
                task_type="generate_outline",
                related_object_type="lot",
                related_object_id=str(lot_id),
                status__in=["pending", "running", "retrying"],
            ).values("id", "status", "progress")
        )

        documents = list(
            BidDocument.objects.filter(outline__lot_id=lot_id)
            .order_by("-created_at")
            .values("id", "title", "status", "created_at", "outline_id",
                    "outline__name", "outline__is_current")
        )

        steps = WorkbenchStatusService._build_steps(
            file_items, parsing_files, ready_files, pending_files, failed_files,
            outlines, generating_tasks, documents,
        )
        current_step = WorkbenchStatusService._derive_current_step(steps)

        return {
            "lot": {"id": lot.id, "name": lot.name, "status": lot.status},
            "current_step": current_step,
            "steps": steps,
        }

    @staticmethod
    def get_lot_step_summary(lot_id: int) -> dict:
        """轻量进度摘要：仅计算 current_step 与各步骤状态。

        与 get_status 不同，不聚合文件明细/需求计数/流水线/任务详情，
        供标段列表与概览看板使用，避免每个标段一次完整工作台聚合。
        """
        file_rows = list(
            TenderFile.objects.filter(lot_id=lot_id)
            .exclude(status=TenderFile.STATUS_UPLOADING)
            .values_list("id", "status", "file_category")
        )
        file_items = [
            {"display_status": _display_status_of(s, c)}
            for _, s, c in file_rows
        ]
        parsing_files = [f for f in file_items if f["display_status"] == "parsing"]
        ready_files = [f for f in file_items if f["display_status"] == "ready"]
        pending_files = [f for f in file_items if f["display_status"] == "pending"]
        failed_files = [f for f in file_items if f["display_status"] == "failed"]

        # 与 get_status 同语义（按 stage 取最新 job）感知流水线失败阶段：
        # 抽取失败后文件状态已回退到就绪，仅凭 display_status 无法发现失败
        file_ids = [fid for fid, _, _ in file_rows]
        latest_by_stage = {}
        for job in PipelineJob.objects.filter(tender_file_id__in=file_ids).order_by("id"):
            latest_by_stage.setdefault(job.tender_file_id, {})[job.stage] = job
        has_failed_pipeline = any(
            job.status == PipelineStatus.FAILED
            for by_stage in latest_by_stage.values()
            for job in by_stage.values()
        )

        generating_tasks = list(
            AsyncTask.objects.filter(
                task_type="generate_outline",
                related_object_type="lot",
                related_object_id=str(lot_id),
                status__in=["pending", "running", "retrying"],
            ).values_list("id", flat=True)
        )

        outlines = list(
            Outline.objects.filter(lot_id=lot_id)
            .order_by("-is_current", "-created_at")
            .values("id", "status", "is_current")
        )

        has_documents = BidDocument.objects.filter(outline__lot_id=lot_id).exists()

        steps = WorkbenchStatusService._build_steps(
            file_items, parsing_files, ready_files, pending_files, failed_files,
            outlines, generating_tasks, [], has_documents=has_documents,
            has_failed_pipeline=has_failed_pipeline,
        )

        return {
            "current_step": WorkbenchStatusService._derive_current_step(steps),
            "steps": steps,
        }

    @staticmethod
    def _build_steps(file_items, parsing_files, ready_files, pending_files, failed_files,
                     outlines, generating_tasks, documents, has_documents=None,
                     has_failed_pipeline=False) -> dict:
        if has_documents is None:
            has_documents = len(documents) > 0

        # ① 招标文件
        tender_file_status = "done" if file_items else "pending"

        # ② 文件解析
        if parsing_files:
            file_parsing_status = "doing"
        elif failed_files and not ready_files:
            file_parsing_status = "failed"
        elif pending_files and not ready_files:
            file_parsing_status = "pending"  # 有"已上传待解析"文件，解析尚未开始
        elif file_items and all(f["display_status"] in ("ready", "failed") for f in file_items):
            # 文件状态就绪但存在失败文件或失败流水线阶段（如条款抽取失败）：
            # 不能视为完成，导航显示「解析失败」并停留本步处理
            if failed_files or has_failed_pipeline or any(
                s["status"] == "failed"
                for f in file_items
                for s in f.get("pipeline", [])
            ):
                file_parsing_status = "failed"
            else:
                file_parsing_status = "done"
        else:
            file_parsing_status = "pending"

        # ③ 大纲生成
        # generating 状态的 outline 是任务生成中的草稿锚点，章节尚未写入，不算已完成
        editable_outlines = [o for o in outlines if o.get("status") != "generating"]
        if generating_tasks:
            outline_status = "doing"
        elif failed_files and not ready_files:
            outline_status = "pending"  # 文件解析失败，不能生成大纲
        elif pending_files and not editable_outlines:
            outline_status = "pending"  # 有待解析文件，大纲生成未就绪
        elif editable_outlines:
            outline_status = "done"
        else:
            outline_status = "pending"

        # ④ 内容编辑
        current_outline = next((o for o in editable_outlines if o["is_current"]), None)
        editing_status = "done" if current_outline else "pending"

        # ⑤ 导出
        export_status = "done" if has_documents else "pending"

        return {
            "tender_file": {
                "status": tender_file_status,
                "file_count": len(file_items),
                "files": file_items,
            },
            "file_parsing": {"status": file_parsing_status},
            "outline_generation": {
                "status": outline_status,
                "outlines": outlines,
                "tasks": generating_tasks,
            },
            "content_editing": {
                "status": editing_status,
                "current_outline_id": current_outline["id"] if current_outline else None,
            },
            "export": {
                "status": export_status,
                "documents": [
                    {
                        "id": d["id"],
                        "title": d["title"],
                        "status": d["status"],
                        "created_at": d["created_at"].isoformat() if d["created_at"] else None,
                        "outline_id": d["outline_id"],
                        "outline_name": d["outline__name"],
                        "outline_is_current": d["outline__is_current"],
                    }
                    for d in documents
                ],
            },
        }

    @staticmethod
    def _derive_current_step(steps: dict) -> str:
        """推导当前应停留的步骤。

        语义：优先返回正在执行的步骤；否则返回前三个准备步骤中第一个未完成的；
        准备就绪后，有文档则停留导出页，否则停留内容编辑页。
        失败步骤视为未完成，引导用户原地处理。
        """
        # 有进行中的步骤时优先停留，便于展示实时进度
        for step_key in STEP_ORDER:
            if steps[step_key]["status"] == "doing":
                return step_key

        # 前三个步骤按顺序检查：文件、解析、大纲
        for step_key in STEP_ORDER[:3]:
            if steps[step_key]["status"] != "done":
                return step_key

        # 准备就绪：已有文档则展示导出，否则进入内容编辑
        return "export" if steps["export"]["status"] == "done" else "content_editing"
