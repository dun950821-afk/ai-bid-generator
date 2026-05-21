"""认证流程异常。

这些异常属于"认证子系统内部语言"，由 LoginView 翻译成 common.exceptions
中带 error_code 的 APIError 后返回前端——Provider 自身不关心 HTTP。
"""


class AuthError(Exception):
    """认证流程异常基类。"""


class InvalidCredentials(AuthError):
    """用户名或密码错误。"""


class AccountDisabled(AuthError):
    """账号已被停用。"""


class AccountLocked(AuthError):
    """账号因连续登录失败被临时锁定。"""


class ProviderUnavailable(AuthError):
    """认证 Provider 不存在或暂不可用。"""


class ExternalIdentityNotBound(AuthError):
    """外部身份未绑定到任何本地用户（预留给后续 OAuth/LDAP Provider）。"""
