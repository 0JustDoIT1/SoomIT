from django.db import transaction

from ..models import HospitalAdmin, User


@transaction.atomic
def provision_hospital_admin(*, hospital, login_id, name, password):
    user = User.objects.create_user(
        login_id=login_id,
        password=password,
        name=name,
        account_status=User.AccountStatus.ACTIVE,
    )
    HospitalAdmin.objects.create(user=user, hospital=hospital)
    return user
