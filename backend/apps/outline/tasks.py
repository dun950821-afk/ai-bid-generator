# backend/apps/outline/tasks.py
"""大纲模块 Celery 任务。"""

import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.outline.constants import (
    GenerationRecordStatus,
    OutlineSource,
    OutlineStatus,
    SectionGenerationStatus,
    SectionStatus,
    SectionVersionSource,
)
from apps.outline.models import Outline, Section, SectionVersion, SectionGenerationRecord
from apps.outline.services.section_generation_service import SectionGenerationService

User = get_user_model()
logger = logging.getLogger(__name__)


@shared_task(bind=True)
def generate_section_task(
    self,
    section_id: int,
    record_id: int,
    analysis_result: dict,
    user_prompt: str,
    user_id: int,
):
    """单章节生成任务。

    注意：任务参数不传递大段上下文正文，
    具体上下文在任务内部通过 prepare_generation_context 重新构建。
    """
    try:
        section = Section.objects.get(pk=section_id)
        record = SectionGenerationRecord.objects.get(pk=record_id)
        user = User.objects.get(pk=user_id)

        # 更新状态
        section.generation_status = SectionGenerationStatus.RUNNING
        section.save()
        record.status = GenerationRecordStatus.RUNNING
        record.save()

        # 在任务内部构建上下文
        context = SectionGenerationService().prepare_generation_context(
            section_id=section_id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=user_id,
        )

        # 构建 section_writing 提示词所需的变量
        section_info = context.get("section_info", {})
        section_variables = {
            "section_title": section_info.get("title", ""),
            "section_requirements": "\n".join([
                f"- {r.get('title', '')}: {r.get('content', '')[:200]}"
                for r in context.get("related_requirements", [])[:5]
            ]) if context.get("related_requirements") else "",
            "tech_params": "",
            "company_cases": "",
            "writing_style": "专业、简洁、逻辑清晰",
        }

        # 如果有用户提示词或检索到的知识，附加到需求中
        extra_context = []
        if context.get("user_prompt"):
            extra_context.append(f"\n用户要求：{context['user_prompt']}")
        if context.get("retrieved_knowledge"):
            extra_context.append(f"\n参考知识：\n{context['retrieved_knowledge'][:2000]}")
        if extra_context:
            section_variables["section_requirements"] += "\n".join(extra_context)

        # 调用 AI 生成
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
        )

        prompt_run = AiTaskExecutionService().execute(
            scenario="section_writing",
            variables=section_variables,
            created_by=user,
        )

        if prompt_run.status == "succeeded":
            # 优先从 output_json 获取，否则从 output_text 获取
            content = prompt_run.output_json.get("content", "") if prompt_run.output_json else ""
            if not content and prompt_run.output_text:
                content = prompt_run.output_text
            word_count = len(content)

            # 保存内容（事务内生成版本号）
            with transaction.atomic():
                section = Section.objects.select_for_update().get(pk=section_id)

                # 更新章节
                section.content = content
                section.word_count = word_count
                section.generation_status = SectionGenerationStatus.SUCCESS
                section.status = SectionStatus.GENERATED
                section.save()

                # 创建版本（version_no 事务内计算）
                max_version = (
                    SectionVersion.objects.filter(section=section)
                    .aggregate(max_version=models.Max("version_no"))["max_version"]
                    or 0
                )
                SectionVersion.objects.create(
                    section=section,
                    content=content,
                    version_no=max_version + 1,
                    source=SectionVersionSource.AI,
                    word_count=word_count,
                    created_by=user,
                )

            # 更新记录（不存完整正文）
            record.prompt_run = prompt_run
            record.prompt_template_id = prompt_run.prompt_template_id
            record.prompt_version = (
                prompt_run.prompt_version.version if prompt_run.prompt_version else ""
            )
            record.llm_model = (
                prompt_run.model_config.display_name if prompt_run.model_config else ""
            )
            record.output_summary = {
                "word_count": word_count,
                "prompt_run_id": prompt_run.id,
            }
            record.status = GenerationRecordStatus.SUCCESS
            record.finished_at = timezone.now()
            record.save()

        else:
            raise Exception(prompt_run.error_message or "AI 生成失败")

    except Exception as e:
        logger.exception(f"Section generation failed: section_id={section_id}")

        section = Section.objects.get(pk=section_id)
        section.generation_status = SectionGenerationStatus.FAILED
        section.save()

        record = SectionGenerationRecord.objects.get(pk=record_id)
        record.status = GenerationRecordStatus.FAILED
        record.error_message = str(e)[:2000]
        record.finished_at = timezone.now()
        record.save()

        # 更新 AsyncTask 状态
        async_task = AsyncTask.objects.get(pk=record.async_task_id)
        async_task.status = "failed"
        async_task.error_message = str(e)[:2000]
        async_task.finished_at = timezone.now()
        async_task.save()

        raise


