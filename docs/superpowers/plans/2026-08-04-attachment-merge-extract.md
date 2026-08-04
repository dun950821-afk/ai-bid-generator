# 附件合并解析 + 单项提取 + scoring/technical 优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持主文件 + 附件合并解析（条款抽取/大纲生成统一受益）、scoring 上下文优化（表格碎片优先收录 + 排序兜底）、前端单场景提取，提升 scoring/technical 提取质量。

**Architecture:** 解析层做多文件合并（主文件 + 附件各自解析 → 合并 markdown → 页码偏移 → 写主文件 ParsedDocument 新版本 + document_text → 重新分块并标注 source_file）。scoring 场景上下文优先完整收录评分表碎片 chunk，page_start=None 的 chunk 按 id 排序兜底。前端工具栏场景复选框 + 侧栏单提按钮。

**Tech Stack:** Django 5 / DRF / Celery / PostgreSQL / MinIO / Vue 3 + Element Plus

## Global Constraints

- 测试运行：`cd backend && source .venv/bin/activate && python -m pytest <path> --tb=short -q`
- 测试 fixture 用现有的 `tender_file` / `project` / `bid_manager_user`（`apps/tender/tests/conftest.py`）；`ProjectMember.project_role` 必须用 ProjectRole 实例
- 测试环境 `PARSER_ENGINE=mock`（`conftest.py` 已有配置），MinIO 读取用 `unittest.mock.patch` 打桩
- **不改**：4 场景（强制/资格/商务/递交）提示词与上下文逻辑、3.1 输出结构、TenderFile 状态机（仅新增 `chunking` 常量）、AsyncTask 机制、celery 任务名 `apps.tender.parse_tender_file` / `apps.tender.chunk_parsed_document` / `apps.requirements.extract_requirements_v2`
- **不改**：`_build_chunk_context` 的 block 格式与截断提示语义、`requirement_key` 去重机制、PipelineJob 机制（合并解析不建 PipelineJob）
- 合并解析**不自动触发**条款抽取/大纲生成（由用户操作）
- 提示词 3.2 只创建 DRAFT，**不自动发布**（用户 Playground 验证后经前端发布）
- 合并全文写入主文件 `document_text_object_key`（`parsed/{id}/document_text.txt`），条款抽取零改动读到合并全文
- 页码偏移只替换**独立行**页码模式 `(?m)^\s*(P?\d+/\d+|\d+/\d+|P\d+|第\d+页)\s*$`，不误伤正文
- 附件分隔标题格式：`# 文件：{original_name}（附件）`（H1，成为 SECTION，section_path=`文件：xxx（附件）`）
- 权限：merge-parse API 用 `tender.manage`（GLOBAL）+ `required_scope = "global"`
- 部署：`npm run build` → `docker compose build web worker beat` → `up -d` → `docker exec ai-bid-generator-web-1 python manage.py migrate` → `docker compose restart nginx` → curl 登录验证
- 前端无测试框架，前端任务验证方式 = `npm run build` + 浏览器手动验证（golden path + 边界）

---

### Task 1: TenderChunk.source_file 迁移 + STATUS_CHUNKING 常量

**Files:**
- Modify: `backend/apps/tender/models/tender_chunk.py`（加字段）
- Modify: `backend/apps/tender/models/tender_file.py`（加 STATUS_CHUNKING 常量）
- Create: `backend/apps/tender/migrations/0008_tenderchunk_source_file.py`（makemigrations 生成）
- Test: `backend/apps/tender/tests/test_tender_chunk.py`（追加用例）

**Interfaces:**
- Produces: `TenderChunk.source_file`（FK `tender.TenderFile`，null=True，related_name="source_chunks"）；`TenderFile.STATUS_CHUNKING = "chunking"`（并入 STATUS_CHOICES）
- Consumes: 后续 Task 2/3 用 `chunk.source_file_id` 标注来源

- [ ] **Step 1: 写失败测试**

追加到 `test_tender_chunk.py`：

```python
@pytest.mark.django_db
class TestChunkSourceFile:
    def test_source_file_assignable(self, tender_file, parsed_document):
        chunk = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content="评分标准片段",
            content_hash="h-source-1",
            source_file=tender_file,
        )
        assert chunk.source_file_id == tender_file.id

    def test_source_file_default_null(self, parsed_document):
        chunk = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content="正文",
            content_hash="h-source-2",
        )
        assert chunk.source_file_id is None
```

- [ ] **Step 2: 运行验证失败**

Run: `python -m pytest apps/tender/tests/test_tender_chunk.py::TestChunkSourceFile -q`
Expected: FAIL（`TypeError: source_file` 未知字段）

- [ ] **Step 3: 实现**

`tender_chunk.py` 在 `parent_chunk` 字段后加：

```python
    source_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="source_chunks",
        verbose_name="来源文件",
        help_text="合并解析时标注 chunk 来源文件；None 表示主文件",
    )
```

`tender_file.py` 在 `STATUS_CHUNKED` 前加：

```python
    STATUS_CHUNKING = "chunking"
```

并在 `STATUS_CHOICES` 加 `(STATUS_CHUNKING, "合并解析中")`（choices 变更无需迁移）。

生成迁移：

```bash
cd backend && source .venv/bin/activate && python manage.py makemigrations tender
```

- [ ] **Step 4: 运行验证通过**

Run: `python -m pytest apps/tender/tests/test_tender_chunk.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tender/models/tender_chunk.py backend/apps/tender/models/tender_file.py backend/apps/tender/migrations/0008_tenderchunk_source_file.py backend/apps/tender/tests/test_tender_chunk.py
git commit -m "feat(merge): TenderChunk.source_file 字段 + chunking 状态常量"
```

---

### Task 2: MergeParseService（合并文本 / 页码偏移 / document_text / 版本机制）

**Files:**
- Create: `backend/apps/tender/services/merge_parse_service.py`
- Create: `backend/apps/tender/tests/test_merge_parse_service.py`

**Interfaces:**
- Produces: `MergeParseService.merge(main_file: TenderFile, attachments: list[TenderFile]) -> tuple[ParsedDocument, dict[str, TenderFile]]`
  - 返回 `(merged_doc, source_file_map)`；`source_file_map` 键为附件 section_path（`文件：{original_name}（附件）`），值为 TenderFile
  - 模块级：`PAGE_LINE_PATTERN`（见 Global Constraints）、`_offset_page_lines(text: str, offset: int) -> str`
- Consumes: `ParseService.parse`、`StorageService`、`DocumentTextService.get_document_text`；Task 4 消费 `merge()`；Task 3 消费 `source_file_map`

- [ ] **Step 1: 写失败测试**

`test_merge_parse_service.py`：

```python
"""MergeParseService 测试。"""

from unittest.mock import patch

import pytest

from apps.tender.models import ParsedDocument, TenderFile
from apps.tender.services.merge_parse_service import (
    MergeParseService,
    _offset_page_lines,
)


@pytest.mark.django_db
class TestPageOffset:
    def test_offset_standalone_page_lines(self):
        text = "第5页\n\n正文内容\n\nP3\n\n10/32\n\n5/32 出现在正文不处理"
        out = _offset_page_lines(text, 32)
        assert "第37页" in out
        assert "P35" in out
        assert "42/64" in out
        assert "5/32 出现在正文不处理" in out  # 非独立行不替换

    def test_offset_zero_no_change(self):
        assert _offset_page_lines("第5页", 0) == "第5页"


@pytest.mark.django_db
class TestMerge:
    def _make_file(self, project, user, name, status=TenderFile.STATUS_PARSED):
        return TenderFile.objects.create(
            project=project, original_name=name, file_size=1024,
            content_type="application/pdf", object_key=f"tender/{name}",
            status=status, created_by=user,
        )

    def test_merge_concatenates_with_separators(self, project, bid_manager_user):
        main = self._make_file(project, bid_manager_user, "main.pdf")
        att = self._make_file(project, bid_manager_user, "tech.pdf")

        docs = {}

        def fake_parse(tf):
            doc = ParsedDocument(
                tender_file=tf, is_active=True,
                markdown_uri=f"parsed/{tf.id}/document.md",
                page_count=10 if tf == main else 5,
                parse_engine="mock", parser_version="mock-v1",
                parse_quality="high", input_hash=f"in-{tf.id}", output_hash=f"out-{tf.id}",
            )
            doc.id = tf.id  # 复用 id 方便打桩
            docs[tf] = doc
            return doc

        def fake_get_object(key):
            if "document.md" in key:
                return f"# 第一章\n主文件内容\n第3页".encode()
            return "".encode()

        with patch("apps.tender.services.parse_service.ParseService.parse", side_effect=fake_parse):
            with patch("apps.common.services.storage.StorageService") as StorageMock:
                storage = StorageMock.return_value
                storage.get_object.side_effect = fake_get_object
                storage.put_object.return_value = None

                merged_doc, source_map = MergeParseService().merge(main, [att])

        assert merged_doc.tender_file == main
        assert merged_doc.page_count == 15
        assert source_map == {"文件：tech.pdf（附件）": att}
        # 合并全文包含分隔标题
        merged_markdown = storage.put_object.call_args_list[0].args[0]
        assert "# 文件：tech.pdf（附件）" in merged_markdown
        # 附件页码偏移：第3页 → 第13页（主文件 10 页）
        assert "第13页" in merged_markdown
        # 主文件在前、附件在后
        assert merged_markdown.index("# 第一章") < merged_markdown.index("# 文件：tech.pdf（附件）")

    def test_merge_writes_document_text(self, project, bid_manager_user):
        main = self._make_file(project, bid_manager_user, "main.pdf")
        att = self._make_file(project, bid_manager_user, "tech.pdf")

        with patch("apps.tender.services.parse_service.ParseService.parse",
                   side_effect=lambda tf: ParsedDocument(
                       tender_file=tf, is_active=True,
                       markdown_uri=f"parsed/{tf.id}/document.md",
                       page_count=10, parse_engine="mock", parser_version="mock-v1",
                       parse_quality="high", input_hash=f"in-{tf.id}", output_hash=f"out-{tf.id}",
                   )):
            with patch("apps.common.services.storage.StorageService") as StorageMock:
                storage = StorageMock.return_value
                storage.get_object.return_value = b"正文内容\n第3页"
                with patch("apps.requirements.services.document_text_service.DocumentTextService.get_document_text",
                           side_effect=lambda tf: f"全文{tf.id}\n第3页"):
                    MergeParseService().merge(main, [att])

        main.refresh_from_db()
        assert main.document_text_object_key == f"parsed/{main.id}/document_text.txt"
        assert main.document_text_hash
        text = storage.put_object.call_args_list[0].args[0].decode()
        assert "文件：tech.pdf（附件）" in text

    def test_remerge_creates_new_version(self, project, bid_manager_user):
        main = self._make_file(project, bid_manager_user, "main.pdf")

        with patch("apps.tender.services.parse_service.ParseService.parse",
                   side_effect=lambda tf: ParsedDocument(
                       tender_file=tf, is_active=True,
                       markdown_uri=f"parsed/{tf.id}/document.md",
                       page_count=10, parse_engine="mock", parser_version="mock-v1",
                       parse_quality="high", input_hash=f"in-{tf.id}", output_hash=f"out-{tf.id}",
                   )):
            with patch("apps.common.services.storage.StorageService") as StorageMock:
                storage = StorageMock.return_value
                storage.get_object.return_value = b"x"
                MergeParseService().merge(main, [])
                MergeParseService().merge(main, [])

        assert ParsedDocument.objects.filter(tender_file=main).count() == 2
        active = ParsedDocument.objects.filter(tender_file=main, is_active=True)
        assert active.count() == 1
```

