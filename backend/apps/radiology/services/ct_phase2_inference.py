import json
from urllib.request import Request, urlopen

from django.conf import settings


class CtPhase2InferenceError(RuntimeError):
    pass


def _fetch_id_token():
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token

        request = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(request, settings.CT_ANALYSIS_PHASE2_SERVICE_URL)
    except Exception as exc:
        raise CtPhase2InferenceError("CT Phase2 service authentication token could not be issued.") from exc


def request_ct_phase2_analysis(**body):
    if not settings.CT_ANALYSIS_PHASE2_SERVICE_URL:
        raise CtPhase2InferenceError("CT_ANALYSIS_PHASE2_SERVICE_URL must be configured.")
    headers = {"Content-Type": "application/json"}
    if settings.CT_ANALYSIS_PHASE2_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"
    request = Request(
        f"{settings.CT_ANALYSIS_PHASE2_SERVICE_URL}/v1/phase2",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.CT_ANALYSIS_PHASE2_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise CtPhase2InferenceError("CT Phase2 service request failed.") from exc
    if (
        not isinstance(payload, dict)
        or payload.get("status") != "READY_FOR_N_MODEL"
        or not isinstance(payload.get("n_input_uri"), str)
        or not payload["n_input_uri"].startswith("gs://")
    ):
        raise CtPhase2InferenceError("CT Phase2 service returned an invalid response.")
    return payload
