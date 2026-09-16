import hashlib

from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import (
    AllowAny,
    IsAuthenticated,
)
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_serializers import (
    GoogleSocialLoginSerializer,
    PatientRegistrationSerializer,
    PatientTokenRefreshSerializer,
    PatientLinkSerializer,
)
from .models import (
    Patient,
    PatientAccount,
    SocialAccount,
)
from .patient_tokens import (
    decode_patient_refresh_token,
    decode_social_registration_token,
    issue_patient_tokens,
    issue_social_registration_token,
)
from .social_auth import (
    SocialAuthenticationError,
    verify_google_id_token,
)

from .patient_authentication import (
    PatientJWTAuthentication,
)
@extend_schema(
    tags=["환자앱-인증"],
    summary="Google 소셜 로그인",
    description=(
        "Google ID token을 검증하고 기존 회원이면 환자용 JWT를, "
        "신규 회원이면 기본정보 입력용 임시 토큰을 발급합니다."
    ),
    request=GoogleSocialLoginSerializer,
)
class PatientGoogleLoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleSocialLoginSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        raw_id_token = serializer.validated_data[
            "id_token"
        ]

        try:
            identity = verify_google_id_token(
                raw_id_token
            )
        except SocialAuthenticationError as exc:
            return Response(
                {
                    "code": "invalid_google_token",
                    "detail": str(exc),
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except ImproperlyConfigured:
            return Response(
                {
                    "code": "patient_auth_not_configured",
                    "detail": (
                        "환자 로그인 설정이 완료되지 않았습니다."
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        social_account = (
            SocialAccount.objects
            .select_related(
                "patient_account",
                "patient_account__patient",
            )
            .filter(
                provider=SocialAccount.Provider.GOOGLE,
                provider_uid=identity["provider_uid"],
            )
            .first()
        )

        if social_account is None:
            registration = (
                issue_social_registration_token(
                    identity
                )
            )

            return Response(
                {
                    "status": "REGISTRATION_REQUIRED",
                    "provider": "GOOGLE",
                    "registration_token": registration[
                        "registration_token"
                    ],
                    "registration_expires_at": registration[
                        "expires_at"
                    ],
                    "profile": {
                        "name": identity.get("name"),
                        "email": identity.get("email"),
                    },
                },
                status=status.HTTP_200_OK,
            )

        patient_account = (
            social_account.patient_account
        )

        if (
            patient_account.link_status
            == PatientAccount.LinkStatus.REJECTED
        ):
            return Response(
                {
                    "code": "patient_account_rejected",
                    "detail": (
                        "사용할 수 없는 환자 계정입니다."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            patient_account.link_status
            == PatientAccount.LinkStatus.LINKED
            and patient_account.patient_id is None
        ):
            return Response(
                {
                    "code": "invalid_patient_link",
                    "detail": (
                        "환자 연결 정보를 확인해주세요."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        tokens = issue_patient_tokens(
            patient_account
        )

        is_linked = (
            patient_account.link_status
            == PatientAccount.LinkStatus.LINKED
            and patient_account.patient_id is not None
        )

        return Response(
            {
                "status": "AUTHENTICATED",
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "access_expires_at": tokens[
                    "access_expires_at"
                ],
                "patient_account": {
                    "id": str(patient_account.id),
                    "link_status": (
                        patient_account.link_status
                    ),
                    "is_linked": is_linked,
                },
            },
            status=status.HTTP_200_OK,
        )

@extend_schema(
    tags=["환자앱-인증"],
    summary="환자앱 회원가입",
    description=(
        "검증된 소셜 회원가입 토큰과 기본정보를 사용해 "
        "PatientAccount와 SocialAccount를 생성합니다."
    ),
    request=PatientRegistrationSerializer,
)
class PatientRegistrationAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PatientRegistrationSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            identity = (
                decode_social_registration_token(
                    data["registration_token"]
                )
            )
        except ValueError as exc:
            return Response(
                {
                    "code": "invalid_registration_token",
                    "detail": str(exc),
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        normalized_phone = data["phone_number"]

        phone_number_hash = hashlib.sha256(
            normalized_phone.encode("utf-8")
        ).hexdigest()

        if SocialAccount.objects.filter(
            provider=identity["provider"],
            provider_uid=identity["provider_uid"],
        ).exists():
            return Response(
                {
                    "code": "social_account_exists",
                    "detail": (
                        "이미 가입된 소셜 계정입니다."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        if PatientAccount.objects.filter(
            phone_number_hash=phone_number_hash
        ).exists():
            return Response(
                {
                    "code": "phone_number_exists",
                    "detail": (
                        "이미 가입에 사용된 "
                        "휴대전화번호입니다."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        patient = None
        patient_code = data.get("patient_code", "")

        if patient_code:
            matching_patients = Patient.objects.filter(
                patient_code=patient_code,
                name=data["name"],
                birth_date=data["birth_date"],
                sex=data["sex"],
                phone_number_hash=phone_number_hash,
            )

            matching_count = matching_patients.count()

            if matching_count == 0:
                return Response(
                    {
                        "code": "patient_verification_failed",
                        "detail": (
                            "입력한 정보와 일치하는 "
                            "환자정보를 찾을 수 없습니다."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if matching_count > 1:
                return Response(
                    {
                        "code": "patient_code_ambiguous",
                        "detail": (
                            "동일한 환자코드가 여러 병원에 "
                            "등록되어 있습니다."
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            patient = matching_patients.first()

            if PatientAccount.objects.filter(
                patient=patient
            ).exists():
                return Response(
                    {
                        "code": "patient_already_linked",
                        "detail": (
                            "이미 다른 계정에 연결된 "
                            "환자정보입니다."
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        link_status = (
            PatientAccount.LinkStatus.LINKED
            if patient is not None
            else PatientAccount.LinkStatus.UNLINKED
        )

        try:
            with transaction.atomic():
                patient_account = (
                    PatientAccount.objects.create(
                        patient=patient,
                        name=data["name"],
                        birth_date=data["birth_date"],
                        sex=data["sex"],
                        phone_number=normalized_phone,
                        phone_number_hash=(
                            phone_number_hash
                        ),
                        phone_verified_at=None,
                        postal_code=data["postal_code"],
                        address=data["address"],
                        address_detail=(
                            data["address_detail"]
                        ),
                        link_status=link_status,
                        linked_at=(
                            timezone.now()
                            if patient is not None
                            else None
                        ),
                    )
                )

                SocialAccount.objects.create(
                    patient_account=patient_account,
                    provider=identity["provider"],
                    provider_uid=(
                        identity["provider_uid"]
                    ),
                )
        except IntegrityError:
            return Response(
                {
                    "code": "registration_conflict",
                    "detail": (
                        "이미 사용 중인 회원정보입니다."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        tokens = issue_patient_tokens(
            patient_account
        )

        return Response(
            {
                "status": "REGISTERED",
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "access_expires_at": tokens[
                    "access_expires_at"
                ],
                "patient_account": {
                    "id": str(patient_account.id),
                    "link_status": link_status,
                    "is_linked": patient is not None,
                },
            },
            status=status.HTTP_201_CREATED,
        )
        
@extend_schema(
    tags=["환자앱-인증"],
    summary="환자 access token 재발급",
    description=(
        "유효한 환자용 refresh token을 검증하고 "
        "새 access/refresh token을 발급합니다."
    ),
    request=PatientTokenRefreshSerializer,
)
class PatientTokenRefreshAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PatientTokenRefreshSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        raw_refresh_token = serializer.validated_data[
            "refresh"
        ]

        try:
            token_data = decode_patient_refresh_token(
                raw_refresh_token
            )
        except ValueError as exc:
            return Response(
                {
                    "code": "invalid_refresh_token",
                    "detail": str(exc),
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except ImproperlyConfigured:
            return Response(
                {
                    "code": "patient_auth_not_configured",
                    "detail": (
                        "환자 로그인 설정이 완료되지 않았습니다."
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        patient_account = (
            PatientAccount.objects
            .select_related("patient")
            .filter(
                id=token_data["patient_account_id"]
            )
            .first()
        )

        if patient_account is None:
            return Response(
                {
                    "code": "patient_account_not_found",
                    "detail": "환자 계정을 찾을 수 없습니다.",
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if (
            patient_account.link_status
            == PatientAccount.LinkStatus.REJECTED
        ):
            return Response(
                {
                    "code": "patient_account_rejected",
                    "detail": "사용할 수 없는 환자 계정입니다.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            patient_account.link_status
            == PatientAccount.LinkStatus.LINKED
            and patient_account.patient_id is None
        ):
            return Response(
                {
                    "code": "invalid_patient_link",
                    "detail": "환자 연결 정보를 확인해주세요.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        tokens = issue_patient_tokens(
            patient_account
        )

        return Response(
            {
                "status": "TOKEN_REFRESHED",
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "access_expires_at": tokens[
                    "access_expires_at"
                ],
            },
            status=status.HTTP_200_OK,
        )
        
@extend_schema(
    tags=["환자앱-인증"],
    summary="기존 환자정보 연결",
    description=(
        "로그인한 미연결 환자 계정의 기본정보와 "
        "환자코드를 검증하여 기존 Patient와 연결합니다."
    ),
    request=PatientLinkSerializer,
)
class PatientLinkAPIView(APIView):
    authentication_classes = [
        PatientJWTAuthentication,
    ]
    permission_classes = [
        IsAuthenticated,
    ]

    def post(self, request):
        serializer = PatientLinkSerializer(
            data=request.data
        )
        serializer.is_valid(
            raise_exception=True
        )

        patient_code = (
            serializer.validated_data[
                "patient_code"
            ]
        )

        try:
            with transaction.atomic():
                patient_account = (
                    PatientAccount.objects
                    .select_for_update()
                    .get(
                        id=(
                            request.user
                            .patient_account
                            .id
                        )
                    )
                )

                if (
                    patient_account.link_status
                    == PatientAccount
                    .LinkStatus
                    .LINKED
                    and patient_account.patient_id
                    is not None
                ):
                    return Response(
                        {
                            "code": (
                                "patient_already_linked"
                            ),
                            "detail": (
                                "이미 환자정보가 "
                                "연결되어 있습니다."
                            ),
                        },
                        status=(
                            status.HTTP_409_CONFLICT
                        ),
                    )

                if (
                    patient_account.link_status
                    != PatientAccount
                    .LinkStatus
                    .UNLINKED
                ):
                    return Response(
                        {
                            "code": (
                                "patient_link_not_allowed"
                            ),
                            "detail": (
                                "현재 계정 상태에서는 "
                                "환자정보를 연결할 수 없습니다."
                            ),
                        },
                        status=(
                            status.HTTP_409_CONFLICT
                        ),
                    )

                matching_patients = (
                    Patient.objects
                    .select_for_update()
                    .filter(
                        patient_code=patient_code,
                        name=patient_account.name,
                        birth_date=(
                            patient_account.birth_date
                        ),
                        sex=patient_account.sex,
                        phone_number_hash=(
                            patient_account
                            .phone_number_hash
                        ),
                    )
                )

                matching_count = (
                    matching_patients.count()
                )

                if matching_count == 0:
                    return Response(
                        {
                            "code": (
                                "patient_verification_failed"
                            ),
                            "detail": (
                                "가입정보와 일치하는 "
                                "환자정보를 찾을 수 없습니다."
                            ),
                        },
                        status=(
                            status.HTTP_400_BAD_REQUEST
                        ),
                    )

                if matching_count > 1:
                    return Response(
                        {
                            "code": (
                                "patient_code_ambiguous"
                            ),
                            "detail": (
                                "동일한 환자코드가 여러 "
                                "병원에 등록되어 있습니다."
                            ),
                        },
                        status=(
                            status.HTTP_409_CONFLICT
                        ),
                    )

                patient = matching_patients.first()

                already_linked = (
                    PatientAccount.objects
                    .filter(patient=patient)
                    .exclude(id=patient_account.id)
                    .exists()
                )

                if already_linked:
                    return Response(
                        {
                            "code": (
                                "patient_already_linked"
                            ),
                            "detail": (
                                "이미 다른 계정에 연결된 "
                                "환자정보입니다."
                            ),
                        },
                        status=(
                            status.HTTP_409_CONFLICT
                        ),
                    )

                patient_account.patient = patient
                patient_account.link_status = (
                    PatientAccount
                    .LinkStatus
                    .LINKED
                )
                patient_account.linked_at = (
                    timezone.now()
                )
                patient_account.save(
                    update_fields=[
                        "patient",
                        "link_status",
                        "linked_at",
                        "updated_at",
                    ]
                )

        except IntegrityError:
            return Response(
                {
                    "code": "patient_link_conflict",
                    "detail": (
                        "환자정보가 이미 다른 "
                        "계정에 연결되어 있습니다."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        tokens = issue_patient_tokens(
            patient_account
        )

        return Response(
            {
                "status": "LINKED",
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "access_expires_at": tokens[
                    "access_expires_at"
                ],
                "patient_account": {
                    "id": str(patient_account.id),
                    "patient_id": str(
                        patient_account.patient_id
                    ),
                    "link_status": (
                        patient_account.link_status
                    ),
                    "is_linked": True,
                },
            },
            status=status.HTTP_200_OK,
        )