- [ ] **Step 2: 运行验证失败**

Run: `python -m pytest apps/tender/tests/test_merge_parse_service.py -q`
Expected: FAIL（ModuleNotFoundError: merge_parse_service）

- [ ] **Step 3: 实现**

`merge_parse_service.py`：

```python
"""多文件合并解析服务。

把主文件 + 附件各自解析后的 markdown 合并为统一文档：
- 主文件在前，附件按传入顺序，附件前插入 `# 文件：{name}（附件）` H1 分隔
- 附件正文页码整体 + 主文件累计 page_count（只替换独立行页码，避免误伤正文）
- 合并全文写入主文件 ParsedDocument 新版本（历史版本保留）与 document_text
"""

import logging
import re
from hashlib import sha256

from django.db import transaction

from apps.common.services.storage import StorageService
from apps.tender.constants import PARSER_VERSION, ParseQuality
from apps.tender.models import ParsedDocument, TenderFile
from apps.tender.services.parse_service import ParseService

logger = logging.getLogger(__name__)

# 独立行页码模式：第5页 / P5 / P5/32 / 10/32（非独立行不替换）
PAGE_LINE_PATTERN = re.compile(r"(?m)^\s*(P?\d+/\d+|\d+/\d+|P\d+|第\d+页)\s*$")


def _offset_page_lines(text: str, offset: int) -> str:
    """把独立行页码整体 +offset。"""
    if offset <= 0:
        return text

    def _replace(match):
        token = match.group(1)
        if "/" in token:
            num, total = token.split("/")
            return f"{int(num) + offset}/{int(total) + offset}"
        m = re.match(r"^P(\d+)$", token)
        if m:
            return f"P{int(m.group(1)) + offset}"
        m = re.match(r"^第(\d+)页$", token)
        if m:
            return f"第{int(m.group(1)) + offset}页"
        return token

    return PAGE_LINE_PATTERN.sub(_replace, text)


class MergeParseService:
    """合并解析服务。"""

    def merge(self, main_file: TenderFile, attachments: list[TenderFile]) -> tuple[ParsedDocument, dict[str, TenderFile]]:
        """合并解析主文件 + 附件。

        Returns:
            (merged_doc, source_file_map)：merged_doc 为主文件新版本 ParsedDocument；
            source_file_map 键为附件 section_path，值为附件 TenderFile。
        """
        storage = StorageService()
        parse_service = ParseService()

        # 1. 逐个解析（附件解析产物保留，独立查看）
        main_doc = parse_service.parse(main_file)
        attachment_docs = [parse_service.parse(a) for a in attachments]

        # 2. 合并 markdown（主文件在前，附件按顺序，页码偏移）
        main_markdown = storage.get_object(main_doc.markdown_uri).decode("utf-8")
        parts = [main_markdown]
        cumulative_pages = main_doc.page_count or 0
        source_file_map: dict[str, TenderFile] = {}
        for attachment, doc in zip(attachments, attachment_docs):
            markdown = storage.get_object(doc.markdown_uri).decode("utf-8")
            markdown = _offset_page_lines(markdown, cumulative_pages)
            section_path = f"文件：{attachment.original_name}（附件）"
            parts.append(f"# {section_path}\n\n{markdown}")
            source_file_map[section_path] = attachment
            cumulative_pages += doc.page_count or 0
        merged_markdown = "\n\n".join(parts)

        # 3. 上传合并全文
        merged_uri = f"parsed/{main_file.id}/document.md"
        storage.put_object(merged_uri, merged_markdown.encode("utf-8"), "text/markdown")
        total_pages = main_doc.page_count + sum(doc.page_count or 0 for doc in attachment_docs)
        input_hash = sha256(merged_markdown.encode("utf-8")).hexdigest()

        # 4. 写 document_text（条款抽取零改动读合并全文）
        from apps.requirements.services.document_text_service import DocumentTextService
        text_service = DocumentTextService()
        main_text = text_service.get_document_text(main_file)
        text_parts = [main_text]
        cumulative_pages = main_doc.page_count or 0
        for attachment in attachments:
            att_text = text_service.get_document_text(attachment)
            text_parts.append(
                f"# 文件：{attachment.original_name}（附件）\n\n{_offset_page_lines(att_text, cumulative_pages)}"
            )
            cumulative_pages += attachment_docs[attachments.index(attachment)].page_count or 0
        merged_text = "\n\n".join(text_parts)
        text_key = f"parsed/{main_file.id}/document_text.txt"
        storage.put_object(text_key, merged_text.encode("utf-8"), "text/plain; charset=utf-8")
        main_file.document_text_object_key = text_key
        main_file.document_text_hash = sha256(merged_text.encode("utf-8")).hexdigest()
        main_file.save(update_fields=["document_text_object_key", "document_text_hash", "updated_at"])

        # 5. 主文件 ParsedDocument 新版本（复用现有版本机制，历史保留）
        with transaction.atomic():
            ParsedDocument.objects.filter(tender_file=main_file).update(is_active=False)
            merged_doc, _ = ParsedDocument.objects.update_or_create(
                tender_file=main_file,
                parser_version=PARSER_VERSION,
                input_hash=input_hash,
                defaults={
                    "is_active": True,
                    "markdown_uri": merged_uri,
                    "page_count": total_pages,
                    "parse_engine": "merge",
                    "parse_quality": ParseQuality.HIGH,
                    "quality_metrics": {
                        "merged_files": [main_file.original_name] + [a.original_name for a in attachments],
                        "parse_engine": "merge",
                        "parse_quality": ParseQuality.HIGH,
                    },
                    "output_hash": input_hash,
                },
            )

        logger.info(
            "Merged tender_file=%s attachments=%s chars=%d",
            main_file.id, [a.id for a in attachments], len(merged_markdown),
        )
        return merged_doc, source_file_map
```

- [ ] **Step 4: 运行验证通过**

Run: `python -m pytest apps/tender/tests/test_merge_parse_service.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tender/services/merge_parse_service.py backend/apps/tender/tests/test_merge_parse_service.py
git commit -m "feat(merge): MergeParseService 合并解析（页码偏移 + document_text + 版本机制）"
```

---

### Task 3: ChunkService 支持 source_file 标注

**Files:**
- Modify: `backend/apps/tender/services/chunk_service.py`
- Test: `backend/apps/tender/tests/test_chunk_service.py`（追加用例）

**Interfaces:**
- Consumes: Task 2 的 `source_file_map`（`dict[section_path, TenderFile]`）
- Produces: `ChunkService.chunk(parsed_doc, source_file_map: dict[str, TenderFile] | None = None) -> list[TenderChunk]`；clause/window 从 section 继承 `source_file`

- [ ] **Step 1: 写失败测试**

追加到 `test_chunk_service.py`：

```python
@pytest.mark.django_db
class TestChunkSourceFile:
    def test_source_file_inherited_to_clause_and_window(self, project, bid_manager_user, parsed_document):
        from apps.tender.models import TenderFile
        att = TenderFile.objects.create(
            project=project, original_name="tech.pdf", file_size=1024,
            content_type="application/pdf", object_key="tender/tech.pdf",
            status=TenderFile.STATUS_PARSED, created_by=bid_manager_user,
        )
        markdown = (
            "# 文件：tech.pdf（附件）\n\n"
            "技术规范书内容\n\n"
            "1.1 技术要求\n" + "长内容" * 400 + "\n"  # 触发 window 分块
        )
        with patch.object(ChunkService, "_load_markdown", return_value=markdown):
            chunks = ChunkService().chunk(
                parsed_document,
                source_file_map={"文件：tech.pdf（附件）": att},
            )

        section = next(c for c in chunks if c.chunk_level == ChunkLevel.SECTION)
        assert section.source_file_id == att.id
        clauses = [c for c in chunks if c.chunk_level == ChunkLevel.CLAUSE]
        assert clauses and all(c.source_file_id == att.id for c in clauses)
        windows = [c for c in chunks if c.chunk_level == ChunkLevel.WINDOW]
        assert windows and all(w.source_file_id == att.id for w in windows)

    def test_no_map_source_file_null(self, parsed_document):
        markdown = "# 第一章\n\n正文内容"
        with patch.object(ChunkService, "_load_markdown", return_value=markdown):
            chunks = ChunkService().chunk(parsed_document)
        assert all(c.source_file_id is None for c in chunks)
```

- [ ] **Step 2: 运行验证失败**

Run: `python -m pytest apps/tender/tests/test_chunk_service.py -q`
Expected: FAIL（`chunk()` 不认 `source_file_map` 参数）

- [ ] **Step 3: 实现**

`chunk_service.py`：

```python
    def chunk(self, parsed_doc, source_file_map: dict | None = None) -> List[TenderChunk]:
        """对解析文档进行语义分块。

        Args:
            parsed_doc: ParsedDocument 实例
            source_file_map: {section_path: TenderFile}，合并解析时标注 chunk 来源文件；
                section 之下 clause/window 自动继承
        """
        markdown = self._load_markdown(parsed_doc.markdown_uri)

        # 一级：章节分块
        section_chunks = self._split_sections(markdown, parsed_doc)
        if source_file_map:
            for section in section_chunks:
                section.source_file = source_file_map.get(section.section_path)
```

`_split_sections` 中创建 section 后（`chunks.append(chunk)` 前）**无需**改动 —— source_file 在 `chunk()` 入口统一设置（见上）。但 clause 继承需要从 section 读取，`_split_clauses` 开头加：

```python
        for clause in clauses:
            clause.source_file = section_chunk.source_file
```

（放在 `clause.parent_chunk = ...` 同一循环里即可。）

`_split_windows` 加：

```python
                window.source_file = chunk.source_file
```

`_create_chunk` 加参数并赋值：

```python
        source_file=None,
    ) -> TenderChunk:
        chunk = TenderChunk(
            parsed_document=parsed_doc,
            ...
            source_file=source_file,
        )
```

- [ ] **Step 4: 运行验证通过**

Run: `python -m pytest apps/tender/tests/test_chunk_service.py -q`
Expected: PASS（含原有用例回归）

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tender/services/chunk_service.py backend/apps/tender/tests/test_chunk_service.py
git commit -m "feat(merge): ChunkService 按 section 标注 source_file 并向下继承"
```

---

### Task 4: merge_parse_files Celery 任务

**Files:**
- Modify: `backend/apps/tender/tasks.py`
- Create: `backend/apps/tender/tests/test_merge_parse_files.py`

**Interfaces:**
- Consumes: Task 2 `MergeParseService.merge`、Task 3 `ChunkService.chunk`、`soft_get_async_task`
- Produces: `@app.task(name="apps.tender.merge_parse_files", bind=True, soft_time_limit=1200, time_limit=1500) def merge_parse_files(self, task_id: int, tender_file_id: int, attachment_file_ids: list[int]) -> None`
  - 进度：5 开始 → 50 合并完成 → 90 分块完成 → 100 完成
  - 状态：主文件 `chunking` → `chunked`；附件 `parsed`；失败主文件 → `parse_failed` + task FAILED
  - **不触发**条款抽取/大纲

- [ ] **Step 1: 写失败测试**

`test_merge_parse_files.py`：

```python
"""merge_parse_files 任务测试。"""

from unittest.mock import patch

import pytest

from apps.common.models import AsyncTask
from apps.tender.constants import ParserVersion
from apps.tender.models import TenderFile
from apps.tender.tasks import merge_parse_files


@pytest.mark.django_db
def test_merge_parse_files_success(tender_file, project, bid_manager_user, parsed_document):
    att = TenderFile.objects.create(
        project=project, original_name="tech.pdf", file_size=1024,
        content_type="application/pdf", object_key="tender/tech.pdf",
        status=TenderFile.STATUS_PARSE_PENDING, created_by=bid_manager_user,
    )
    task = AsyncTask.objects.create(
        task_type="tender_merge_parse", status=AsyncTask.STATUS_PENDING,
        related_object_type="TenderFile", related_object_id=str(tender_file.id),
        created_by=bid_manager_user,
    )

    with patch("apps.tender.tasks.MergeParseService.merge",
               return_value=(parsed_document, {"文件：tech.pdf（附件）": att})):
        with patch("apps.tender.tasks.ChunkService") as ChunkMock:
            chunk_service = ChunkMock.return_value
            chunk_service.chunk.return_value = []
            merge_parse_files(task.id, tender_file.id, [att.id])

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_SUCCEEDED
    assert task.progress == 100
    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_CHUNKED
    att.refresh_from_db()
    assert att.status == TenderFile.STATUS_PARSED
    chunk_service.chunk.assert_called_once()
    # 不触发条款抽取：无 requirement_extraction_v2 相关副作用（任务内部不调用 extract）
    from apps.requirements.models import RequirementExtractionRun
    assert not RequirementExtractionRun.objects.filter(tender_file=tender_file).exists()


@pytest.mark.django_db
def test_merge_parse_files_failure_sets_parse_failed(tender_file, project, bid_manager_user):
    task = AsyncTask.objects.create(
        task_type="tender_merge_parse", status=AsyncTask.STATUS_PENDING,
        related_object_type="TenderFile", related_object_id=str(tender_file.id),
        created_by=bid_manager_user,
    )
    with patch("apps.tender.tasks.MergeParseService.merge",
               side_effect=RuntimeError("boom")):
        with pytest.raises(RuntimeError):
            merge_parse_files(task.id, tender_file.id, [])

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    assert "boom" in task.error_message
    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_PARSE_FAILED
```

- [ ] **Step 2: 运行验证失败**

Run: `python -m pytest apps/tender/tests/test_merge_parse_files.py -q`
Expected: FAIL（`ImportError: cannot import name 'merge_parse_files'`）

- [ ] **Step 3: 实现**

`tasks.py` 在 `chunk_parsed_document` 后追加（imports 加 `MergeParseService`）：

```python
@app.task(name="apps.tender.merge_parse_files", bind=True, soft_time_limit=1200, time_limit=1500)
def merge_parse_files(self, task_id: int, tender_file_id: int, attachment_file_ids: list[int]):
    """合并解析：主文件 + 附件合并为统一文档并重新分块。"""
    from apps.tender.services.merge_parse_service import MergeParseService

    task = soft_get_async_task(task_id)
    if task is None:
        return
    tender_file = TenderFile.objects.get(pk=tender_file_id)
    attachments = list(TenderFile.objects.filter(pk__in=attachment_file_ids))

    try:
        task.status = AsyncTask.STATUS_RUNNING
        task.progress = 5
        task.current_step = "合并解析：开始"
        task.started_at = timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "started_at"])

        tender_file.status = TenderFile.STATUS_CHUNKING
        tender_file.save(update_fields=["status", "updated_at"])

        # 逐个解析 + 合并
        merged_doc, source_file_map = MergeParseService().merge(tender_file, attachments)

        task.progress = 50
        task.current_step = "合并解析：完成，重新分块"
        task.save(update_fields=["progress", "current_step"])

        # 重新分块（合并全文 → 新 ParsedDocument → 新 chunks）
        chunk_service = ChunkService()
        chunks = chunk_service.chunk(merged_doc, source_file_map)

        task.progress = 90
        task.current_step = f"语义分块：完成（共 {len(chunks)} 个分块）"
        task.save(update_fields=["progress", "current_step"])

        # 状态：主文件 chunked；附件 parsed（保留各自 ParsedDocument 独立查看）
        tender_file.status = TenderFile.STATUS_CHUNKED
        tender_file.save(update_fields=["status", "updated_at"])
        attachments.update(status=TenderFile.STATUS_PARSED)

        task.status = AsyncTask.STATUS_SUCCEEDED
        task.progress = 100
        task.current_step = "合并解析：完成"
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "finished_at"])

    except Exception as exc:
        logger.exception(
            "merge_parse_files failed: task_id=%s tender_file_id=%s",
            task_id, tender_file_id,
        )
        error_message = f"{type(exc).__name__}: {exc}"[:512]
        task.status = AsyncTask.STATUS_FAILED
        task.error_message = error_message
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "error_message", "finished_at"])

        tender_file.status = TenderFile.STATUS_PARSE_FAILED
        tender_file.error_message = error_message
        tender_file.save(update_fields=["status", "error_message", "updated_at"])

        raise
```

- [ ] **Step 4: 运行验证通过**

Run: `python -m pytest apps/tender/tests/test_merge_parse_files.py -q`
Expected: PASS（如 `ParserVersion` 导入不存在则删掉该 import）

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tender/tasks.py backend/apps/tender/tests/test_merge_parse_files.py
git commit -m "feat(merge): merge_parse_files Celery 任务（合并解析 + 重分块，不自动触发抽取）"
```

---

### Task 5: merge-parse API + URL + 测试

**Files:**
- Modify: `backend/apps/tender/views.py`
- Modify: `backend/apps/tender/urls.py`
- Create: `backend/apps/tender/tests/test_merge_parse_api.py`

**Interfaces:**
- Consumes: Task 4 `merge_parse_files.delay(task_id, tender_file_id, attachment_file_ids)`
- Produces: `POST /api/tender/files/{file_id}/merge-parse` body `{"file_ids": [int, ...]}` → `{"task_id": N, "status": "pending"}`
  - 权限：`tender.manage`（GLOBAL，`required_scope = "global"`）
  - 校验：file_ids 非空 list；全部存在；同 project；同 lot（附件 lot == 主文件 lot）；主文件状态不在 RUNNING_STATUSES
  - AsyncTask `task_type="tender_merge_parse"` + OperationLog `action="tender.merge_parse"`

- [ ] **Step 1: 写失败测试**

`test_merge_parse_api.py`（参考 `test_reparse_api.py` 的 APIClient 模式）：

```python
"""merge-parse API 测试。"""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.common.models import AsyncTask
from apps.tender.models import TenderFile


def make_file(project, user, name, lot=None, status=TenderFile.STATUS_PARSED):
    return TenderFile.objects.create(
        project=project, lot=lot, original_name=name, file_size=1024,
        content_type="application/pdf", object_key=f"tender/{name}",
        status=status, created_by=user,
    )


@pytest.mark.django_db
class TestMergeParseApi:
    def test_merge_parse_success(self, project, bid_manager_user, client):
        main = make_file(project, bid_manager_user, "main.pdf")
        att = make_file(project, bid_manager_user, "att.pdf")
        client.force_authenticate(bid_manager_user)

        with patch("apps.tender.views.merge_parse_files") as task_mock:
            resp = client.post(
                f"/api/tender/files/{main.id}/merge-parse",
                {"file_ids": [att.id]},
                format="json",
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "pending"
        task = AsyncTask.objects.get(pk=body["task_id"])
        assert task.task_type == "tender_merge_parse"
        assert task.related_object_id == str(main.id)
        task_mock.delay.assert_called_once_with(task.id, main.id, [att.id])

    def test_merge_parse_missing_file_ids(self, project, bid_manager_user, client):
        main = make_file(project, bid_manager_user, "main.pdf")
        client.force_authenticate(bid_manager_user)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse", {}, format="json")
        assert resp.status_code == 400

    def test_merge_parse_attachment_wrong_project(self, project, other_project, bid_manager_user, client):
        main = make_file(project, bid_manager_user, "main.pdf")
        att = make_file(other_project, bid_manager_user, "att.pdf")
        client.force_authenticate(bid_manager_user)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": [att.id]}, format="json")
        assert resp.status_code == 400

    def test_merge_parse_attachment_wrong_lot(self, project, lot, other_lot, bid_manager_user, client):
        main = make_file(project, bid_manager_user, "main.pdf", lot=lot)
        att = make_file(project, bid_manager_user, "att.pdf", lot=other_lot)
        client.force_authenticate(bid_manager_user)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": [att.id]}, format="json")
        assert resp.status_code == 400

    def test_merge_parse_running_status_rejected(self, project, bid_manager_user, client):
        main = make_file(project, bid_manager_user, "main.pdf", status=TenderFile.STATUS_CHUNKING)
        client.force_authenticate(bid_manager_user)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": []}, format="json")
        assert resp.status_code == 400

    def test_merge_parse_requires_permission(self, project, editor_user, client):
        """非 tender.manage 用户 403。"""
        main = make_file(project, editor_user, "main.pdf")
        client.force_authenticate(editor_user)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": []}, format="json")
        assert resp.status_code == 403
```

（fixture `editor_user` 若不存在，改用任意普通用户 + 不授 `tender.manage`；`other_project`/`lot`/`other_lot` fixture 若不存在，在测试内创建 `Project` / `Lot` 实例——参考 `test_reparse_api.py` 现有写法。）

- [ ] **Step 2: 运行验证失败**

Run: `python -m pytest apps/tender/tests/test_merge_parse_api.py -q`
Expected: FAIL（404：路由不存在）

- [ ] **Step 3: 实现**

`views.py` 追加（imports 加 `from apps.tender.tasks import merge_parse_files` 顶部或在方法内延迟导入）：

```python
class TenderFileMergeParseView(APIView):
    """合并解析：主文件 + 附件合并为统一文档。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.manage"
    required_scope = "global"

    RUNNING_STATUSES = [
        TenderFile.STATUS_PARSING,
        TenderFile.STATUS_CHUNKING,
        "processing",
    ]

    def get_permission_project(self, request):
        return None

    def post(self, request, file_id):
        from apps.common.models import AsyncTask
        from apps.tender.tasks import merge_parse_files

        file_ids = request.data.get("file_ids", [])
        if not isinstance(file_ids, list) or not file_ids:
            raise ValidationError(message="file_ids 不能为空")

        with transaction.atomic():
            try:
                main_file = TenderFile.objects.select_for_update().get(pk=file_id)
            except TenderFile.DoesNotExist as exc:
                raise NotFound(message="文件不存在") from exc

            if main_file.status in self.RUNNING_STATUSES:
                return Response(
                    {"message": "文件正在处理中，请勿重复触发合并解析"},
                    status=400,
                )

            attachments = list(
                TenderFile.objects.select_related("project", "lot").filter(pk__in=file_ids)
            )
            if len(attachments) != len(set(file_ids)):
                raise NotFound(message="存在不存在的文件")

            for att in attachments:
                if att.project_id != main_file.project_id:
                    raise ValidationError(message="附件与主文件不在同一项目")
                if att.lot_id != main_file.lot_id:
                    raise ValidationError(message="附件与主文件不在同一标段")

            # 记录变更前状态
            file_status_before = main_file.status
            main_file.status = TenderFile.STATUS_CHUNKING
            main_file.error_message = ""
            main_file.save(update_fields=["status", "error_message", "updated_at"])

            task = AsyncTask.objects.create(
                task_type="tender_merge_parse",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="TenderFile",
                related_object_id=str(main_file.id),
                created_by=request.user,
            )
            main_file.parse_task = task
            main_file.save(update_fields=["parse_task", "updated_at"])

            # 审计日志
            OperationLog.objects.create(
                actor=request.user,
                action="tender.merge_parse",
                target_type="TenderFile",
                target_id=str(main_file.id),
                summary=f"合并解析: {main_file.original_name} + {len(attachments)} 个附件",
                extra={
                    "attachment_ids": [a.id for a in attachments],
                    "task_id": task.id,
                    "file_status_before": file_status_before,
                },
            )

        # 触发 Celery 任务（事务外）
        merge_parse_files.delay(task.id, main_file.id, [a.id for a in attachments])

        return Response({
            "message": "已提交合并解析任务",
            "file_id": main_file.id,
            "status": "pending",
            "task_id": task.id,
        })
