import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class TnmStageInferenceError(RuntimeError):
    pass


def _fetch_id_token():
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token

        return google.oauth2.id_token.fetch_id_token(
            google.auth.transport.requests.Request(), settings.TNM_SERVICE_URL
        )
    except Exception as exc:
        raise TnmStageInferenceError("TNM Stage service authentication token could not be issued.") from exc


def _category(value):
    if not isinstance(value, str) or not value.strip():
        raise TnmStageInferenceError("A confirmed TNM category is required.")
    return value.strip().upper()


def request_tnm_stage(*, t_category, n_category, m_category, patient_id=None):
    if not settings.TNM_SERVICE_URL:
        raise TnmStageInferenceError("TNM_SERVICE_URL must be configured.")
    body = {
        "t_candidate": _category(t_category),
        "n_candidate": _category(n_category),
        "m_candidate": _category(m_category),
    }
    if patient_id is not None:
        body["patient_id"] = str(patient_id)
    headers = {"Content-Type": "application/json"}
    if settings.TNM_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"
    request = Request(
        f"{settings.TNM_SERVICE_URL}/v1/stage",
        data=json.dumps(body).encode("utf-8"), headers=headers, method="POST",
    )
    try:
        with urlopen(request, timeout=settings.TNM_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise TnmStageInferenceError("TNM Stage service request failed.") from exc
    required = {
        "t_candidate", "n_candidate", "m_candidate", "ctnm_candidate",
        "stage_group_candidate", "stage_group_status", "warnings",
        "finalization_status", "clinical_use_warning", "patient_id",
        "component_evidence", "discordance_flags",
    }
    if not isinstance(payload, dict) or not required.issubset(payload):
        raise TnmStageInferenceError("TNM Stage service returned an invalid response.")
    if not isinstance(payload["warnings"], list) or payload["stage_group_status"] not in {"candidate_ready", "indeterminate"}:
        raise TnmStageInferenceError("TNM Stage service returned an invalid status payload.")
    return payload
