"""URL 安全校验（防 SSRF）。"""
import ipaddress
import re
import socket
from urllib.parse import urlparse


PRIVATE_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT 共享地址段
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("::ffff:0:0/96"),  # IPv4-mapped IPv6 整体按内网处理
]


def _normalize_ip(ip: ipaddress._BaseAddress) -> ipaddress._BaseAddress:
    """IPv4-mapped IPv6（::ffff:127.0.0.1）归一为其映射的 IPv4。

    F-14：`IPv6Address in IPv4Network` 恒为 False，不归一则映射地址
    可穿透全部 IPv4 私网段校验。
    """
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return ip.ipv4_mapped
    return ip


def is_safe_external_url(url: str) -> bool:
    """校验 URL 是否可安全请求（防 SSRF）。

    Args:
        url: 待校验的 URL

    Returns:
        True 如果 URL 指向外部公网且 scheme 是 http/https
    """
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for addr_info in addr_infos:
        ip = _normalize_ip(ipaddress.ip_address(addr_info[4][0]))
        for network in PRIVATE_NETWORKS:
            if ip in network:
                return False
    return True


def sanitize_filename(filename: str) -> str:
    """清洗文件名，移除路径分隔符与目录穿越，保留扩展名。"""
    # 移除控制字符
    cleaned = re.sub(r"[\x00-\x1f]", "", filename)
    # 分离扩展名（最后一个 . 之后，且扩展名长度合理）
    name_part, dot, ext_part = cleaned.rpartition(".")
    if dot and 0 < len(ext_part) < 10 and re.match(r"^[a-zA-Z0-9]+$", ext_part):
        # 有效扩展名，保留
        ext = ext_part
    else:
        # 无有效扩展名
        name_part = cleaned
        dot = ""
        ext = ""
    # 清洗 name_part：移除路径分隔符与 ..
    name_cleaned = re.sub(r"[\\/.]+", "_", name_part)
    # 去除前导/尾随 _
    name_cleaned = name_cleaned.strip("_")
    if not name_cleaned:
        name_cleaned = "document"
    # 组合
    result = f"{name_cleaned}.{ext}" if dot and ext else name_cleaned
    # 限制长度
    if len(result) > 200:
        if dot and ext:
            result = name_cleaned[:150] + "." + ext
        else:
            result = result[:200]
    return result or "document"