```

`urls.py` 加：

```python
    path("tender/files/<int:file_id>/merge-parse", TenderFileMergeParseView.as_view(), name="tender-merge-parse"),
```

并加入 import。

- [ ] **Step 4: 运行验证通过**

Run: `python -m pytest apps/tender/tests/test_merge_parse_api.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tender/views.py backend/apps/tender/urls.py backend/apps/tender/tests/test_merge_parse_api.py
git commit -m "feat(merge): merge-parse API（校验同项目同标段 + AsyncTask + 审计）"
```

---

### Task 6: context.py build_all + scoring 优先收录 + 排序兜底

**Files:**
- Modify: `backend/apps/requirements/services/extraction/context.py`
- Create: `backend/apps/requirements/tests/test_extraction_context_v2.py`

**Interfaces:**
- Produces:
  - `build_chunk_context(tender_file, max_context_length: int, scoring_priority: bool = False, chunks: list | None = None) -> str`
    - chunks 传 None 时按 `order_by(F("page_start").asc(nulls_last=True), "id")` 查询
    - `scoring_priority=True`：`chunk_type == ChunkType.SCORING` 的 chunks 完整收录（不截断），其余按预算
    - block 增加 `来源文件: {original_name or "(主文件)"}` 行
  - `ExtractionContextBuilder.build_all(tender_file, model_config_id, valid_types) -> dict[str, ExtractionContext]`
    - 共享一次 document_text / model_config / chunks 查询
    - 每个类型一个 ExtractionContext，仅 scoring 类型开 scoring_priority
  - `build(tender_file, model_config_id, extraction_type="scoring")` 保持签名兼容（内部调 build_all 取单类型）

- [ ] **Step 1: 写失败测试**

`test_extraction_context_v2.py`：

```python
"""抽取上下文 V2 测试：build_all / scoring 优先 / 排序兜底。"""

