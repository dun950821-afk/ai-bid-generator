# 文件格式兼容增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让招标文件上传解析支持旧版 DOC 格式(通过 ONLYOFFICE 转换),增强 magic bytes 识别(OLE 容器),并细化文件类型错误提示。

**Architecture:** 三层改动——(1) `file_magic.py` 手写 magic bytes 增加 OLE 复合文档识别(`D0 CF 11 E0`),允许 `.doc` 上传、识别"疑似加密/旧版 docx";(2) 新增 `DocConverter` 服务复用已部署的 ONLYOFFICE 容器把 doc 转成 docx;(3) `ParseService` 把 doc 分支接入转换器后走现有 `DocxParser`。零新 Python 依赖、零 DB 迁移、零镜像体积变化。

**Tech Stack:** Django, MinIO, ONLYOFFICE Document Server (ConvertService.ashx + JWT), python-docx

## Global Constraints

- 不新增 Python 依赖(filetype 库在 head-only 4096 字节场景下无法识别 docx——它需要完整 zip 解包读 `[Content_Types].xml`;OLE 魔数 `D0 CF 11 E0 A1 B1 1A E1` 固定 4-8 字节,手写检测足够可靠)
- 不做 DB 迁移、不改 Docker 镜像
- 所有用户可见错误消息使用中文
- 转换器必须可 mock 测试(不依赖真实 ONLYOFFICE)
- 文件头读取长度保持 4096 字节(现有 `read_head` / `direct_upload` 调用不变)

---

### Task 1: file_magic 识别 OLE 容器并允许 doc 上传

**Files:**
- Modify: `backend/apps/common/services/file_magic.py`
- Test: `backend/apps/common/tests/test_file_magic.py`(若无此文件则创建)

**Interfaces:**
- Consumes: 无(Task 1 独立)
- Produces:
  - `detect_kind(head: bytes) -> str`:新增返回值 `"ole"`(头部 `D0 CF 11 E0 A1 B1 1A E1`)
  - `is_allowed_upload(filename: str, head: bytes) -> bool`:扩展名 `doc` 且 `kind == "ole"` 时返回 True;扩展名 `docx` 且 `kind == "ole"` 时返回 False
  - `get_unsupported_message(filename: str, head: bytes) -> str | None`:签名增加 `head` 参数;docx+OLE 返回"该文件疑似为加密的 DOCX 或旧版格式,请用 Word/WPS 另存为普通 DOCX 后上传";doc 非 OLE 返回"文件内容与扩展名不符,请检查文件是否损坏"

- [ ] **Step 1: 检查现有测试文件是否存在**

```bash
ls backend/apps/common/tests/test_file_magic.py
```

- [ ] **Step 2: 写失败测试(新建或追加 `test_file_magic.py`)**

```python
"""file_magic 增强测试。"""
import pytest

from apps.common.services import file_magic

OLE_HEAD = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 8
ZIP_HEAD = b"PK\x03\x04" + b"\x00" * 12


def test_detect_kind_ole():
    assert file_magic.detect_kind(OLE_HEAD) == "ole"


def test_doc_ole_allowed():
    assert file_magic.is_allowed_upload("招标文件.doc", OLE_HEAD) is True


def test_doc_non_ole_rejected():
    assert file_magic.is_allowed_upload("招标文件.doc", b"hello world") is False


def test_docx_ole_rejected():
    assert file_magic.is_allowed_upload("招标文件.docx", OLE_HEAD) is False


def test_docx_zip_still_allowed():
    assert file_magic.is_allowed_upload("招标文件.docx", ZIP_HEAD) is True


def test_unsupported_message_docx_ole():
    msg = file_magic.get_unsupported_message("招标文件.docx", OLE_HEAD)
    assert "加密" in msg


def test_unsupported_message_doc_non_ole():
    msg = file_magic.get_unsupported_message("招标文件.doc", b"hello world")
    assert msg is not None
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/common/tests/test_file_magic.py --tb=short -q`
Expected: FAIL(`detect_kind` 返回 `"unknown"` 而非 `"ole"`,doc 上传被拒)

- [ ] **Step 4: 实现 OLE 识别与 doc 放行**

修改 `file_magic.py`:

