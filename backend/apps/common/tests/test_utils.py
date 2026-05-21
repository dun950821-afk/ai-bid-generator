"""apps.common.utils 工具函数测试。"""
from apps.common.utils import get_client_ip, get_user_agent


def test_get_client_ip_prefers_forwarded_for(rf):
    request = rf.get("/", HTTP_X_FORWARDED_FOR="198.51.100.4, 10.0.0.9")
    assert get_client_ip(request) == "198.51.100.4"


def test_get_client_ip_falls_back_to_remote_addr(rf):
    request = rf.get("/")
    assert get_client_ip(request) == "127.0.0.1"


def test_get_client_ip_none_request_returns_none():
    assert get_client_ip(None) is None


def test_get_user_agent_truncates(rf):
    request = rf.get("/", HTTP_USER_AGENT="x" * 600)
    assert len(get_user_agent(request)) == 512


def test_get_user_agent_none_request_returns_empty():
    assert get_user_agent(None) == ""