from unittest.mock import patch

import pytest

from apps.requirements.services.extraction.context import (
    ExtractionContextBuilder,
    build_chunk_context,
)
from apps.tender.constants import ChunkLevel, ChunkType
from apps.tender.models import TenderChunk


def make_chunk(parsed_document, idx, content, page_start=None, chunk_type=ChunkType.GENERAL):
    return TenderChunk.objects.create(
        parsed_document=parsed_document,
        chunk_level=ChunkLevel.SECTION,
        chunk_index=idx,
        content=content,
        content_hash=f"h-v2-{idx}",
        page_start=page_start,
        chunk_type=chunk_type,
    )


@pytest.mark.django_db
class TestBuildChunkContextV2:
    def test_scoring_priority_includes_all_scoring_chunks_first(self, parsed_document):
        for i in range(10):
            make_chunk(parsed_document, i, f"普通内容{i}", page_start=i)
        make_chunk(parsed_document, 100, "评分表碎片A", page_start=20, chunk_type=ChunkType.SCORING)
        make_chunk(parsed_document, 101, "评分表碎片B", page_start=21, chunk_type=ChunkType.SCORING)

        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000,
                                  scoring_priority=True)
        idx_a = out.index("评分表碎片A")
        idx_b = out.index("评分表碎片B")
        idx_first_other = out.index("普通内容0")
        assert idx_a < idx_first_other and idx_b < idx_first_other
        assert idx_a < idx_b

    def test_scoring_not_truncated_by_budget(self, parsed_document):
        """scoring 碎片即使超预算也完整收录。"""
        make_chunk(parsed_document, 0, "评分长碎片" * 500, chunk_type=ChunkType.SCORING)
        make_chunk(parsed_document, 1, "普通内容", page_start=1)

        out = build_chunk_context(parsed_document.tender_file, max_context_length=100,
                                  scoring_priority=True)
        assert "评分长碎片" in out
        assert "已截断" in out  # 普通内容被截断

    def test_page_start_none_sorted_by_id(self, parsed_document):
        c_none_2 = make_chunk(parsed_document, 2, "无页码B", page_start=None)
        c_1 = make_chunk(parsed_document, 1, "第1页", page_start=1)
        c_none_3 = make_chunk(parsed_document, 3, "无页码A", page_start=None)

        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000)
        assert out.index("第1页") < out.index("无页码A") < out.index("无页码B")
        # 无页码按 id 升序：c_none_2 (id 小) 在前
        assert c_none_2.id < c_none_3.id

    def test_non_scoring_order_unchanged(self, parsed_document):
        make_chunk(parsed_document, 0, "内容P3", page_start=3)
        make_chunk(parsed_document, 1, "内容P1", page_start=1)
        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000)
        assert out.index("内容P1") < out.index("内容P3")

    def test_block_contains_source_file(self, parsed_document, tender_file):
        make_chunk(parsed_document, 0, "带来源内容", page_start=1)
        chunk = TenderChunk.objects.filter(parsed_document=parsed_document).first()
        chunk.source_file = tender_file
        chunk.save()
        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000)
        assert "来源文件: test.pdf" in out


