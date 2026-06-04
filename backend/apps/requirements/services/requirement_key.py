# backend/apps/requirements/services/requirement_key.py
"""条款唯一键生成。"""

from hashlib import sha256


def generate_requirement_key(
    tender_file_id: int,
    extraction_type: str,
    content: str,
    source_chunk_id: int | None = None,
) -> str:
    """生成条款唯一键。

    用于幂等更新：同一个文件+类型+内容重跑时保持幂等。

    Args:
        tender_file_id: 招标文件 ID
        extraction_type: 抽取类型（scoring, mandatory, qualification 等）
        content: 条款内容
        source_chunk_id: 来源分块 ID（可选，新版不使用）

    Returns:
        32 位哈希字符串
    """
    normalized = content[:200].strip()
    raw = f"{tender_file_id}:{extraction_type}:{normalized}"
    return sha256(raw.encode("utf-8")).hexdigest()[:32]
