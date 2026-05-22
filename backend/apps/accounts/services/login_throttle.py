"""登录失败限流三层（spec §5.4）。

单维度限流容易被绕过或被滥用反伤合法账户：
- 只按 username+IP 锁：代理池换 IP 即破。
- 只按 username 锁：攻击者用大量错误密码即可 DoS 任一合法账户。
- 只按 IP 限速：内网/同出口 NAT 用户互相牵连。

三层叠加方案：

- L1 / 按 IP 全局速率：60s 内失败 ≥ 20 次直接 429，阻断同 IP 暴力扫
  描；不区分用户，独立于 L2/L3 重置。
- L2 / 按 username+IP 硬锁：5 次失败锁 15 分钟，承袭旧行为，保护具体
  账户被同源穷举。
- L3 / 按 username 软触发 captcha：30 分钟窗口内失败 ≥ 10 次后，无论
  IP 是否换，下一次登录必须先通过 captcha。覆盖代理池绕 L2 场景。

成功登录只清 L2/L3，L1 保留计数 —— 攻击者拿到一个对的账户密码
不能用来给同 IP 的其他探测"洗白"。
"""
from django.core.cache import cache

# L1：IP 全局速率
IP_RATE_LIMIT = 20
IP_RATE_WINDOW = 60

# L2：username + IP 硬锁
MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60

# L3：username 软触发 captcha
CAPTCHA_THRESHOLD = 10
CAPTCHA_WINDOW = 30 * 60


def _ip_key(ip):
    return f"login_fail:ip:{ip or '-'}"


def _pair_key(username, ip):
    return f"login_fail:{username}:{ip or '-'}"


def _user_key(username):
    return f"login_fail:user:{username}"


def is_ip_throttled(ip):
    """L1：该 IP 在窗口内失败次数是否已达上限。"""
    return cache.get(_ip_key(ip), 0) >= IP_RATE_LIMIT


def is_locked(username, ip):
    """L2：username + IP 是否已硬锁。"""
    return cache.get(_pair_key(username, ip), 0) >= MAX_FAILURES


def captcha_required(username):
    """L3：username 在窗口内失败次数是否已达 captcha 软门槛。"""
    return cache.get(_user_key(username), 0) >= CAPTCHA_THRESHOLD


def record_failure(username, ip):
    """记一次登录失败到三个维度。

    返回 (l2_count, captcha_required_now)：
    - l2_count: username+IP 维度累计次数，供调用方判断是否触发 L2 硬锁
    - captcha_required_now: 本次失败后 L3 是否已跨过 captcha 阈值
    """
    pair = cache.get(_pair_key(username, ip), 0) + 1
    cache.set(_pair_key(username, ip), pair, LOCK_SECONDS)

    user = cache.get(_user_key(username), 0) + 1
    cache.set(_user_key(username), user, CAPTCHA_WINDOW)

    ip_cnt = cache.get(_ip_key(ip), 0) + 1
    cache.set(_ip_key(ip), ip_cnt, IP_RATE_WINDOW)

    return pair, user >= CAPTCHA_THRESHOLD


def reset(username, ip):
    """登录成功只清 L2 + L3；L1 IP 计数保留，避免代理池绕过。"""
    cache.delete(_pair_key(username, ip))
    cache.delete(_user_key(username))
