import json
from urllib.request import Request, urlopen

from django.conf import settings


class TnmTInferenceError(RuntimeError):
    pass


def _fetch_id_token():
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token

        request = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(request, settings.TNM_T_SERVICE_URL)
    except Exception as exc:
        raise TnmTInferenceError("TNM T service authentication token could not be issued.") from exc


def request_tnm_t_analysis(*, case_id, t_input_uri):
    if not settings.TNM_T_SERVICE_URL:
        raise TnmTInferenceError("TNM_T_SERVICE_URL must be configured.")
    body = {"case_id": str(case_id), "t_input_uri": t_input_uri}
    headers = {"Content-Type": "application/json"}
    if settings.TNM_T_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"
    request = Request(
        f"{settings.TNM_T_SERVICE_URL}/v1/predict",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.TNM_T_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise TnmTInferenceError("TNM T service request failed.") from exc
    if (
        not isinstance(payload, dict)
        or payload.get("status") != "completed"
        or not isinstance(payload.get("tumor_mask_uri"), str)
        or not payload["tumor_mask_uri"].startswith("gs://")
    ):
        raise TnmTInferenceError("TNM T service returned an invalid response.")
    return payload
