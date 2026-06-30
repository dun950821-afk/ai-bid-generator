# backend/apps/outline/services/image_generation_service.py
"""AI 生图服务（P3 正文增强）。

批量扫描 content_plan.image.needed=true 章节统一处理。
- 配置了 IMAGE_GEN_MODEL：调 LLMService.generate_image 生图存 MinIO + 嵌入正文
- 未配置：只生成 image_prompt 存字段统一提示手动生图
"""
import logging
from typing import Optional

from django.conf import settings
from django.db.models import Max

from apps.common.services.storage import StorageService
from apps.generation.constants import ModelType
from apps.outline.constants import SectionVersionSource
from apps.outline.models import Section, SectionVersion

logger = logging.getLogger(__name__)


class ImageGenerationService:
    """AI 生图服务。"""

    def __init__(self):
        self.storage = StorageService()
        self.image_model = getattr(settings, "IMAGE_GEN_MODEL", "")

    def run_generation(self, outline_id: int, user, async_task=None) -> dict:
        """批量扫描 image.needed=true 章节统一处理。

        Returns:
            {"total": N, "success": M, "prompt_only": K, "failed": L, "details": [...]}
        """
        sections = self._collect_target_sections(outline_id)
        if not sections:
            return {"total": 0, "success": 0, "prompt_only": 0, "failed": 0, "details": []}

        total = len(sections)
        success = 0
        prompt_only = 0
        failed = 0
        details = []

        for idx, section in enumerate(sections, start=1):
            try:
                result = self._generate_for_section(section, user)
                if result.get("success"):
                    success += 1
                elif result.get("prompt_only"):
                    prompt_only += 1
                else:
                    failed += 1
                details.append({
                    "section_id": section.id,
                    "title": section.title,
                    "success": result.get("success"),
                    "prompt_only": result.get("prompt_only"),
                    "reason": result.get("reason", ""),
                })
            except Exception as e:
                failed += 1
                logger.warning(f"image_generation section {section.id} exception: {e}")
                details.append({
                    "section_id": section.id,
                    "title": section.title,
                    "success": False,
                    "prompt_only": False,
                    "reason": str(e),
                })

            if async_task:
                async_task.progress = min(95, 10 + int(idx / total * 85))
                async_task.current_step = f"AI 生图 {idx}/{total}"
                async_task.save(update_fields=["progress", "current_step"])

        if async_task:
            async_task.progress = 100
            async_task.current_step = "完成"
            async_task.save(update_fields=["progress", "current_step"])

        return {
            "total": total,
            "success": success,
            "prompt_only": prompt_only,
            "failed": failed,
            "details": details,
        }

    def _collect_target_sections(self, outline_id: int) -> list:
        """收集需要 AI 生图的章节。"""
        sections = Section.objects.filter(outline_id=outline_id).order_by("sort_order")
        targets = []
        for s in sections:
            plan = s.content_plan or {}
            image_plan = plan.get("image") or {}
            if image_plan.get("needed") is True and not s.image_object_key:
                targets.append(s)
        return targets

    def _generate_for_section(self, section: Section, user) -> dict:
        """单章：调 AI 生成 image_prompt → 若配置模型则生图存 MinIO+嵌入，否则只存 prompt。"""
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
        from apps.generation.services.llm_service import LLMService

        ai_service = AiTaskExecutionService()
        write_scope = self._get_write_scope(section)
        chapter_summary = section.content_summary or ""

        variables = {
            "chapter_title": section.title,
            "write_scope": write_scope,
            "chapter_summary": chapter_summary,
            "image_purpose": "投标技术方案配图",
        }

        prompt_run = ai_service.execute(
            scenario="image_generation",
            variables=variables,
            created_by=user,
            business_context={"project_id": section.outline.project_id},
        )

        if prompt_run.status != "succeeded":
            return {"success": False, "prompt_only": False, "reason": f"AI 失败：{prompt_run.error_message}"}

        data = prompt_run.output_json or {}
        image_prompt = (data.get("image_prompt") or "").strip()
        if not image_prompt:
            return {"success": False, "prompt_only": False, "reason": "AI 返回 image_prompt 为空"}

        # 存 image_prompt
        section.image_prompt = image_prompt
        section.save(update_fields=["image_prompt", "updated_at"])

        # 未配置生图模型：只存 prompt
        if not self.image_model:
            return {"success": False, "prompt_only": True, "reason": "未配置生图模型（IMAGE_GEN_MODEL）"}

        # 配置了模型：生图
        image_bytes = self._call_image_model(
            LLMService(),
            image_prompt,
            data.get("negative_prompt", ""),
        )
        if not image_bytes:
            return {"success": False, "prompt_only": True, "reason": "生图模型调用失败，仅存 prompt"}

        object_key = f"images/{section.outline_id}/{section.id}.png"
        self.storage.put_object(object_key, image_bytes, content_type="image/png")

        section.image_object_key = object_key
        # 正文插入 ![章节标题](图片URL)
        # 这里存对象键，URL 由前端通过 /minio/{bucket}/{key} 解析
        image_md = f"![{section.title}](/minio/bid-files/{object_key})"
        if image_md not in (section.content or ""):
            new_content = (section.content or "").rstrip() + "\n\n" + image_md
            section.content = new_content
            new_word_count = self._count_words(new_content)
            section.content_word_count = new_word_count
            section.word_count = new_word_count

            max_version = (
                SectionVersion.objects.filter(section=section)
                .aggregate(max_version=Max("version_no"))["max_version"]
                or 0
            )
            SectionVersion.objects.create(
                section=section,
                content=new_content,
                version_no=max_version + 1,
                source=SectionVersionSource.AI,
                word_count=new_word_count,
                created_by=user,
            )

        section.save(update_fields=["image_object_key", "content", "content_word_count", "word_count", "updated_at"])

        return {"success": True, "object_key": object_key}

    def _call_image_model(self, llm_service, prompt: str, negative_prompt: str) -> Optional[bytes]:
        """调生图模型，返回图片 bytes。失败返回 None。"""
        from apps.generation.models import ModelConfig

        # 优先按 model_name 精确匹配，其次按 model_type=image
        model_config = (
            ModelConfig.objects.filter(
                model_name=self.image_model,
                is_active=True,
            ).first()
        )
        if not model_config:
            logger.warning(f"Image gen model '{self.image_model}' not found in ModelConfig")
            return None

        return llm_service.generate_image(
            model_config=model_config,
            prompt=prompt,
            negative_prompt=negative_prompt,
        )

    def _get_write_scope(self, section: Section) -> str:
        if section.content_matrix:
            return section.content_matrix.get("write_scope", "") or ""
        return ""

    def _count_words(self, text: str) -> int:
        import re
        if not text:
            return 0
        clean = re.sub(r"[#*`\-|>]", "", text)
        clean = re.sub(r"\s+", "", clean)
        return len(clean)