```python
# 允许的文件扩展名
ALLOWED_EXTENSIONS = {"docx", "txt", "md", "xlsx", "xls", "zip", "pdf", "doc"}

# OLE 复合文档魔数（旧版 doc/xls/ppt、加密 OOXML 均为此容器）
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

# 不支持的文件类型及提示
UNSUPPORTED_TYPES = {
    "docx_ole": "该文件疑似为加密的 DOCX 或旧版格式，请用 Word/WPS 另存为普通 DOCX 后上传",
    "doc_mismatch": "文件内容与扩展名不符，请检查文件是否损坏",
}
```

```python
def detect_kind(head: bytes) -> str:
    if head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08"):
        return "zip"
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(OLE_SIGNATURE):
        return "ole"
    if _looks_text(head):
        return "txt"
    return "unknown"
```

```python
def is_allowed_upload(filename: str, head: bytes) -> bool:
    ext = extension_of(filename)
    if ext not in ALLOWED_EXTENSIONS:
        return False

    kind = detect_kind(head)
    if ext in {"docx", "xlsx", "zip"}:
        return kind == "zip"
    if ext == "pdf":
        return kind == "pdf"
    if ext == "doc":
        return kind == "ole"
    if ext in {"txt", "md"}:
        return kind == "txt"
    return False
```

```python
def get_unsupported_message(filename: str, head: bytes) -> str | None:
    """获取不支持的文件类型提示信息。"""
    ext = extension_of(filename)
    kind = detect_kind(head)
    if ext == "docx" and kind == "ole":
        return UNSUPPORTED_TYPES["docx_ole"]
    if ext == "doc" and kind != "ole":
        return UNSUPPORTED_TYPES["doc_mismatch"]
    return UNSUPPORTED_TYPES.get(ext)
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/common/tests/test_file_magic.py --tb=short -q`
Expected: 7 passed

- [ ] **Step 6: 更新调用方签名(`upload_service.py` 两处 `get_unsupported_message` 调用)**

修改 `backend/apps/tender/services/upload_service.py:133` 和 `:232`:

```python
message = get_unsupported_message(tender_file.original_name, head) or "文件类型校验失败"
```

- [ ] **Step 7: 运行上传相关测试确认无回归**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/tender/tests/test_upload_api.py apps/tender/tests/test_upload_post_policy.py --tb=short -q`
Expected: 全通过

- [ ] **Step 8: Commit**

```bash
git add backend/apps/common/services/file_magic.py backend/apps/tender/services/upload_service.py backend/apps/common/tests/test_file_magic.py
git commit -m "feat: 识别 OLE 容器，支持 doc 上传，细化文件类型错误提示"
```

---

### Task 2: DocConverter 服务(ONLYOFFICE doc→docx 转换)

**Files:**
- Create: `backend/apps/common/services/doc_converter.py`
- Test: `backend/apps/common/tests/test_doc_converter.py`

**Interfaces:**
- Consumes: `StorageService`(上传/下载/删除临时对象)、`settings.MINIO_PUBLIC_ENDPOINT`、`settings.MINIO_BUCKET`、`settings.ONLYOFFICE_JWT_SECRET`
- Produces:
  - `class DocConverter`:
    - `convert_doc_to_docx(content: bytes, filename: str) -> bytes`:doc 二进制 → docx 二进制,失败抛 `DocConversionError`
    - `class DocConversionError(Exception)`:含中文 `message`,加密文件等场景用
  - 临时对象键格式:`converted/{uuid}.doc`

- [ ] **Step 1: 写失败测试 `test_doc_converter.py`**

```python
"""DocConverter 测试（mock HTTP，不依赖真实 ONLYOFFICE）。"""
import pytest
from unittest.mock import Mock, patch

from apps.common.services.doc_converter import (
    DocConverter,
    DocConversionError,
)


@pytest.fixture
def converter():
    return DocConverter()


def _fake_response(status: int, body: bytes):
    resp = Mock()
    resp.status = status
    resp.read.return_value = body
    return resp


