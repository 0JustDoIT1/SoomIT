import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class TnmTInferenceError(RuntimeError):
    pass


logger = logging.getLogger(__name__)


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
    logger.info(
        "[TNM:T] request started target=%s timeout=%s",
        f"{settings.TNM_T_SERVICE_URL}/v1/predict",
        settings.TNM_T_SERVICE_TIMEOUT_SECONDS,
    )
    try:
        with urlopen(request, timeout=settings.TNM_T_SERVICE_TIMEOUT_SECONDS) as response:
            raw_body = response.read().decode("utf-8")
            logger.info("[TNM:T] HTTP %s response received", response.status)
            try:
                payload = json.loads(raw_body)
            except json.JSONDecodeError:
                logger.exception("[TNM:T] JSON parse failed")
                raise
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        logger.error("[TNM:T] HTTP %s body=%s", exc.code, body)
        raise TnmTInferenceError("TNM T service request failed.") from exc
    except (URLError, TimeoutError) as exc:
        logger.error("[TNM:T] request failed type=%s message=%s", type(exc).__name__, exc)
        raise TnmTInferenceError("TNM T service request failed.") from exc
    except Exception as exc:
        logger.exception("[TNM:T] request failed type=%s message=%s", type(exc).__name__, exc)
        raise TnmTInferenceError("TNM T service request failed.") from exc
    if not isinstance(payload, dict):
        logger.error("[TNM:T] response validation failed: body is not an object")
        raise TnmTInferenceError("TNM T service returned an invalid response.")
    if payload.get("status") != "completed":
        logger.error("[TNM:T] response validation failed: status=%s", payload.get("status"))
        raise TnmTInferenceError("TNM T service returned an invalid response.")
    if not isinstance(payload.get("tumor_mask_uri"), str) or not payload["tumor_mask_uri"].startswith("gs://"):
        logger.error("[TNM:T] response validation failed: tumor_mask_uri missing or invalid")
        raise TnmTInferenceError("TNM T service returned an invalid response.")
    return payload
