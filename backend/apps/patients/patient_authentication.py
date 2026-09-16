from rest_framework.authentication import (
    BaseAuthentication,
    get_authorization_header,
)
from rest_framework.exceptions import (
    AuthenticationFailed,
)

from .models import PatientAccount
from .patient_tokens import (
    decode_patient_access_token,
)


class PatientAccountPrincipal:
    def __init__(self, patient_account):
        self.patient_account = patient_account
        self.id = patient_account.id

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False


class PatientJWTAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        authorization = get_authorization_header(
            request
        ).split()

        if not authorization:
            return None

        try:
            scheme = authorization[0].decode(
                "utf-8"
            )
        except UnicodeError as exc:
            raise AuthenticationFailed(
                "인증 헤더가 유효하지 않습니다."
            ) from exc

        if scheme.lower() != self.keyword.lower():
            return None

        if len(authorization) != 2:
            raise AuthenticationFailed(
                "Bearer access token 형식이 올바르지 않습니다."
            )

        try:
            raw_access_token = authorization[1].decode(
                "utf-8"
            )
        except UnicodeError as exc:
            raise AuthenticationFailed(
                "access token 형식이 유효하지 않습니다."
            ) from exc

        try:
            token_data = decode_patient_access_token(
                raw_access_token
            )
        except ValueError as exc:
            raise AuthenticationFailed(
                str(exc)
            ) from exc

        patient_account = (
            PatientAccount.objects
            .select_related("patient")
            .filter(
                id=token_data["patient_account_id"]
            )
            .first()
        )

        if patient_account is None:
            raise AuthenticationFailed(
                "환자 계정을 찾을 수 없습니다."
            )

        if (
            patient_account.link_status
            == PatientAccount.LinkStatus.REJECTED
        ):
            raise AuthenticationFailed(
                "사용할 수 없는 환자 계정입니다."
            )

        if (
            patient_account.link_status
            == PatientAccount.LinkStatus.LINKED
            and patient_account.patient_id is None
        ):
            raise AuthenticationFailed(
                "환자 연결 정보가 유효하지 않습니다."
            )

        request.patient_account = patient_account

        principal = PatientAccountPrincipal(
            patient_account
        )

        return principal, token_data

    def authenticate_header(self, request):
        return self.keyword