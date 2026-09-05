from uuid import UUID

from django.conf import settings
from rest_framework.permissions import BasePermission

from .models import DepartmentRole, User


def _get_token_claim(request, claim):
    token = getattr(request, "auth", None)
    if token is None:
        return None

    try:
        value = token.get(claim)
    except (AttributeError, TypeError, ValueError):
        return None

    return value


def _get_uuid_claim(request, claim):
    value = _get_token_claim(request, claim)
    if not isinstance(value, str):
        return None

    try:
        return str(UUID(value))
    except (TypeError, ValueError, AttributeError):
        return None


def get_token_hospital_id(request):
    return _get_uuid_claim(request, "hospital_id")


def get_token_department_id(request):
    return _get_uuid_claim(request, "department_id")


def get_token_department_code(request):
    value = _get_token_claim(request, "department_code")
    return value if isinstance(value, str) and value else None


def get_token_role(request):
    value = _get_token_claim(request, "role")
    valid_roles = {choice.value for choice in DepartmentRole.Role}
    return value if value in valid_roles else None


def resolve_object_hospital_id(obj):
    """Return an object's explicit permission hospital ID, or deny by default.

    A protected object can expose ``permission_hospital_id`` without this shared
    permission module guessing domain-specific Patient/Case relation chains.
    """
    value = getattr(obj, "permission_hospital_id", None)
    if callable(value):
        value = value()
    if value is None:
        return None

    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        return None


class IsActiveStaff(BasePermission):
    message = "활성화된 의료진 계정이 필요합니다."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and user.account_status == User.AccountStatus.ACTIVE
            and user.department_role_id is not None
        )


class IsSameHospital(BasePermission):
    message = "다른 병원의 리소스에는 접근할 수 없습니다."

    def has_permission(self, request, view):
        return get_token_hospital_id(request) is not None

    def has_object_permission(self, request, view, obj):
        token_hospital_id = get_token_hospital_id(request)
        object_hospital_id = resolve_object_hospital_id(obj)
        return bool(
            token_hospital_id
            and object_hospital_id
            and token_hospital_id == object_hospital_id
        )


class _DepartmentPermission(BasePermission):
    department_setting = ""
    default_department_code = None

    def has_permission(self, request, view):
        expected_code = getattr(
            settings,
            self.department_setting,
            self.default_department_code,
        )
        return bool(
            expected_code
            and get_token_department_code(request) == expected_code
        )


class IsRadiologyStaff(_DepartmentPermission):
    # 저장소/DB에 실제 코드가 확인되기 전까지 기본 deny.
    department_setting = "SOOMIT_RADIOLOGY_DEPARTMENT_CODE"


class IsPathologyStaff(_DepartmentPermission):
    department_setting = "SOOMIT_PATHOLOGY_DEPARTMENT_CODE"
    default_department_code = "PATHOLOGY"


class IsPulmonologyStaff(_DepartmentPermission):
    department_setting = "SOOMIT_PULMONOLOGY_DEPARTMENT_CODE"
    default_department_code = "PULMONOLOGY"


class IsAdministrationStaff(_DepartmentPermission):
    # 저장소/DB에 실제 코드가 확인되기 전까지 기본 deny.
    department_setting = "SOOMIT_ADMINISTRATION_DEPARTMENT_CODE"


class _RolePermission(BasePermission):
    role = None

    def has_permission(self, request, view):
        return bool(self.role and get_token_role(request) == self.role)


class IsDoctor(_RolePermission):
    role = DepartmentRole.Role.DOCTOR


class IsNurse(_RolePermission):
    role = DepartmentRole.Role.NURSE


class IsTechnologist(_RolePermission):
    role = DepartmentRole.Role.TECHNOLOGIST


class IsMedicalStaff(_RolePermission):
    role = DepartmentRole.Role.MEDICAL_STAFF
