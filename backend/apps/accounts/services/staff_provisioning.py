from django.db import transaction

from ..models import DepartmentRole, User


@transaction.atomic
def provision_staff(*, login_id, name, password, department_role: DepartmentRole):
    user = User.objects.create_user(
        login_id=login_id,
        name=name,
        password=password,
        account_status=User.AccountStatus.ACTIVE,
    )
    user.department_role = department_role
    user.save(update_fields=["department_role"])
    return user