@pytest.mark.django_db
class TestBuildAll:
    def test_build_all_returns_per_type_contexts(self, parsed_document):
        make_chunk(parsed_document, 0, "内容", page_start=1)
        builder = ExtractionContextBuilder()
        with patch.object(builder.document_text_service, "get_document_text", return_value="全文"):
            contexts = builder.build_all(
                parsed_document.tender_file, None,
                ["scoring", "technical", "commercial"],
            )

        assert set(contexts.keys()) == {"scoring", "technical", "commercial"}
        for ctx in contexts.values():
            assert ctx.document_text == "全文"
            assert ctx.model_config is not None

    def test_build_all_scoring_chunk_context_differs_from_others(self, parsed_document):
        make_chunk(parsed_document, 0, "普通", page_start=1)
        make_chunk(parsed_document, 1, "评分表", page_start=2, chunk_type=ChunkType.SCORING)
        builder = ExtractionContextBuilder()
        with patch.object(builder.document_text_service, "get_document_text", return_value="全文"):
            contexts = builder.build_all(
                parsed_document.tender_file, None, ["scoring", "technical"],
            )
        assert contexts["scoring"].chunk_context != contexts["technical"].chunk_context
        assert contexts["scoring"].chunk_context.index("评分表") < contexts["scoring"].chunk_context.index("普通")
        assert contexts["technical"].chunk_context.index("普通") < contexts["technical"].chunk_context.index("评分表")

    def test_build_backward_compat(self, parsed_document):
        make_chunk(parsed_document, 0, "内容", page_start=1)
        builder = ExtractionContextBuilder()
        with patch.object(builder.document_text_service, "get_document_text", return_value="全文"):
            ctx = builder.build(parsed_document.tender_file, None)
        assert ctx.document_text == "全文"
        assert ctx.chunk_context
```

- [ ] **Step 2: 运行验证失败**

Run: `python -m pytest apps/requirements/tests/test_extraction_context_v2.py -q`
Expected: FAIL（build_all 不存在 / 排序行为不符）

- [ ] **Step 3: 实现**

`context.py` 改造：

```python
"""抽取上下文：全文 + 分块参考 + 模型配置，一次构建供全部场景共享。"""

from dataclasses import dataclass
from typing import Any

from django.db.models import F

from apps.requirements.services.document_text_service import DocumentTextService
from apps.tender.constants import ChunkType
from apps.tender.models import TenderChunk


@dataclass
class ExtractionContext:
    """单次抽取运行共享的只读输入。"""

    document_text: str
    chunk_context: str
    model_config: Any | None


def get_model_config(model_config_id: int | None):
    ...  # 保持不变


def chunk_context_budget(model_config: Any) -> int:
    ...  # 保持不变


def build_chunk_context(
    tender_file,
    max_context_length: int,
    scoring_priority: bool = False,
    chunks: list | None = None,
) -> str:
    """构建解析分块上下文字符串。

    Args:
        tender_file: 招标文件实例
        max_context_length: 最大字符数上限
        scoring_priority: True 时 chunk_type=scoring 的分块完整收录（不截断），其余按预算
        chunks: 预加载分块列表（build_all 复用一次查询）
    """
    if chunks is None:
        chunks = list(
            TenderChunk.objects
            .filter(
                parsed_document__tender_file=tender_file,
                parsed_document__is_active=True,
            )
            .exclude(content="")
            .order_by(F("page_start").asc(nulls_last=True), "id")
        )

    if not chunks:
        return ""

    # scoring 场景：评分表碎片优先完整收录，其余按原序补
    if scoring_priority:
        ordered = [c for c in chunks if c.chunk_type == ChunkType.SCORING] + \
                  [c for c in chunks if c.chunk_type != ChunkType.SCORING]
    else:
        ordered = chunks

    parts = []
    current_length = 0
    total_count = len(ordered)
    scoring_remaining = sum(1 for c in ordered if c.chunk_type == ChunkType.SCORING)
    for idx, chunk in enumerate(ordered, 1):
        page_info = ""
        if chunk.page_start is not None and chunk.page_end is not None:
            page_info = f"{chunk.page_start}-{chunk.page_end}"
        elif chunk.page_start is not None:
            page_info = str(chunk.page_start)

        source_name = chunk.source_file.original_name if chunk.source_file_id else "(主文件)"
        block = (
            f"=== 分块 #{idx} ===\n"
            f"类型: {chunk.chunk_type}\n"
            f"章节路径: {chunk.section_path or '(无)'}\n"
            f"来源文件: {source_name}\n"
            f"页码: {page_info or '(无)'}\n"
            f"内容:\n{chunk.content}\n"
        )
        # scoring 碎片不受预算截断；其余分块受预算约束
        if chunk.chunk_type == ChunkType.SCORING and scoring_priority:
            parts.append(block)
            scoring_remaining -= 1
            current_length += len(block)
            continue
        if current_length + len(block) > max_context_length:
            parts.append(f"\n[注: 已截断，剩余 {total_count - idx + 1 - scoring_remaining} 个分块未显示]")
            break
        parts.append(block)
        current_length += len(block)

    return "\n".join(parts)
```

（注意：截断提示计数需扣掉已收录的 scoring 块数，用 `scoring_remaining` 修正，避免提示数字虚高。）

`ExtractionContextBuilder` 改造：

```python
class ExtractionContextBuilder:
    """一次构建全文 / 分块参考 / 模型配置。"""

    def __init__(self, document_text_service: DocumentTextService | None = None):
        self.document_text_service = document_text_service or DocumentTextService()

    def build_all(self, tender_file, model_config_id: int | None, valid_types: list[str]) -> dict[str, ExtractionContext]:
        """为每个抽取类型构建独立上下文（全文/模型配置共享，chunk_context 按场景不同）。"""
        model_config = get_model_config(model_config_id)
        document_text = self.document_text_service.get_document_text(tender_file)
        chunks = list(
            TenderChunk.objects
            .filter(
                parsed_document__tender_file=tender_file,
                parsed_document__is_active=True,
            )
            .exclude(content="")
            .order_by(F("page_start").asc(nulls_last=True), "id")
        )
        budget = chunk_context_budget(model_config)
        return {
            t: ExtractionContext(
                document_text=document_text,
                chunk_context=build_chunk_context(
                    tender_file, budget,
                    scoring_priority=(t == "scoring"),
                    chunks=chunks,
                ),
                model_config=model_config,
            )
            for t in valid_types
        }

    def build(self, tender_file, model_config_id: int | None, extraction_type: str = "scoring") -> ExtractionContext:
        """单类型构建（兼容旧调用）。"""
        return self.build_all(tender_file, model_config_id, [extraction_type])[extraction_type]
```

- [ ] **Step 4: 运行验证通过**

Run: `python -m pytest apps/requirements/tests/test_extraction_context_v2.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requirements/services/extraction/context.py backend/apps/requirements/tests/test_extraction_context_v2.py
git commit -m "feat(extract): 上下文 build_all + scoring 碎片优先完整收录 + None 页码排序兜底"
```

---

### Task 7: orchestrator 适配 per-type contexts

**Files:**
- Modify: `backend/apps/requirements/services/extraction/orchestrator.py`
- Test: `backend/apps/requirements/tests/test_requirement_extract_v3.py`（追加用例）

**Interfaces:**
- Consumes: Task 6 `build_all(tender_file, model_config_id, valid_types) -> dict[str, ExtractionContext]`
- Produces: `run()` 内部 prepare 阶段 `contexts = self.context_builder.build_all(...)`；worker 按类型取 `contexts[extraction_type]`

- [ ] **Step 1: 写失败测试**

追加到 `test_requirement_extract_v3.py`（沿用现有 orchestrator 测试的 patch 方式）：

```python
@pytest.mark.django_db
class TestOrchestratorPerTypeContext:
    def test_each_worker_gets_its_own_context(self, tender_file, bid_manager_user, parsed_document):
        from unittest.mock import MagicMock, patch
        from apps.requirements.services.extraction.orchestrator import ExtractionOrchestrator
        from apps.requirements.models import RequirementExtractionRun

        orchestrator = ExtractionOrchestrator()
        orchestrator.context_builder = MagicMock()
        per_type = {
            "scoring": MagicMock(chunk_context="scoring-ctx"),
            "technical": MagicMock(chunk_context="technical-ctx"),
        }
        orchestrator.context_builder.build_all.return_value = per_type

        seen = {}

        class FakeExtractor:
            def __init__(self, ai_task_service):
                pass

            def extract(self, **kwargs):
                seen[kwargs["extraction_type"]] = kwargs["chunk_context"]
                return {"count": 1, "ids": [1], "prompt_version": "3.1"}

        with patch("apps.requirements.services.extraction.orchestrator.SingleTypeExtractor", FakeExtractor):
            with patch("apps.requirements.services.extraction.orchestrator.AiTaskExecutionService"):
                results = orchestrator.run(
                    tender_file_id=tender_file.id,
                    extraction_types=["scoring", "technical"],
                    created_by=bid_manager_user,
                )

        assert seen == {"scoring": "scoring-ctx", "technical": "technical-ctx"}
        assert results["total_count"] == 2
        orchestrator.context_builder.build_all.assert_called_once()
