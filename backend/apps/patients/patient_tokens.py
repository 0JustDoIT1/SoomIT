import uuid
from datetime import timedelta

import jwt
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone


def _get_signing_key():
    signing_key = settings.PATIENT_JWT_SIGNING_KEY

    if not signing_key:
        raise ImproperlyConfigured(
            "PATIENT_JWT_SIGNING_KEY가 설정되지 않았습니다."
        )

    return signing_key


def _encode(payload):
    return jwt.encode(
        payload,
        _get_signing_key(),
        algorithm=settings.PATIENT_JWT_ALGORITHM,
    )


def issue_patient_tokens(patient_account):
    now = timezone.now()

    access_expires_at = now + timedelta(
        minutes=settings.PATIENT_ACCESS_TOKEN_MINUTES
    )
    refresh_expires_at = now + timedelta(
        days=settings.PATIENT_REFRESH_TOKEN_DAYS
    )

    common_claims = {
        "sub": str(patient_account.id),
        "actor": "PATIENT",
        "iss": settings.PATIENT_JWT_ISSUER,
        "aud": settings.PATIENT_JWT_AUDIENCE,
        "iat": now,
    }

    access_token = _encode(
        {
            **common_claims,
            "type": "access",
            "jti": str(uuid.uuid4()),
            "exp": access_expires_at,
        }
    )

    refresh_token = _encode(
        {
            **common_claims,
            "type": "refresh",
            "jti": str(uuid.uuid4()),
            "exp": refresh_expires_at,
        }
    )

    return {
        "access": access_token,
        "refresh": refresh_token,
        "access_expires_at": access_expires_at,
    }


def issue_social_registration_token(identity):
    now = timezone.now()
    expires_at = now + timedelta(minutes=10)

    token = _encode(
        {
            "sub": identity["provider_uid"],
            "type": "social_registration",
            "provider": identity["provider"],
            "email": identity.get("email"),
            "name": identity.get("name"),
            "iss": settings.PATIENT_JWT_ISSUER,
            "aud": settings.PATIENT_JWT_AUDIENCE,
            "iat": now,
            "exp": expires_at,
            "jti": str(uuid.uuid4()),
        }
    )

    return {
        "registration_token": token,
        "expires_at": expires_at,
    }
    
def decode_social_registration_token(token):
    if not token:
        raise ValueError(
            "회원가입 인증정보가 필요합니다."
        )

    try:
        payload = jwt.decode(
            token,
            _get_signing_key(),
            algorithms=[
                settings.PATIENT_JWT_ALGORITHM
            ],
            issuer=settings.PATIENT_JWT_ISSUER,
            audience=settings.PATIENT_JWT_AUDIENCE,
            options={
                "require": [
                    "sub",
                    "type",
                    "iat",
                    "exp",
                    "jti",
                ],
            },
        )
    except jwt.PyJWTError as exc:
        raise ValueError(
            "회원가입 인증정보가 만료되었거나 "
            "유효하지 않습니다."
        ) from exc

    if payload.get("type") != "social_registration":
        raise ValueError(
            "회원가입용 인증정보가 아닙니다."
        )

    provider = payload.get("provider")
    provider_uid = payload.get("sub")

    if provider not in {
        "GOOGLE",
        "KAKAO",
        "NAVER",
    }:
        raise ValueError(
            "지원하지 않는 소셜 로그인입니다."
        )

    if not provider_uid:
        raise ValueError(
            "소셜 계정 식별정보가 없습니다."
        )

    return {
        "provider": provider,
        "provider_uid": provider_uid,
        "email": payload.get("email"),
        "name": payload.get("name"),
    }    
    
def decode_patient_refresh_token(token):
    if not token:
        raise ValueError(
            "refresh token이 필요합니다."
        )

    try:
        payload = jwt.decode(
            token,
            _get_signing_key(),
            algorithms=[
                settings.PATIENT_JWT_ALGORITHM,
            ],
            issuer=settings.PATIENT_JWT_ISSUER,
            audience=settings.PATIENT_JWT_AUDIENCE,
            options={
                "require": [
                    "sub",
                    "actor",
                    "type",
                    "iat",
                    "exp",
                    "jti",
                ],
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError(
            "refresh token이 만료되었습니다."
        ) from exc
    except jwt.PyJWTError as exc:
        raise ValueError(
            "refresh token이 유효하지 않습니다."
        ) from exc

    if payload.get("type") != "refresh":
        raise ValueError(
            "refresh token이 아닙니다."
        )

    if payload.get("actor") != "PATIENT":
        raise ValueError(
            "환자용 인증정보가 아닙니다."
        )

    patient_account_id = payload.get("sub")

    if not patient_account_id:
        raise ValueError(
            "환자 계정 식별정보가 없습니다."
        )

    try:
        uuid.UUID(patient_account_id)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "환자 계정 식별정보가 유효하지 않습니다."
        ) from exc

    return {
        "patient_account_id": patient_account_id,
        "jti": payload["jti"],
    }
    
def decode_patient_access_token(token):
    if not token:
        raise ValueError(
            "access token이 필요합니다."
        )

    try:
        payload = jwt.decode(
            token,
            _get_signing_key(),
            algorithms=[
                settings.PATIENT_JWT_ALGORITHM,
            ],
            issuer=settings.PATIENT_JWT_ISSUER,
            audience=settings.PATIENT_JWT_AUDIENCE,
            options={
                "require": [
                    "sub",
                    "actor",
                    "type",
                    "iat",
                    "exp",
                    "jti",
                ],
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError(
            "access token이 만료되었습니다."
        ) from exc
    except jwt.PyJWTError as exc:
        raise ValueError(
            "access token이 유효하지 않습니다."
        ) from exc

    if payload.get("type") != "access":
        raise ValueError(
            "access token이 아닙니다."
        )

    if payload.get("actor") != "PATIENT":
        raise ValueError(
            "환자용 인증정보가 아닙니다."
        )

    patient_account_id = payload.get("sub")

    if not patient_account_id:
        raise ValueError(
            "환자 계정 식별정보가 없습니다."
        )

    try:
        uuid.UUID(patient_account_id)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "환자 계정 식별정보가 유효하지 않습니다."
        ) from exc

    return {
        "patient_account_id": patient_account_id,
        "jti": payload["jti"],
    }
    