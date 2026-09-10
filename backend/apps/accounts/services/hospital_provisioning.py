from django.db import transaction

from ..constants import DEFAULT_DEPARTMENT_TEMPLATES
from ..models import Department, DepartmentRole, Hospital


@transaction.atomic
def provision_hospital(**hospital_data):
    hospital = Hospital.objects.create(**hospital_data)

    for department_template in DEFAULT_DEPARTMENT_TEMPLATES:
        department = Department.objects.create(
            hospital=hospital,
            code=department_template.code,
            name=department_template.name,
        )
        for role_template in department_template.roles:
            DepartmentRole.objects.create(
                department=department,
                role=role_template.role,
                display_name=role_template.display_name,
            )

    return hospital
