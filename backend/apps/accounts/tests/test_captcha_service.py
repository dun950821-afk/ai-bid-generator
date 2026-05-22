"""H5 captcha_service 单测：生成 + 校验 + 一次性消费。"""
import pytest

from apps.accounts.services import captcha_service


@pytest.mark.django_db
def test_generate_returns_token_and_question():
    c = captcha_service.generate()
    assert "captcha_token" in c
    assert "question" in c
    assert c["question"].endswith(" = ?")


@pytest.mark.django_db
def test_generate_and_verify_roundtrip():
    c = captcha_service.generate()
    q = c["question"]
    a, b = [int(x) for x in q.replace(" = ?", "").split(" + ")]
    assert captcha_service.verify(c["captcha_token"], str(a + b)) is True


@pytest.mark.django_db
def test_verify_is_one_shot():
    """一次性消费：同一 token 再核对必须返回 False，防穷举。"""
    c = captcha_service.generate()
    q = c["question"]
    a, b = [int(x) for x in q.replace(" = ?", "").split(" + ")]
    assert captcha_service.verify(c["captcha_token"], str(a + b)) is True
    assert captcha_service.verify(c["captcha_token"], str(a + b)) is False


@pytest.mark.django_db
def test_verify_wrong_answer_consumes_token():
    """错误答案也要消费 token，避免攻击者在窗口内穷举。"""
    c = captcha_service.generate()
    assert captcha_service.verify(c["captcha_token"], "999") is False
    # 即使后续给出正确答案也无效
    q = c["question"]
    a, b = [int(x) for x in q.replace(" = ?", "").split(" + ")]
    assert captcha_service.verify(c["captcha_token"], str(a + b)) is False


@pytest.mark.django_db
def test_verify_unknown_token_is_false():
    assert captcha_service.verify("not-a-real-token", "1") is False


@pytest.mark.django_db
def test_verify_empty_inputs_are_false():
    assert captcha_service.verify("", "1") is False
    assert captcha_service.verify("x", "") is False
