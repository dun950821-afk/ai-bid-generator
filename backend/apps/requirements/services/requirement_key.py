# backend/apps/requirements/services/requirement_key.py
"""条款唯一键生成。"""

from hashlib import sha256


def generate_requirement_key(
    tender_file_id: int,
    source_chunk_id: int | None,
    requirement_type: str,
    content: str,
) -> str:
    """生成条款唯一键。

    用于幂等更新：同一个 chunk 重跑时保持幂等。

    Args:
        tender_file_id: 招标文件 ID
        source_chunk_id: 来源分块 ID（可能为 None）
        requirement_type: 条款类型
        content: 条款内容

    Returns:
        32 位哈希字符串
    """
    normalized = content[:200].strip()
    raw = f"{tender_file_id}:{source_chunk_id or 'none'}:{requirement_type}:{normalized}"
    return sha256(raw.encode("utf-8")).hexdigest()[:32]