@shared_task(bind=True)
def generate_sections_batch_task(
    self,
    outline_id: int,
    async_task_id: int,
    user_id: int,
):
    """批量生成章节任务。"""
    user = User.objects.get(pk=user_id)
    async_task = AsyncTask.objects.get(pk=async_task_id)

    # 获取待生成的记录
    records = (
        SectionGenerationRecord.objects.filter(
            async_task=async_task,
            status=GenerationRecordStatus.PENDING,
        )
        .select_related("section")
        .order_by("section__sort_order")
    )

    total = records.count()
    completed = 0
    failed = 0

    for idx, record in enumerate(records, 1):
        try:
            # 分析需求（同步）
            analysis = SectionGenerationService().analyze_section_needs(
                record.section_id
            )

            # 准备上下文（任务内部构建）
            context = SectionGenerationService().prepare_generation_context(
                section_id=record.section_id,
                analysis_result=analysis,
                user_prompt=record.section.user_prompt or "",
                user_id=user_id,
            )

            # 构建 section_writing 提示词所需的变量
            section_info = context.get("section_info", {})
            section_variables = {
                "section_title": section_info.get("title", ""),
                "section_requirements": "\n".join([
                    f"- {r.get('title', '')}: {r.get('content', '')[:200]}"
                    for r in context.get("related_requirements", [])[:5]
                ]) if context.get("related_requirements") else "",
                "tech_params": "",
                "company_cases": "",
                "writing_style": "专业、简洁、逻辑清晰",
            }

            # 如果有用户提示词或检索到的知识，附加到需求中
            extra_context = []
            if context.get("user_prompt"):
                extra_context.append(f"\n用户要求：{context['user_prompt']}")
            if context.get("retrieved_knowledge"):
                extra_context.append(f"\n参考知识：\n{context['retrieved_knowledge'][:2000]}")
            if extra_context:
                section_variables["section_requirements"] += "\n".join(extra_context)

            # 生成章节
            from apps.generation.services.ai_task_execution_service import (
                AiTaskExecutionService,
            )

            prompt_run = AiTaskExecutionService().execute(
                scenario="section_writing",
                variables=section_variables,
                created_by=user,
            )

            if prompt_run.status == "succeeded":
                # 优先从 output_json 获取，否则从 output_text 获取
                content = prompt_run.output_json.get("content", "") if prompt_run.output_json else ""
                if not content and prompt_run.output_text:
                    content = prompt_run.output_text
                word_count = len(content)

                # 保存内容（事务内）
                with transaction.atomic():
                    section = Section.objects.select_for_update().get(
                        pk=record.section_id
                    )

                    section.content = content
                    section.word_count = word_count
                    section.generation_status = SectionGenerationStatus.SUCCESS
                    section.status = SectionStatus.GENERATED
                    section.save()

                    max_version = (
                        SectionVersion.objects.filter(section=section)
                        .aggregate(max_version=models.Max("version_no"))["max_version"]
                        or 0
                    )
                    SectionVersion.objects.create(
                        section=section,
                        content=content,
                        version_no=max_version + 1,
                        source=SectionVersionSource.AI,
                        word_count=word_count,
                        created_by=user,
                    )

                record.status = GenerationRecordStatus.SUCCESS
                record.output_summary = {"word_count": word_count}
                completed += 1

            else:
                record.status = GenerationRecordStatus.FAILED
                record.error_message = prompt_run.error_message or "AI 生成失败"
                failed += 1

        except Exception as e:
            logger.exception(
                f"Batch section generation failed: section_id={record.section_id}"
            )
            record.status = GenerationRecordStatus.FAILED
            record.error_message = str(e)[:2000]
            failed += 1

        record.finished_at = timezone.now()
        record.save()

        # 更新整体进度
        progress = int((idx / total) * 100) if total > 0 else 100
        async_task.progress = progress
        async_task.current_step = f"已完成 {completed}/{total}，失败 {failed}"
        async_task.save()

    # 完成任务
    async_task.result_payload = {
        "total": total,
        "completed": completed,
        "failed": failed,
    }
    async_task.status = (
        "success"
        if failed == 0
        else ("failed" if completed == 0 else "success")
    )
    async_task.finished_at = timezone.now()
    async_task.save()


