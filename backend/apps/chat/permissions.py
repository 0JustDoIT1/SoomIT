import secrets

from django.conf import settings
from rest_framework.permissions import BasePermission

from apps.accounts.constants import (
    PATHOLOGY_DEPARTMENT_CODE,
    PULMONOLOGY_DEPARTMENT_CODE,
    RADIOLOGY_DEPARTMENT_CODE,
)
from apps.accounts.models import DepartmentRole, User


class IsRealtimeService(BasePermission):
    message = "Realtime service authentication failed."

    def has_permission(self, request, view):
        expected = settings.AI_SERVICE_TOKEN
        supplied = request.headers.get("X-Service-Token", "")
        return bool(expected and supplied) and secrets.compare_digest(supplied, expected)


def can_access_case_chat(user, case):
    """Apply the same case-chat policy for REST and realtime-backed requests."""
    if not (
        user
        and user.is_authenticated
        and user.account_status == User.AccountStatus.ACTIVE
        and user.department_role_id
    ):
        return False

    department_role = user.department_role
    department = department_role.department
    pulmonology_code = getattr(
        settings,
        "SOOMIT_PULMONOLOGY_DEPARTMENT_CODE",
        PULMONOLOGY_DEPARTMENT_CODE,
    )
    radiology_code = getattr(
        settings,
        "SOOMIT_RADIOLOGY_DEPARTMENT_CODE",
        RADIOLOGY_DEPARTMENT_CODE,
    )
    pathology_code = getattr(
        settings,
        "SOOMIT_PATHOLOGY_DEPARTMENT_CODE",
        PATHOLOGY_DEPARTMENT_CODE,
    )

    if (
        department.code == pulmonology_code
        and department_role.role == DepartmentRole.Role.DOCTOR
    ):
        return case.primary_doctor_id == user.id

    if (
        department.code in {radiology_code, pathology_code}
        and department_role.role == DepartmentRole.Role.TECHNOLOGIST
    ):
        return department.hospital_id == case.patient.hospital_id

    return False