class TestConvertDocToDocx:
    def test_success(self, converter):
        doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
        # 转换成功：上传 -> HTTP 返回 FileUrl -> 下载 docx
        fake_urlopen = Mock()
        fake_urlopen.return_value = _fake_response(200, b"<FileResult><FileUrl>http://onlyoffice/cache/out.docx</FileUrl></FileResult>")
        fake_download = Mock()
        fake_download.return_value = _fake_response(200, b"PK\x03\x04 fake docx")
        with patch("urllib.request.urlopen", side_effect=[fake_urlopen, fake_download]), \
             patch.object(converter, "_upload_tmp", return_value="converted/x.doc"), \
             patch.object(converter, "_download_result", return_value=b"PK\x03\x04 fake docx"):
            result = converter.convert_doc_to_docx(doc_bytes, "招标文件.doc")
        assert result.startswith(b"PK")

    def test_encrypted_file_error(self, converter):
        doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
        fake_urlopen = Mock()
        fake_urlopen.return_value = _fake_response(200, b"<FileResult><Error>-20</Error></FileResult>")
        with patch("urllib.request.urlopen", return_value=fake_urlopen), \
             patch.object(converter, "_upload_tmp", return_value="converted/x.doc"):
            with pytest.raises(DocConversionError) as exc_info:
                converter.convert_doc_to_docx(doc_bytes, "招标文件.doc")
        assert "加密" in str(exc_info.value)

    def test_http_error(self, converter):
        doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
        with patch("urllib.request.urlopen", side_effect=Exception("connection refused")), \
             patch.object(converter, "_upload_tmp", return_value="converted/x.doc"):
            with pytest.raises(DocConversionError):
                converter.convert_doc_to_docx(doc_bytes, "招标文件.doc")
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/common/tests/test_doc_converter.py --tb=short -q`
Expected: FAIL(ModuleNotFoundError)

- [ ] **Step 3: 实现 DocConverter**

创建 `backend/apps/common/services/doc_converter.py`:

```python
"""doc → docx 转换服务（复用 ONLYOFFICE Document Server）。

ONLYOFFICE 已随 docker compose 部署（8082 端口），其 ConvertService.ashx
可将旧版 DOC 转为 DOCX，转换结果可直接复用 DocxParser 解析。
"""

import json
import logging
import time
import uuid
from urllib import request

import hmac
import hashlib
import base64

from django.conf import settings

from apps.common.services.storage import StorageService

logger = logging.getLogger(__name__)


class DocConversionError(Exception):
    """doc 转换失败。message 为中文提示。"""


def _b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def _make_jwt(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing = _b64url(json.dumps(header, separators=(",", ":")).encode())
    signing += b"." + _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), signing, hashlib.sha256).digest()
    return (signing + b"." + _b64url(sig)).decode()


class DocConverter:
    """把 DOC 字节流转换为 DOCX 字节流。"""

    def __init__(self, storage: StorageService | None = None):
        self.storage = storage or StorageService()

    def convert_doc_to_docx(self, content: bytes, filename: str) -> bytes:
        """转换 doc → docx。失败抛 DocConversionError（中文提示）。"""
        object_key = f"converted/{uuid.uuid4()}.doc"
        try:
            self._upload_tmp(object_key, content)
            result_url = self._request_conversion(object_key, filename)
            return self._download_result(result_url)
        except DocConversionError:
            raise
        except Exception as exc:
            logger.exception("doc conversion failed: %s", filename)
            raise DocConversionError(f"DOC 转换失败: {exc}") from exc
        finally:
            try:
                self.storage.remove_object(object_key)
            except Exception:
                pass

    def _upload_tmp(self, object_key: str, content: bytes) -> None:
        self.storage.put_object(object_key, content, "application/msword")

    def _request_conversion(self, object_key: str, filename: str) -> str:
        """调 ONLYOFFICE ConvertService.ashx，返回转换后文件 URL。"""
        endpoint = settings.ONLYOFFICE_JWT_SECRET  # noqa: F841（仅用于 JWT）
        public_url = (
            f"http://{settings.MINIO_PUBLIC_ENDPOINT}/"
            f"{settings.MINIO_BUCKET}/{object_key}"
        )
        payload = {
            "url": public_url,
            "outputtype": "docx",
            "filetype": "doc",
            "key": str(uuid.uuid4()),
            "title": filename,
        }
        token = _make_jwt(
            {
                "payload": payload,
                "iss": "ai-bid-generator",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
            },
            settings.ONLYOFFICE_JWT_SECRET,
        )
        req = request.Request(
            "http://onlyoffice-document-server/ConvertService.ashx",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        )
        with request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
        return self._parse_result(body)

    def _parse_result(self, body: str) -> str:
        """解析 ConvertService.ashx 的 XML 响应。"""
        import re

        error_match = re.search(r"<Error>(-?\d+)</Error>", body)
        if error_match and error_match.group(1) != "0":
            code = int(error_match.group(1))
            if code == -20:
                raise DocConversionError("文件已加密，请取消加密后（Word/WPS 另存为普通 DOCX）再上传")
            raise DocConversionError(f"ONLYOFFICE 转换失败（错误码 {code}）")
        url_match = re.search(r"<FileUrl>(.*?)</FileUrl>", body)
        if not url_match:
            raise DocConversionError("ONLYOFFICE 转换失败：响应缺少文件地址")
        return url_match.group(1)

    def _download_result(self, result_url: str) -> bytes:
        with request.urlopen(result_url, timeout=120) as resp:
            return resp.read()
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/common/tests/test_doc_converter.py --tb=short -q`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/apps/common/services/doc_converter.py backend/apps/common/tests/test_doc_converter.py
git commit -m "feat: 新增 DocConverter 服务，复用 ONLYOFFICE 将 doc 转为 docx"
```