```

- [ ] **Step 2: 运行验证失败**

Run: `python -m pytest apps/requirements/tests/test_requirement_extract_v3.py::TestOrchestratorPerTypeContext -q`
Expected: FAIL（当前 `build` 被调用且传同一 context）

- [ ] **Step 3: 实现**

`orchestrator.py`：

1. `run()` 中替换 prepare 段：

```python
        try:
            contexts = self.context_builder.build_all(
                tender_file, model_config_id, valid_types
            )
        except Exception as e:
            self._fail_run(extraction_run, f"获取文档全文失败: {e}")
            raise RequirementExtractionError(f"获取文档全文失败: {e}")
```

2. `_extract_parallel` 签名 `context` → `contexts: dict[str, ExtractionContext]`（import 不变），`_extract_one` 调用处传 `contexts[extraction_type]`：

```python
        def worker(extraction_type: str):
            tracker.mark_started(extraction_type)
            try:
                type_result = self._extract_one(
                    extraction_type=extraction_type,
                    context=contexts[extraction_type],
                    ...
```

3. `_extract_parallel` 调用处传 `contexts=contexts`。

- [ ] **Step 4: 运行验证通过**

Run: `python -m pytest apps/requirements/tests/test_requirement_extract_v3.py -q`
Expected: PASS（全部用例，含既有 orchestrator 测试）

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requirements/services/extraction/orchestrator.py backend/apps/requirements/tests/test_requirement_extract_v3.py
git commit -m "feat(extract): orchestrator 按场景使用独立上下文（scoring 专用）"
```

---

### Task 8: 前端单场景提取（工具栏复选框 + 侧栏单提）

**Files:**
- Modify: `frontend/src/components/requirements/RequirementExtractToolbar.vue`
- Modify: `frontend/src/components/requirements/RequirementSidebar.vue`
- Modify: `frontend/src/components/requirements/RequirementTab.vue`

**Interfaces:**
- Consumes: `extractRequirements(fileId, {extraction_types, overwrite, model_config_id, prompt_version_id})`（已支持数组）
- Produces:
  - Toolbar payload: `{force, extractionTypes: string[], modelConfigId, promptVersionId}`，emit `extract`
  - Sidebar emit `extract-single: [category: string]`
  - 映射：display type → extraction type：`qualification→qualification`、`tech_req→technical`、`scoring→scoring`、`commercial→commercial`、`submission→submission`、`legal→mandatory`

- [ ] **Step 1: 实现工具栏复选框**

`RequirementExtractToolbar.vue`：

EXTRACTION_SCENARIOS 增加 `key`（short extraction type）：

```ts
const EXTRACTION_SCENARIOS = [
  { key: 'scoring', value: 'requirement_extraction_scoring', label: '评分项' },
  { key: 'mandatory', value: 'requirement_extraction_mandatory', label: '强制条款' },
  { key: 'qualification', value: 'requirement_extraction_qualification', label: '资格要求' },
  { key: 'commercial', value: 'requirement_extraction_commercial', label: '商务条款' },
  { key: 'technical', value: 'requirement_extraction_technical', label: '技术要求' },
  { key: 'submission', value: 'requirement_extraction_submission', label: '投标递交' },
]
```

script 加状态：

```ts
const selectedTypes = ref<string[]>(EXTRACTION_SCENARIOS.map((s) => s.key))
```

template `toolbar-right` 前加场景选择区：

```html
      <div class="toolbar-scenes">
        <el-checkbox-group v-model="selectedTypes" size="small">
          <el-checkbox
            v-for="s in EXTRACTION_SCENARIOS"
            :key="s.key"
            :value="s.key"
          >
            {{ s.label }}
          </el-checkbox>
        </el-checkbox-group>
      </div>
```

按钮区改为：

```html
        <el-button
          type="primary"
          :loading="loading"
          :disabled="!canExtract || selectedTypes.length === 0"
          @click="handleExtract(false)"
        >
          提取所选场景
        </el-button>
        <el-button
          :loading="loading"
          :disabled="!canExtract || selectedTypes.length === 0"
          @click="handleExtract(true)"
        >
          强制重新抽取
        </el-button>
```

`handleExtract`：

```ts
function handleExtract(force: boolean) {
  if (!canExtract.value || selectedTypes.value.length === 0) return
  emit('extract', {
    force,
    extractionTypes: [...selectedTypes.value],
    modelConfigId: selectedModelId.value,
    promptVersionId: selectedPromptVersionId.value,
  })
}
```

`ExtractPayload` 接口改为：

```ts
interface ExtractPayload {
  force: boolean
  extractionTypes: string[]
  modelConfigId: number | null
  promptVersionId: number | null
}
```

- [ ] **Step 2: 实现侧栏单提按钮**

`RequirementSidebar.vue` category-item 内加：

```html
        <div class="category-right">
          <span class="category-count">{{ cat.count || 0 }}</span>
          <el-button
            size="small"
            link
            type="primary"
            class="single-extract-btn"
            @click.stop="$emit('extract-single', cat.value)"
          >
            单提
          </el-button>
        </div>
```

style 加：

```css
.category-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.single-extract-btn {
  font-size: 12px;
}
```

`defineEmits` 加 `extract-single: [category: string]`。

- [ ] **Step 3: 实现 RequirementTab 接线**

`RequirementTab.vue`：

```ts
// 展示分类 → 抽取类型映射（侧栏单提用）
const DISPLAY_TO_EXTRACTION: Record<string, string> = {
  qualification: 'qualification',
  tech_req: 'technical',
  scoring: 'scoring',
  commercial: 'commercial',
  submission: 'submission',
  legal: 'mandatory',
}
```

template 侧栏标签：

```html
      <RequirementSidebar
        :categories="categoriesWithCount"
        :active-category="activeCategory"
        @select="handleCategorySelect"
        @extract-single="handleExtractSingle"
      />
```

`handleExtract` 用 payload.extractionTypes：

```ts
async function handleExtract(payload: ExtractPayload) {
  if (!payload.modelConfigId || !payload.promptVersionId) {
    ElMessage.error('请选择模型和提示词版本')
    return
  }
  const types = payload.extractionTypes?.length
    ? payload.extractionTypes
    : ['scoring', 'mandatory', 'qualification', 'commercial', 'technical', 'submission']

  extractLoading.value = true
  try {
    const res = await extractRequirements(props.tenderFileId, {
      extraction_types: types,
      overwrite: payload.force,
      model_config_id: payload.modelConfigId,
      prompt_version_id: payload.promptVersionId,
    })
    ...
  }
}
```

新增：

```ts
// 侧栏单提：只提取当前分类对应场景
async function handleExtractSingle(category: string) {
  const extractionType = DISPLAY_TO_EXTRACTION[category]
  if (!extractionType) {
    ElMessage.error(`未知分类: ${category}`)
    return
  }
  const toolbar = ... // 直接复用当前选中的模型/提示词：从 template 引用的子组件拿不到，
  // 改为：单提使用当前已选模型配置（若无，用默认）；提示词版本传 null 由后端自动查找 published
  extractLoading.value = true
  try {
    const res = await extractRequirements(props.tenderFileId, {
      extraction_types: [extractionType],
      overwrite: false,
      model_config_id: lastModelConfigId.value,
      prompt_version_id: lastPromptVersionId.value,
    })
    if (res.data?.task_id) {
      currentTaskId.value = res.data.task_id
    }
    ElMessage.success(`已创建「${currentCategoryLabel.value}」单项抽取任务`)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建任务失败')
  } finally {
    extractLoading.value = false
  }
}
```

（`lastModelConfigId` / `lastPromptVersionId`：在 `handleExtract` 里记录最近一次 toolbar payload 的值；若从未抽取过则传 null，后端自动用默认模型 + 按场景查找 published 版本。）

- [ ] **Step 4: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功无 TS 报错

- [ ] **Step 5: 浏览器手动验证**

- 打开某已解析文件条款页：勾选仅「评分项」→ 提取所选场景 → 任务只抽 scoring；完成回调正常
- 侧栏「评分项」行点「单提」→ 只触发 scoring 任务
- 「强制重新抽取」勾选子集时按子集 overwrite 抽取
- 抽取进度文案正常（后端 reporter 写「抽取 评分项 完成 (1/6)」）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/requirements/RequirementExtractToolbar.vue frontend/src/components/requirements/RequirementSidebar.vue frontend/src/components/requirements/RequirementTab.vue
git commit -m "feat(extract): 前端单场景提取（工具栏复选框 + 侧栏单提）"
```

---

### Task 9: 文件详情页附件上传 + 合并解析 UI

**Files:**
- Modify: `frontend/src/api/tender.ts`
- Modify: `frontend/src/views/tender/TenderFileDetailView.vue`

**Interfaces:**
- Consumes: 现有 `uploadFile(file, {project_id, lot_id, file_category})`、`listTenderFiles({project_id, lot_id})`、`getTask(taskId)`（`@/api/tasks`）
- Produces: `mergeParseTenderFile(fileId, fileIds)` → POST `/api/tender/files/{fileId}/merge-parse`；详情页「标段文件」区（附件列表 + 勾选 + 上传附件 + 合并解析 + 进度）

- [ ] **Step 1: 加 API 函数**

`tender.ts` 追加：

```ts
/**
 * 合并解析：主文件 + 附件合并为统一文档
 * POST /api/tender/files/{file_id}/merge-parse
 */
export function mergeParseTenderFile(fileId: number, fileIds: number[]) {
  return http.post<{ task_id: number; status: string }>(
    `/api/tender/files/${fileId}/merge-parse`,
    { file_ids: fileIds }
  )
}
```

- [ ] **Step 2: 详情页加「标段文件」区**

`TenderFileDetailView.vue`：

1. script 加状态：

```ts
import { listTenderFiles, mergeParseTenderFile, uploadFile } from '@/api/tender'
import { getTask } from '@/api/tasks'

const lotFiles = ref<TenderFile[]>([])
const selectedAttachmentIds = ref<number[]>([])
const mergeLoading = ref(false)
const attachUploading = ref(false)
```

2. `loadPageData` 里加 `loadLotFiles()`：

```ts
// 加载同标段文件组（附件 + 澄清 + 主文件）
async function loadLotFiles() {
  if (!tenderFile.value?.project || !tenderFile.value?.lot_id) {
    lotFiles.value = []
    return
  }
  try {
    const res = await listTenderFiles({
      project_id: tenderFile.value.project,
      lot_id: tenderFile.value.lot_id,
    })
    lotFiles.value = res.data?.results || []
  } catch (err) {
    logError('加载标段文件失败:', err)
  }
}
```

3. 上传附件（文件选择器 → attachment + 同 lot）：

```ts
const attachmentInput = ref<HTMLInputElement | null>(null)

async function handleAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length || !tenderFile.value) return
  attachUploading.value = true
  try {
    for (const file of files) {
      await uploadFile(file, {
        project_id: tenderFile.value.project,
        lot_id: tenderFile.value.lot_id ?? undefined,
        file_category: 'attachment',
      })
    }
    ElMessage.success(`已上传 ${files.length} 个附件，可执行合并解析`)
    await loadLotFiles()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '附件上传失败')
  } finally {
    attachUploading.value = false
  }
}
```

4. 合并解析（勾选附件 → API → 轮询任务）：

```ts
let mergePollTimer: ReturnType<typeof setInterval> | null = null