@shared_task(bind=True)
def generate_outline_task(
    self,
    tender_file_id: int,
    async_task_id: int,
    user_id: int,
):
    """AI解析招标文件生成大纲任务。

    Args:
        tender_file_id: 招标文件ID
        async_task_id: 异步任务ID
        user_id: 用户ID
    """
    from apps.common.services.storage import StorageService
    from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
    from apps.tender.models import TenderFile, ParsedDocument

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = "running"
        async_task.current_step = "读取招标文件内容"
        async_task.save()

        # 获取招标文件
        tender_file = TenderFile.objects.select_related("project", "lot").get(
            pk=tender_file_id
        )

        if not tender_file.lot:
            raise ValueError("招标文件必须绑定标段")

        # 获取解析文档
        parsed_doc = ParsedDocument.objects.filter(
            tender_file=tender_file,
            is_active=True,
        ).first()

        if not parsed_doc or not parsed_doc.markdown_uri:
            raise ValueError("招标文件未解析或解析结果不存在")

        # 从 MinIO 加载全文
        storage = StorageService()
        content = storage.get_object(parsed_doc.markdown_uri)
        full_text = content.decode("utf-8")

        async_task.current_step = "调用AI生成大纲"
        async_task.progress = 30
        async_task.save()

        # 调用 AI 生成大纲
        variables = {
            "project_name": tender_file.project.name,
            "tender_document_full_text": full_text,
        }

        prompt_run = AiTaskExecutionService().execute(
            scenario="outline_generation",
            variables=variables,
            created_by=user,
        )

        if prompt_run.status != "succeeded":
            raise Exception(prompt_run.error_message or "AI 生成大纲失败")

        async_task.current_step = "解析大纲结构"
        async_task.progress = 70
        async_task.save()

        # 解析 AI 输出
        output_text = prompt_run.output_text or ""
        sections = _parse_outline_response(output_text)

        if not sections:
            raise ValueError("AI 输出中未找到有效的目录结构")

        # 创建大纲
        with transaction.atomic():
            # 置空其他当前大纲
            Outline.objects.filter(lot=tender_file.lot, is_current=True).update(
                is_current=False
            )

            # 创建大纲
            outline = Outline.objects.create(
                project=tender_file.project,
                lot=tender_file.lot,
                name=f"{tender_file.lot.name} - AI解析大纲",
                source=OutlineSource.AI_GENERATED,
                source_tender_file=tender_file,
                status=OutlineStatus.DRAFT,
                is_current=True,
                created_by=user,
            )

            # 创建章节（构建树形结构）
            section_stack = []  # 用于追踪各级父节点
            for idx, section_data in enumerate(sections):
                level = section_data.get("level", 1)
                title = section_data.get("title", "")

                # 根据 level 确定父节点
                # level 1 -> parent=None
                # level 2 -> parent=最近的 level 1 节点
                # level 3 -> parent=最近的 level 2 节点
                # ...
                parent = None
                if level > 1 and section_stack:
                    # 弹出比当前 level 高的节点，保留同级或更低的
                    while section_stack and section_stack[-1]["level"] >= level:
                        section_stack.pop()
                    if section_stack:
                        parent = section_stack[-1]["section"]

                section = Section.objects.create(
                    outline=outline,
                    parent=parent,
                    title=title,
                    level=level,
                    sort_order=idx,
                )

                # 加入栈中，作为后续可能的父节点
                section_stack.append({"level": level, "section": section})

        async_task.status = "success"
        async_task.progress = 100
        async_task.current_step = "大纲生成完成，正在生成内容责任矩阵"
        async_task.result_payload = {
            "outline_id": outline.id,
            "section_count": len(sections),
            "prompt_run_id": prompt_run.id,
        }
        async_task.finished_at = timezone.now()
        async_task.save()

        # 自动触发矩阵生成
        try:
            from apps.outline.services.matrix_service import MatrixService

            MatrixService().start_matrix_generation(
                outline_id=outline.id,
                user=user,
            )
        except Exception as e:
            # 矩阵生成失败不影响大纲创建
            logger.warning(f"Failed to start matrix generation for outline {outline.id}: {e}")

    except Exception as e:
        logger.exception(f"Outline generation failed: tender_file_id={tender_file_id}")

        async_task.status = "failed"
        async_task.error_message = str(e)[:2000]
        async_task.finished_at = timezone.now()
        async_task.save()

        raise