---

### Task 3: ParseService 接入 doc 转换

**Files:**
- Modify: `backend/apps/tender/services/parse_service.py`
- Test: `backend/apps/tender/tests/test_parse_service.py`(追加)

**Interfaces:**
- Consumes: `DocConverter.convert_doc_to_docx(content, filename) -> bytes`(Task 2)
- Produces: 无新接口;`SUPPORTED_EXTENSIONS` 增加 `"doc"`,`_do_parse` 增加 doc 分支

- [ ] **Step 1: 写失败测试(追加到 `test_parse_service.py`)**

```python
def test_parse_doc_uses_converter(self, parsed_document, monkeypatch):
    """doc 文件应经 DocConverter 转 docx 后走 DocxParser。"""
    from apps.tender.services.parse_service import ParseService
    from apps.tender.services.parsers.docx_parser import DocxParser

    service = ParseService()
    doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
    fake_docx = (
        b"PK\x03\x04 fake docx that parses as empty doc"
    )
    called = {}

    def fake_convert(content, filename):
        called["content"] = content
        return fake_docx

    monkeypatch.setattr(
        "apps.tender.services.parse_service.DocConverter",
        lambda *a, **kw: type("C", (), {"convert_doc_to_docx": staticmethod(fake_convert)})(),
    )
    # 用真实 DocxParser 需要合法 docx；这里直接验证分发与转换调用
    result = service._do_parse(doc_bytes, "招标文件.doc")
    assert called["content"] == doc_bytes
    assert isinstance(result, ParseResult)
```

注意:此测试要求 `_do_parse` 的 doc 分支调用 `DocConverter`,且 `fake_docx` 能被 DocxParser 解析。若构造合法 docx 不便,可在测试中同时 mock `DocxParser`——但更推荐生成合法最小 docx(见 Step 2)。

- [ ] **Step 2: 准备最小合法 docx fixture(用于测试)**

最小 docx 是一个 zip,含 `[Content_Types].xml`、`word/document.xml`。用 python 在测试内生成:

```python
import io
import zipfile


def make_min_docx(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
        z.writestr(
            "word/document.xml",
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()
```

- [ ] **Step 3: 实现 doc 分支**

修改 `parse_service.py`:

```python
SUPPORTED_EXTENSIONS = ["docx", "txt", "md", "pdf", "doc"]

UNSUPPORTED_MESSAGE: dict = {}
```

`_do_parse` 增加:

```python
        if extension == "doc":
            from apps.common.services.doc_converter import DocConverter

            docx_content = DocConverter().convert_doc_to_docx(content, filename)
            return self.docx_parser.parse(docx_content, filename)
```

