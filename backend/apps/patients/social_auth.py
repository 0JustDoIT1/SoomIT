import requests

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token


class SocialAuthenticationError(Exception):
    pass


# =========================================================
# Google
# =========================================================

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


# =========================================================
# Kakao
# =========================================================

def verify_kakao_access_token(raw_access_token):
    kakao_app_id = getattr(
        settings,
        "PATIENT_KAKAO_APP_ID",
        None,
    )

    if not kakao_app_id:
        raise ImproperlyConfigured(
            "PATIENT_KAKAO_APP_ID가 설정되지 않았습니다."
        )

    if not raw_access_token:
        raise SocialAuthenticationError(
            "Kakao access token이 필요합니다."
        )

    headers = {
        "Authorization": f"Bearer {raw_access_token}",
    }

    # -----------------------------------------------------
    # 1. access token 자체 검증
    # -----------------------------------------------------

    try:
        token_response = requests.get(
            "https://kapi.kakao.com/v1/user/access_token_info",
            headers=headers,
            timeout=5,
        )
    except requests.RequestException as exc:
        raise SocialAuthenticationError(
            "카카오 인증 서버에 연결할 수 없습니다."
        ) from exc

    if token_response.status_code != 200:
        raise SocialAuthenticationError(
            "유효하지 않거나 만료된 Kakao access token입니다."
        )

    try:
        token_data = token_response.json()
    except ValueError as exc:
        raise SocialAuthenticationError(
            "카카오 토큰 검증 응답을 확인할 수 없습니다."
        ) from exc

    provider_uid = token_data.get("id")
    token_app_id = token_data.get("app_id")

    if provider_uid is None:
        raise SocialAuthenticationError(
            "Kakao 계정 식별정보가 없습니다."
        )

    # settings 값이 문자열이어도 비교 가능하도록 변환
    if str(token_app_id) != str(kakao_app_id):
        raise SocialAuthenticationError(
            "현재 앱에서 발급된 Kakao access token이 아닙니다."
        )

    # -----------------------------------------------------
    # 2. 사용자 정보 조회
    # -----------------------------------------------------

    try:
        user_response = requests.get(
            "https://kapi.kakao.com/v2/user/me",
            headers=headers,
            timeout=5,
        )
    except requests.RequestException as exc:
        raise SocialAuthenticationError(
            "카카오 사용자 정보를 조회할 수 없습니다."
        ) from exc

    if user_response.status_code != 200:
        raise SocialAuthenticationError(
            "카카오 사용자 정보를 조회할 수 없습니다."
        )

    try:
        user_data = user_response.json()
    except ValueError as exc:
        raise SocialAuthenticationError(
            "카카오 사용자 정보 응답을 확인할 수 없습니다."
        ) from exc

    user_id = user_data.get("id")

    if user_id is None:
        raise SocialAuthenticationError(
            "Kakao 사용자 식별정보가 없습니다."
        )

    # 토큰 정보의 회원번호와 user/me 결과가 동일한지 확인
    if str(user_id) != str(provider_uid):
        raise SocialAuthenticationError(
            "Kakao 사용자 식별정보가 일치하지 않습니다."
        )

    kakao_account = user_data.get("kakao_account") or {}

    profile = kakao_account.get("profile") or {}

    # 닉네임 동의를 사용하지 않으면 None일 수 있음
    name = profile.get("nickname")

    email = kakao_account.get("email")

    email_verified = (
        kakao_account.get("is_email_verified") is True
        and kakao_account.get("is_email_valid") is True
    )

    return {
        "provider": "KAKAO",
        "provider_uid": str(provider_uid),
        "email": email,
        "email_verified": email_verified,
        "name": name,
    }