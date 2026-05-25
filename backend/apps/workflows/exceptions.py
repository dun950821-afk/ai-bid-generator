# backend/apps/workflows/exceptions.py
"""工作流异常。"""

from rest_framework.exceptions import APIException


class StateTransitionError(APIException):
    """状态迁移错误。"""
    status_code = 409
    default_code = "invalid_state_transition"
    default_detail = "非法状态迁移"