def _parse_outline_response(output_text: str) -> list[dict]:
    """解析 AI 输出的目录结构。

    Args:
        output_text: AI 输出文本

    Returns:
        章节列表 [{"title": "...", "level": 1}, ...]
    """
    import json
    import re

    sections = []

    # 尝试从输出中提取 JSON 格式
    json_patterns = [
        r'\{[\s\S]*"sections"[\s\S]*\}',  # {"sections": [...]}
        r'\[[\s\S]*\]',  # [...]
    ]

    for pattern in json_patterns:
        json_match = re.search(pattern, output_text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                if isinstance(data, list):
                    return _parse_sections_list(data, level=1)
                elif isinstance(data, dict) and "sections" in data:
                    return _parse_sections_list(data["sections"], level=1)
            except json.JSONDecodeError:
                continue

    # 解析文本格式的目录
    lines = output_text.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 去除 Markdown 格式符号（**加粗**、*斜体*等）
        line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        line = re.sub(r"\*(.+?)\*", r"\1", line)
        line = re.sub(r"__(.+?)__", r"\1", line)
        line = re.sub(r"_(.+?)_", r"\1", line)

        level, title = _parse_line_level_title(line)
        if level and title:
            sections.append({"title": title, "level": level})

    return sections


def _parse_sections_list(sections_data: list, level: int = 1) -> list[dict]:
    """递归解析嵌套的章节结构。"""
    result = []
    for item in sections_data:
        if isinstance(item, dict):
            title = item.get("title", "")
            if title:
                result.append({"title": title, "level": level})
            if "children" in item:
                result.extend(_parse_sections_list(item["children"], level + 1))
        elif isinstance(item, str):
            if item.strip():
                result.append({"title": item.strip(), "level": level})
    return result


def _parse_line_level_title(line: str) -> tuple[int | None, str | None]:
    """解析单行的层级和标题。

    Returns:
        (level, title) 或 (None, None)
    """
    import re

    # 一级：一、二、三、四、五、六、七、八、九、十
    match = re.match(r"^[一二三四五六七八九十百]+、\s*(.+)$", line)
    if match:
        return (1, match.group(1))

    # 二级：（一）（二）（三）
    match = re.match(r"^（[一二三四五六七八九十]+）\s*(.+)$", line)
    if match:
        return (2, match.group(1))

    # 三级：1、2、3、
    match = re.match(r"^(\d+)、\s*(.+)$", line)
    if match:
        return (3, match.group(2))

    # 四级：1.1、1.2、
    match = re.match(r"^(\d+\.\d+)\s*(.+)$", line)
    if match:
        return (4, match.group(2))

    # 五级：（1）（2）
    match = re.match(r"^（(\d+)）\s*(.+)$", line)
    if match:
        return (5, match.group(2))

    # 其他编号格式：第X章、第X节
    match = re.match(r"^第[一二三四五六七八九十\d]+[章节]\s*(.+)$", line)
    if match:
        return (1, match.group(1))

    # 纯数字编号：1. 2. 3.
    match = re.match(r"^(\d+)\.\s*(.+)$", line)
    if match:
        return (2, match.group(2))

    return (None, None)


@shared_task(bind=True)
def generate_content_matrix_task(self, outline_id: int, task_id: int):
    """矩阵生成 Celery 任务。

    Args:
        outline_id: 大纲ID
        task_id: GenerationTask ID
    """
    from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus
    from apps.outline.models import GenerationTask, Outline, Section
    from apps.outline.services.matrix_service import MatrixService

    matrix_service = MatrixService()
    task = GenerationTask.objects.get(pk=task_id)
    outline = Outline.objects.get(pk=outline_id)

    # 获取任务参数
    params = task.params or {}
    section_ids = params.get("section_ids")
    force_overwrite = params.get("force_overwrite", False)

    lock_acquired = False
    original_statuses = {}

    try:
        # 获取锁
        if not matrix_service.acquire_matrix_generation_lock(outline_id):
            task.status = GenerationTaskStatus.FAILED
            task.error_message = "无法获取任务锁，可能有其他任务正在执行"
            task.finished_at = timezone.now()
            task.save()
            return

        lock_acquired = True

        # 更新任务状态
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 获取目标章节
        targets = matrix_service.get_matrix_generation_targets(
            outline_id=outline_id,
            force_overwrite=force_overwrite,
            section_ids=section_ids,
        )

        if not targets:
            task.status = GenerationTaskStatus.SUCCESS
            task.error_message = "没有需要生成矩阵的章节"
            task.finished_at = timezone.now()
            task.save()
            return

        task.total_count = len(targets)
        task.save()

        # 保存原状态快照
        original_statuses = {
            s.id: {
                "status": s.content_matrix_status,
                "matrix": s.content_matrix.copy() if s.content_matrix else {},
            }
            for s in targets
        }

        # 更新章节状态为 generating
        target_ids = [s.id for s in targets]
        Section.objects.filter(id__in=target_ids).update(
            content_matrix_status=ContentMatrixStatus.GENERATING,
            content_matrix_error="",
        )

        # 构建大纲结构
        outline_structure = matrix_service.build_outline_structure(outline)

        # 获取招标要求摘要（如果有）
        requirements_summary = ""
        if outline.source_tender_file_id:
            from apps.requirements.models import TenderRequirement

            requirements = TenderRequirement.objects.filter(
                tender_file_id=outline.source_tender_file_id
            )[:20]
            if requirements:
                requirements_summary = "\n".join(
                    f"- [{r.requirement_no}] {r.title}: {r.content[:200] if r.content else ''}"
                    for r in requirements
                )

        # 调用 AI 生成矩阵
        variables = {
            "project_name": outline.project.name,
            "lot_name": outline.lot.name,
            "outline_structure": outline_structure,
            "requirements_summary": requirements_summary,
        }

        prompt_run = AiTaskExecutionService().execute(
            scenario="content_matrix_generation",
            variables=variables,
            created_by=task.created_by,
        )

        if prompt_run.status != "succeeded":
            raise Exception(prompt_run.error_message or "AI 生成矩阵失败")

        # 解析 AI 输出
        output_text = prompt_run.output_text or ""
        output_json = prompt_run.output_json or {}

        # 如果 output_json 没有 sections，尝试从 output_text 解析
        if not output_json.get("sections"):
            import re

            json_match = re.search(r"\{[\s\S]*\}", output_text)
            if json_match:
                output_json = json.loads(json_match.group())

        # 校验输出
        validated_data, warnings = matrix_service.validate_matrix_output(
            output_json, outline_id
        )

        # 记录警告
        if warnings:
            logger.warning(f"Matrix generation warnings for outline {outline_id}: {warnings}")

        # 处理每个章节
        success_count = 0
        failed_count = 0
        returned_section_ids = set()

        for section_data in validated_data.get("sections", []):
            section_id = section_data.get("section_id")
            returned_section_ids.add(section_id)

            try:
                section = Section.objects.get(pk=section_id)

                # 补全章节引用信息（ID 数组转对象数组）
                enriched_data = matrix_service.enrich_section_references(
                    section_data, outline_id
                )

                # 写入矩阵
                matrix_service.update_section_matrix(section, enriched_data)
                success_count += 1

            except Exception as e:
                logger.exception(f"Failed to update matrix for section {section_id}")
                Section.objects.filter(pk=section_id).update(
                    content_matrix_status=ContentMatrixStatus.FAILED,
                    content_matrix_error=str(e)[:500],
                )
                failed_count += 1

        # 标记缺失章节为失败
        missing_ids = set(target_ids) - returned_section_ids
        if missing_ids:
            Section.objects.filter(id__in=missing_ids).update(
                content_matrix_status=ContentMatrixStatus.FAILED,
                content_matrix_error="AI 未返回此章节的矩阵",
            )
            failed_count += len(missing_ids)

        # 更新任务状态
        task.success_count = success_count
        task.failed_count = failed_count
        task.status = (
            GenerationTaskStatus.SUCCESS
            if failed_count == 0
            else (
                GenerationTaskStatus.FAILED
                if success_count == 0
                else GenerationTaskStatus.PARTIAL_SUCCESS
            )
        )
        task.result = {
            "warnings": warnings,
            "missing_ids": list(missing_ids),
        }
        task.finished_at = timezone.now()
        task.save()

    except Exception as e:
        logger.exception(f"Matrix generation failed: outline_id={outline_id}")

        # 恢复原状态
        for section_id, original in original_statuses.items():
            Section.objects.filter(pk=section_id).update(
                content_matrix_status=original["status"],
                content_matrix=original["matrix"],
            )

        task.status = GenerationTaskStatus.FAILED
        task.error_message = str(e)[:2000]
        task.finished_at = timezone.now()
        task.save()

    finally:
        if lock_acquired:
            matrix_service.release_matrix_generation_lock(outline_id)