async function handleMergeParse() {
  if (selectedAttachmentIds.value.length === 0) {
    ElMessage.warning('请先勾选要合并的附件')
    return
  }
  try {
    await ElMessageBox.confirm(
      '合并解析将把主文件与所选附件合并为统一文档并重新分块，历史解析版本保留。是否继续？',
      '确认合并解析',
      { type: 'warning' }
    )
  } catch {
    return
  }
  mergeLoading.value = true
  try {
    const res = await mergeParseTenderFile(fileId.value, selectedAttachmentIds.value)
    ElMessage.success('已提交合并解析任务')
    await pollMergeTask(res.data.task_id)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '提交合并解析失败')
  } finally {
    mergeLoading.value = false
  }
}

function pollMergeTask(taskId: number) {
  return new Promise<void>((resolve) => {
    mergePollTimer = setInterval(async () => {
      try {
        const res = await getTask(taskId)
        const task = res.data
        if (task.status === 'succeeded') {
          clearInterval(mergePollTimer!)
          mergeLoading.value = false
          ElMessage.success('合并解析完成，可重新执行条款抽取/大纲生成')
          await loadPageData()
          resolve()
        } else if (task.status === 'failed') {
          clearInterval(mergePollTimer!)
          mergeLoading.value = false
          ElMessage.error(`合并解析失败: ${task.error_message || ''}`)
          resolve()
        }
      } catch (err) {
        logError('轮询合并任务失败:', err)
        clearInterval(mergePollTimer!)
        mergeLoading.value = false
        resolve()
      }
    }, 2000)
  })
}
```

5. template（Tabs 之前）加卡片：

```html
    <!-- 标段文件组：附件上传 + 合并解析 -->
    <el-card v-if="tenderFile?.lot_id" class="lot-files-card">
      <template #header>
        <div class="lot-files-header">
          <span>标段文件（合并解析）</span>
          <div>
            <el-button size="small" :loading="attachUploading" @click="attachmentInput?.click()">
              上传附件
            </el-button>
            <el-button
              size="small"
              type="primary"
              :loading="mergeLoading"
              :disabled="selectedAttachmentIds.length === 0"
              @click="handleMergeParse"
            >
              合并解析
            </el-button>
          </div>
        </div>
      </template>
      <input ref="attachmentInput" type="file" accept=".docx,.doc,.pdf,.txt,.md" multiple style="display: none" @change="handleAttachmentChange" />
      <el-table :data="lotFiles" size="small" @selection-change="(rows: TenderFile[]) => selectedAttachmentIds = rows.filter(r => r.file_category === 'attachment').map(r => r.id)">
        <el-table-column type="selection" :selectable="(row: TenderFile) => row.file_category === 'attachment'" width="40" />
        <el-table-column prop="original_name" label="文件名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="file_category_display" label="类别" width="100" />
        <el-table-column label="解析状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'parsed' || row.status === 'chunked' ? 'success' : row.status === 'chunking' ? 'warning' : 'info'">
              {{ row.status_display || row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
```

（`TenderFile` 接口缺 `status_display` 则直接显示 `row.status` 或补接口字段；`file_category_display` 已有。）

6. `handleTaskCompleted` 增加 merge 分支：

```ts
function handleTaskCompleted(result: Record<string, unknown>) {
  if (result.task_type === 'requirement_extraction_v2') {
    ElMessage.success(`条款抽取完成，共 ${result.total_count || 0} 条`)
  } else if (result.task_type === 'tender_merge_parse') {
    ElMessage.success('合并解析完成，可重新执行条款抽取/大纲生成')
  } else {
    ElMessage.success('任务完成')
  }
  loadPageData()
}
```

- [ ] **Step 3: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 浏览器手动验证**

- 详情页出现「标段文件」卡片；上传附件（选同 lot）后列表出现附件行
- 勾选附件 → 合并解析 → 进度轮询 → 完成提示「可重新执行条款抽取/大纲生成」
- 主文件状态从「合并解析中」→「已分块」；附件状态「已解析」
- 合并期间重复点合并解析被拒（400）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/tender.ts frontend/src/views/tender/TenderFileDetailView.vue
git commit -m "feat(merge): 文件详情页附件上传 + 合并解析 UI（标段文件组 + 进度轮询）"
```

---

### Task 10: 上传流程附件引导提示

**Files:**
- Modify: `frontend/src/views/projects/components/WorkbenchFileUploadPanel.vue`

**Interfaces:**
- Consumes: 现有 `uploadFile(file, {project_id, lot_id, file_category})`（当前固定 `file_category: 'tender_file'`）
- Produces: 标书上传成功后弹「是否包含技术规范书等附件」确认框，选「上传附件」则继续上传为 attachment（同项目同标段）

- [ ] **Step 1: 实现**

`WorkbenchFileUploadPanel.vue`：

1. 上传成功后（`uploadStatus.value = 'success'` 与 `ElMessage.success('上传成功，正在解析...')` 之后）追加引导：

```ts
    // 引导上传附件（技术规范书等），与标书同项目同标段
    ElMessageBox.confirm(
      '该标书是否包含技术规范书等附件？如需一并提取，请继续上传附件。',
      '上传附件',
      {
        confirmButtonText: '上传附件',
        cancelButtonText: '暂不需要',
        type: 'info',
      }
    ).then(() => {
      attachmentInput.value?.click()
    }).catch(() => {
      // 用户选择暂不需要
    })
```

2. 附件上传隐藏 input + 处理器（复用当前上传上下文：project_id / lot_id 同刚上传的标书）：

```ts
const attachmentInput = ref<HTMLInputElement | null>(null)
const lastTenderContext = ref<{ project_id: number; lot_id?: number } | null>(null)

// 在 handleFileChange 成功分支记录 lastTenderContext（取当前面板表单的 project/lot 值）

async function handleAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length || !lastTenderContext.value) return
  for (const file of files) {
    try {
      await uploadFile(file, {
        project_id: lastTenderContext.value.project_id,
        lot_id: lastTenderContext.value.lot_id,
        file_category: 'attachment',
      })
      ElMessage.success(`附件「${file.name}」上传成功`)
    } catch (err: any) {
      ElMessage.error(err.response?.data?.message || `附件「${file.name}」上传失败`)
    }
  }
  emit('uploaded')
}

<template> 内加：
<input
  ref="attachmentInput"
  type="file"
  accept=".docx,.doc,.pdf,.txt,.md"
  multiple
  style="display: none"
  @change="handleAttachmentChange"
/>
```

（实现时按面板现有状态变量的实际命名取 project/lot：若面板已持有 `projectId`/`lotId` ref 则直接复用，无需 lastTenderContext。）

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 3: 浏览器手动验证**

- 上传标书成功 → 弹出附件引导 → 点「上传附件」→ 文件选择器打开 → 选择技术规范书 → 附件上传成功且归类 attachment
- 点「暂不需要」→ 无后续弹窗
- 附件出现在项目文件列表（类别=附件）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/projects/components/WorkbenchFileUploadPanel.vue
git commit -m "feat(merge): 标书上传后引导上传附件（技术规范书等）"
```

---

### Task 11: 提示词 3.2 drafts（scoring / technical）

**Files:**
- Create: `backend/scripts/create_prompt_v3_2_drafts.py`
- Test: `backend/apps/requirements/tests/test_requirement_extract_v3.py`（追加用例）或独立 `backend/scripts` 不测 → 改为 DB 层断言脚本产物

**Interfaces:**
- Consumes: `PromptTemplate`（key 场景）已发布 3.1 版本内容
- Produces: 每个目标场景一个 `PromptVersion(version="3.2", status=DRAFT)`：
  - `requirement_extraction_scoring`：system_prompt 追加「评分标准常以表格形式存在，解析后可能断裂为多个片段（表头与行分离、顺序错乱、重复出现），必须合并重建完整评分体系，不得因表格断裂返回空结果」
  - `requirement_extraction_technical`：system_prompt 追加「招标文件可能包含多个文件（主文件 + 技术规范书附件），文档内容为多文件合并，需完整提取所有文件中的技术要求」
- 幂等：`--force` 时删除已有 3.2 DRAFT 重建；不自动发布

- [ ] **Step 1: 写脚本**

`create_prompt_v3_2_drafts.py`（参考 `create_prompt_v3_1_drafts.py` 结构）：

```python
"""创建 3.2 提示词草稿（仅 scoring / technical）。

用法（容器内）:
    python manage.py shell < scripts/create_prompt_v3_2_drafts.py   # 或 docker cp + shell
"""

import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
django.setup()

from apps.prompts.models import PromptTemplate, PromptVersion

FORCE = "--force" in sys.argv

# scenario → 追加到 system_prompt 的说明段
V3_2_INSTRUCTIONS = {
    "requirement_extraction_scoring": (
        "评分标准常以表格形式存在，解析后可能断裂为多个片段"
        "（表头与行分离、顺序错乱、重复出现），必须合并重建完整评分体系，"
        "不得因表格断裂返回空结果。"
    ),
    "requirement_extraction_technical": (
        "招标文件可能包含多个文件（主文件 + 技术规范书附件），"
        "文档内容为多文件合并，需完整提取所有文件中的技术要求。"
    ),
}

for key, instruction in V3_2_INSTRUCTIONS.items():
    template = PromptTemplate.objects.filter(key=key).first()
    if not template:
        print(f"SKIP {key}: 模板不存在")
        continue
    base = (
        PromptVersion.objects
        .filter(template=template, version="3.1", status="published")
        .order_by("-id").first()
    )
    if not base:
        print(f"SKIP {key}: 无已发布 3.1 版本")
        continue

    if FORCE:
        PromptVersion.objects.filter(template=template, version="3.2", status="draft").delete()

    if PromptVersion.objects.filter(template=template, version="3.2", status="draft").exists():
        print(f"SKIP {key}: 3.2 草稿已存在（--force 重建）")
        continue

    content = base.content
    content["system_prompt"] = (
        (content.get("system_prompt", "") + "\n\n" + instruction).strip()
    )
    PromptVersion.objects.create(
        template=template,
        version="3.2",
        status="draft",
        changelog="3.2: " + instruction[:40],
        content=content,
        created_by_id=base.created_by_id,
    )
    print(f"CREATED {key} 3.2 draft")
```

（若 `PromptVersion` 有 `created_by` 必填或 `template` 字段名不同，按实际模型调整——见 Task 11 Step 2 运行结果。）

- [ ] **Step 2: 写失败测试（DB 层）**

追加到 `test_requirement_extract_v3.py` 或新文件 `test_prompt_v3_2_drafts.py`：

```python
"""提示词 3.2 草稿创建逻辑测试。"""

import pytest

from apps.prompts.models import PromptTemplate, PromptVersion

SCORING_INSTRUCTION = "评分标准常以表格形式存在"
TECHNICAL_INSTRUCTION = "多文件合并"


@pytest.mark.django_db
def test_v3_2_scoring_draft_contains_table_instruction():
    template = PromptTemplate.objects.get(key="requirement_extraction_scoring")
    base = PromptVersion.objects.filter(template=template, version="3.1", status="published").first()
    if not base:
        pytest.skip("无已发布 3.1 版本")
    from scripts.create_prompt_v3_2_drafts import V3_2_INSTRUCTIONS
    assert SCORING_INSTRUCTION in V3_2_INSTRUCTIONS["requirement_extraction_scoring"]
    assert TECHNICAL_INSTRUCTION in V3_2_INSTRUCTIONS["requirement_extraction_technical"]
```

（脚本核心是追加逻辑；纯函数断言 + 运行脚本后人工 Playground 验证。若 scripts 不在包路径，把断言放到 `scripts/` 单测或用 `sys.path` 导入——保持与现有 `create_prompt_v3_1_drafts.py` 一致即可。）

- [ ] **Step 3: 运行脚本**

```bash
cd backend && source .venv/bin/activate
python -c "import os, sys; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev'); import django; django.setup(); sys.argv = ['x', '--force']; exec(open('scripts/create_prompt_v3_2_drafts.py').read())"
```

Expected: 每场景输出 `CREATED ... 3.2 draft`；重复运行输出 `SKIP ... 已存在`

- [ ] **Step 4: Playground 验证（人工）**

- 提示词管理 → 3.2 草稿 → Playground 用文件 11 合并解析后的文档跑 scoring / technical
- scoring：输出 groups 非空且评分表完整重建
- technical：提取到附件技术规范书条款
- 确认后前端发布 3.2（4 场景 3.1 不动）

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/create_prompt_v3_2_drafts.py backend/apps/requirements/tests/test_prompt_v3_2_drafts.py
git commit -m "feat(prompt): 提示词 3.2 草稿脚本（scoring 表格碎片重建 + technical 多文件合并说明）"
```

---

### Task 12: 全量回归 + 部署验证 + commit push

**Files:**
- 无新增（部署操作）

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && source .venv/bin/activate && python -m pytest --tb=short -q`
Expected: 全部 PASS（requirements ~100 + tender + outline 相关；无新增失败）

- [ ] **Step 2: 构建与部署**

```bash
cd frontend && npm run build
cd .. && docker compose build web worker beat
docker compose up -d web worker beat
docker exec ai-bid-generator-web-1 python manage.py migrate
docker compose restart nginx
```

- [ ] **Step 3: 验证服务**

```bash
docker logs --tail 20 ai-bid-generator-web-1
curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
```

Expected: 登录返回 token

- [ ] **Step 4: 浏览器端到端验证（文件 11 场景）**

1. 项目文件 → 上传标书 → 弹出附件引导 → 上传《技术规范书（附件）》
2. 文件详情页 → 标段文件卡片 → 勾选附件 → 合并解析 → 进度到 100%
3. 条款页 → 工具栏勾选仅「评分项」→ 提取所选场景 → scoring 输出非空（评分体系完整重建）
4. 侧栏「技术要求」→ 单提 → technical 提取到附件章节条款（数量明显多于 5 条）
5. 合并解析后重新生成大纲 → 大纲包含附件章节
6. 条款「来源文件」展示（若有展示位）或详情里能看到附件来源

- [ ] **Step 5: Commit + Push**

```bash
git add -A
git commit -m "feat(merge): 附件合并解析 + 单场景提取 + scoring/technical 上下文优化 + 提示词 3.2"
git push
```

（含本轮全部 12 个 task 的改动与文档 `docs/superpowers/specs/2026-08-04-attachment-merge-extract-design.md`。）

---

## Self-Review 记录

**Spec 覆盖：**
- 一、合并解析：TenderChunk.source_file ✓（T1）、merge-parse API ✓（T5）、merge_parse_files ✓（T4）、页码偏移 ✓（T2）、幂等版本 ✓（T2 test_remerge）、状态机 ✓（T1/T4/T5）
- 二、DocumentTextService 适配 ✓（T2 写 document_text_object_key，抽取零改动）
- 三、上传流程附件引导 ✓（T10）
- 四、文件详情页附件/合并解析 UI ✓（T9）
- 五、单场景提取 ✓（T8 工具栏复选框 + 侧栏单提 + payload extraction_types）
- 六、scoring 上下文优先收录 + 排序兜底 ✓（T6 + T7 接线）
- 七、提示词 3.2 ✓（T11，draft→Playground→发布流程）
- 八、前端展示：来源文件标注进 chunk_context block ✓（T6）；failed_types 展示既有 ✓；大纲零改动 ✓（T12 验证）
- 九、测试 ✓（每任务 TDD + T12 全量回归）
- 十、不改什么 ✓（Global Constraints）
- 十一、实施顺序 ✓（T1-5=Step A，T6-7=Step B，T8-9=Step C，T10=Step D，T11=Step E，T12=Step F）

**类型一致性：**
- `build_chunk_context(tender_file, max_context_length, scoring_priority=False, chunks=None)` 在 T6 定义，T6 测试与 T7 均按此签名调用
- `build_all(tender_file, model_config_id, valid_types) -> dict[str, ExtractionContext]` T6 定义，T7 orchestrator 消费
- `merge()` 返回 `(merged_doc, source_file_map)`，T2 实现 / T3 消费 map / T4 任务消费两者
- `source_file_map` 键格式 `文件：{original_name}（附件）` 三处一致（T2 生成、T3 查找、T1 无耦合）
- 前端 `extractionTypes` 与后端 `extraction_types` 短键（scoring/technical/...）在 T8 一致；DISPLAY_TO_EXTRACTION 映射 6 项完整
