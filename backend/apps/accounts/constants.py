from dataclasses import dataclass

from .models import DepartmentRole


ADMINISTRATION_DEPARTMENT_CODE = "ADMINISTRATION"
RADIOLOGY_DEPARTMENT_CODE = "RADIOLOGY"
PATHOLOGY_DEPARTMENT_CODE = "PATHOLOGY"
PULMONOLOGY_DEPARTMENT_CODE = "PULMONOLOGY"


@dataclass(frozen=True)
class DefaultRoleTemplate:
    role: DepartmentRole.Role
    display_name: str


@dataclass(frozen=True)
class DefaultDepartmentTemplate:
    code: str
    name: str
    roles: tuple[DefaultRoleTemplate, ...]


DEFAULT_DEPARTMENT_TEMPLATES = (
    DefaultDepartmentTemplate(
        code=ADMINISTRATION_DEPARTMENT_CODE,
        name="원무과",
        roles=(
            DefaultRoleTemplate(
                role=DepartmentRole.Role.MEDICAL_STAFF,
                display_name="원무 직원",
            ),
        ),
    ),
    DefaultDepartmentTemplate(
        code=RADIOLOGY_DEPARTMENT_CODE,
        name="영상의학과",
        roles=(
            DefaultRoleTemplate(
                role=DepartmentRole.Role.TECHNOLOGIST,
                display_name="방사선사",
            ),
        ),
    ),
    DefaultDepartmentTemplate(
        code=PATHOLOGY_DEPARTMENT_CODE,
        name="병리과",
        roles=(
            DefaultRoleTemplate(
                role=DepartmentRole.Role.TECHNOLOGIST,
                display_name="임상병리사",
            ),
        ),
    ),
    DefaultDepartmentTemplate(
        code=PULMONOLOGY_DEPARTMENT_CODE,
        name="호흡기내과",
        roles=(
            DefaultRoleTemplate(
                role=DepartmentRole.Role.DOCTOR,
                display_name="호흡기내과 의사",
            ),
        ),
    ),
)
