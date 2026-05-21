"""认证 Provider 抽象基类。"""


class BaseAuthProvider:
    """所有认证 Provider 的基类（spec §5.1）。

    职责单一：用一组凭证换出一个本地 User。
    刻意不做：签发 Token、is_active 校验、写审计日志——这些由
    login_service.complete_login 统一处理，保证不同 Provider 行为一致。
    """

    provider_code = ""

    def authenticate(self, credentials):
        """校验凭证并返回本地 User；失败抛 auth.exceptions 中的异常。

        credentials 是一个 dict，字段由具体 Provider 约定。
        """
        raise NotImplementedError
