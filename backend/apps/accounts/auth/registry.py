"""认证 Provider 注册表。"""
from apps.accounts.auth.exceptions import ProviderUnavailable
from apps.accounts.auth.password import PasswordAuthProvider

_PROVIDERS = {
    PasswordAuthProvider.provider_code: PasswordAuthProvider,
}


def get_provider(provider_code):
    """按 provider_code 取 Provider 实例；未知 code 抛 ProviderUnavailable。

    新增 Provider（OAuth/LDAP 等）只需在此登记，调用方无需改动。
    """
    provider_cls = _PROVIDERS.get(provider_code)
    if provider_cls is None:
        raise ProviderUnavailable(f"未知认证 Provider：{provider_code}")
    return provider_cls()
