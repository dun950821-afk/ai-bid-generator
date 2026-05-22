"""简单算术 captcha（spec §5.4 反 DOS）。

只在 login_throttle 软触发后才向前端弹出，目的是让纯暴力穷举付出更
高代价，而不是给所有正常用户增加摩擦。无图形，纯文本"3 + 4 = ?"
方案足够 v1 用：
- 服务端生成 token，缓存正确答案 5 分钟
- verify 一次性消费：成功 / 失败都立即删 key，防重放
- 与登录链路解耦：captcha_service 只负责出题与核对，是否需要触发
  由 login_throttle.captcha_required(username) 决定
"""
import random
import secrets

from django.core.cache import cache

CAPTCHA_TTL = 5 * 60
CACHE_PREFIX = "captcha:"


def generate() -> dict:
    a = random.randint(1, 9)
    b = random.randint(1, 9)
    token = secrets.token_urlsafe(16)
    cache.set(f"{CACHE_PREFIX}{token}", str(a + b), CAPTCHA_TTL)
    return {"captcha_token": token, "question": f"{a} + {b} = ?"}


def verify(token: str, answer: str) -> bool:
    if not token or not answer:
        return False
    key = f"{CACHE_PREFIX}{token}"
    expected = cache.get(key)
    if expected is None:
        return False
    # 一次性消费：无论对错都立即删，防止穷举同一 token 的答案。
    cache.delete(key)
    return expected.strip() == str(answer).strip()
