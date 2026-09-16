import json
from urllib.request import Request, urlopen

from django.conf import settings


class TnmMInferenceError(RuntimeError):
    pass


def _fetch_id_token():
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token
        request = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(request, settings.TNM_M_SERVICE_URL)
    except Exception as exc:
        raise TnmMInferenceError("TNM M service 인증 토큰을 발급하지 못했습니다.") from exc


def request_tnm_m_analysis(*, case_id, ct_gcs_uri, pet_dicom_gcs_prefix, pet_series_instance_uid):
    if not settings.TNM_M_SERVICE_URL:
        raise TnmMInferenceError("TNM_M_SERVICE_URL 설정이 필요합니다.")
    body = {
        "case_id": str(case_id),
        "ct_gcs_uri": ct_gcs_uri,
        "pet_dicom_gcs_prefix": pet_dicom_gcs_prefix,
        "pet_series_instance_uid": pet_series_instance_uid,
    }
    headers = {"Content-Type": "application/json"}
    if settings.TNM_M_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"
    request = Request(
        f"{settings.TNM_M_SERVICE_URL}/v1/analyze",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.TNM_M_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise TnmMInferenceError("TNM M service 호출에 실패했습니다.") from exc
    if not isinstance(payload, dict) or payload.get("status") != "SUCCEEDED" or "m_candidate" not in payload:
        raise TnmMInferenceError("TNM M service 응답이 유효하지 않습니다.")
    return payload