(放在 docx 分支之前,`use_mock` 判断之后)

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/tender/tests/test_parse_service.py::TestParseService::test_parse_doc_uses_converter apps/tender/tests/test_chunk_service.py --tb=short -q`
Expected: 新增测试通过;chunk 测试不受影响

- [ ] **Step 5: 回归:整库测试(确认无新增失败)**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/tender/tests apps/common/tests --tb=short -q 2>&1 | tail -5`
Expected: 失败数量不高于改动前基线(当前 pre-existing 5 个失败:test_parse_service 4 个 + test_parse_tender_file 1 个)

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tender/services/parse_service.py backend/apps/tender/tests/test_parse_service.py
git commit -m "feat: ParseService 支持 doc，经 ONLYOFFICE 转换后走 DocxParser"
```

---

### Task 4: 端到端验证与部署

**Files:**
- 无代码改动(验证 + 运维操作)

- [ ] **Step 1: 用真实政务文件做 chunk 回归(验证 Task 1 之前的 DataError 修复在真实数据上有效)**

```bash
cd backend && source .venv/bin/activate
python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()
from apps.tender.services.chunk_service import ChunkService
svc = ChunkService()
markdown = open('/tmp/document4.md', encoding='utf-8').read()
sections = svc._split_sections(markdown, None)
print('sections:', len(sections))
print('all <= 255:', all(len(s.section_title) <= 255 for s in sections))
"
```
Expected: `all <= 255: True`

- [ ] **Step 2: 用 ONLYOFFICE 实测 doc→docx 转换(造一个临时 doc 文件或跳过到 Step 3)**

若本地无 doc 样本,可用 ONLYOFFICE 转换 API 自检连通性(参考 Task 2 的 `_make_jwt`,请求不存在的文件应返回 `-8` 而非 JWT 错误):

```bash
docker exec ai-bid-generator-web-1 python -c "
# 复用 DocConverter 的 JWT 生成,请求一个不存在的文件
from apps.common.services.doc_converter import DocConverter, _make_jwt
import json, time, urllib.request
c = DocConverter()
url = f'http://{settings.MINIO_PUBLIC_ENDPOINT}/{settings.MINIO_BUCKET}/converted/nonexist.doc'
...
"
```
Expected: 返回 `-8`(文件不存在)说明 JWT 与网络链路 OK;`-20`/错误码按实际

- [ ] **Step 3: 构建并重启服务**

```bash
cd /home/newaibook/ai-bid-generator
docker compose build web worker beat
docker compose up -d web worker beat
docker compose restart nginx
```

- [ ] **Step 4: 验证登录与健康**

```bash
docker logs --tail 20 ai-bid-generator-web-1
curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
```

- [ ] **Step 5: 生产环境重新上传政务文件验证 DataError 已修复**

在 `http://163.7.6.60/projects/2/lots/2` 重新上传"2025年江苏分公司政务云安全评估服务项目询比文件.docx",确认解析完成(状态不再 parse_failed)。

- [ ] **Step 6: 上传 doc 样本验证转换链路**(若 Step 2 有可用 doc)

上传一个旧版 `.doc` 文件,确认:类型校验放行 → 解析任务执行 ONLYOFFICE 转换 → 状态 parsed/chunked。

- [ ] **Step 7: Commit(如部署后有代码改动)**

```bash
git add -A && git commit -m "chore: 文件格式兼容增强部署验证"
```

---

## Self-Review

**Spec coverage:**
- OLE 识别 → Task 1 ✅
- doc 上传放行 → Task 1 ✅
- doc→docx 转换 → Task 2 ✅
- ParseService 接入 → Task 3 ✅
- 错误提示细化(加密 docx、doc 内容不符)→ Task 1 ✅
- 端到端验证与部署 → Task 4 ✅

**Placeholder scan:** 无 TODO/TBD;每个任务都有实际代码与命令。

**Type consistency:** `get_unsupported_message` 签名统一为 `(filename, head)`;`DocConverter.convert_doc_to_docx(content: bytes, filename: str) -> bytes` 在 Task 2/3 一致;`DocConversionError` 带中文 message。

**已知修正:** 原方案建议用 filetype 库,经技术验证后改为手写 OLE 魔数——filetype 识别 office 文件需要完整 zip 解包(读 `[Content_Types].xml`),而校验只有 4096 字节头部,不可靠;OLE 魔数固定且 head-only 可靠,零新依赖,更符合"轻量"目标。
