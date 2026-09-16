import json
from urllib.request import Request, urlopen

from django.conf import settings
from google.cloud import storage


class TnmNInferenceError(RuntimeError):
    pass


def _gcs_parts(uri):
    if not isinstance(uri, str) or not uri.startswith("gs://"):
        raise TnmNInferenceError("N input must be a gs:// URI.")
    bucket, separator, object_name = uri[5:].partition("/")
    if not bucket or not separator or not object_name:
        raise TnmNInferenceError("N input URI must include a bucket and object.")
    return bucket, object_name


def _fetch_id_token():
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token

        request = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(request, settings.TNM_SERVICE_URL)
    except Exception as exc:
        raise TnmNInferenceError("TNM N service authentication token could not be issued.") from exc


def load_n_input(uri):
    bucket, object_name = _gcs_parts(uri)
    try:
        raw = storage.Client().bucket(bucket).blob(object_name).download_as_bytes()
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise TnmNInferenceError("N input could not be read from GCS.") from exc
    feature_order = payload.get("feature_order") if isinstance(payload, dict) else None
    features = payload.get("features") if isinstance(payload, dict) else None
    if (
        not isinstance(features, dict)
        or payload.get("feature_count") != 34
        or not isinstance(feature_order, list)
        or len(feature_order) != 34
        or len(set(feature_order)) != 34
        or set(feature_order) != set(features)
    ):
        raise TnmNInferenceError("CT Phase2 did not produce the canonical 34-feature N input.")
    return payload


def request_tnm_n_analysis(*, patient_id, features):
    if not settings.TNM_SERVICE_URL:
        raise TnmNInferenceError("TNM_SERVICE_URL must be configured.")
    body = {"patient_id": str(patient_id), "features": features}
    headers = {"Content-Type": "application/json"}
    if settings.TNM_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"
    request = Request(
        f"{settings.TNM_SERVICE_URL}/v1/n/predict",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.TNM_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise TnmNInferenceError("TNM N service request failed.") from exc
    required = {
        "nplus_probability", "risk_tier", "review_threshold", "elevated_threshold",
        "may_assign_cn", "categorical_ood_warning", "physician_review_required",
    }
    if not isinstance(payload, dict) or not required.issubset(payload):
        raise TnmNInferenceError("TNM N service returned an invalid response.")
    return payload
