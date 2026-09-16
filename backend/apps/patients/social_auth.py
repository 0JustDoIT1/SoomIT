from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token


class SocialAuthenticationError(Exception):
    pass


def verify_google_id_token(raw_id_token):
    client_id = settings.PATIENT_GOOGLE_CLIENT_ID

    if not client_id:
        raise ImproperlyConfigured(
            "PATIENT_GOOGLE_CLIENT_ID가 설정되지 않았습니다."
        )

    if not raw_id_token:
        raise SocialAuthenticationError(
            "Google ID token이 필요합니다."
        )

    try:
        claims = id_token.verify_oauth2_token(
            raw_id_token,
            GoogleRequest(),
            client_id,
        )
    except ValueError as exc:
        raise SocialAuthenticationError(
            "유효하지 않은 Google ID token입니다."
        ) from exc

    provider_uid = claims.get("sub")

    if not provider_uid:
        raise SocialAuthenticationError(
            "Google 계정 식별정보가 없습니다."
        )

    return {
        "provider": "GOOGLE",
        "provider_uid": provider_uid,
        "email": claims.get("email"),
        "email_verified": claims.get(
            "email_verified",
            False,
        ),
        "name": claims.get("name"),
    }