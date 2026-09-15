import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class PathologyInferenceError(RuntimeError):
    pass


TISSUE_LABELS = {"Benign", "LUAD", "LUSC"}
GENE_STATUSES = {"SUCCEEDED", "REVIEW_REQUIRED_TISSUE_UNCERTAIN", "NOT_APPLICABLE_NON_LUAD"}


def _fetch_id_token():
    import google.auth.transport.requests
    import google.oauth2.id_token

    return google.oauth2.id_token.fetch_id_token(
        google.auth.transport.requests.Request(),
        settings.PATHOLOGY_ANALYSIS_SERVICE_URL,
    )


def _probability(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= float(value) <= 1:
        raise PathologyInferenceError(f"{field} must be a probability between 0 and 1.")
    return float(value)


def validate_pathology_prediction(payload):
    if not isinstance(payload, dict) or payload.get("status") != "ok":
        raise PathologyInferenceError("Pathology service returned an invalid response.")
    tissue = payload.get("tissue")
    gene = payload.get("gene")
    embedding = payload.get("embedding")
    if not isinstance(tissue, dict) or tissue.get("predicted_label") not in TISSUE_LABELS:
        raise PathologyInferenceError("Pathology response has an invalid tissue prediction.")
    confidence = _probability(tissue.get("confidence_score"), "tissue.confidence_score")
    probabilities = tissue.get("probabilities")
    if not isinstance(probabilities, dict) or set(probabilities) != TISSUE_LABELS:
        raise PathologyInferenceError("Pathology response has invalid tissue probabilities.")
    normalized_probabilities = {
        label: _probability(probabilities[label], f"tissue.probabilities.{label}")
        for label in TISSUE_LABELS
    }
    if abs(sum(normalized_probabilities.values()) - 1) > 1e-5:
        raise PathologyInferenceError("Tissue probabilities do not sum to 1.")
    if abs(confidence - normalized_probabilities[tissue["predicted_label"]]) > 1e-5:
        raise PathologyInferenceError("Tissue confidence does not match the predicted class.")
    if not isinstance(gene, dict) or gene.get("status") not in GENE_STATUSES:
        raise PathologyInferenceError("Pathology response has an invalid gene status.")
    predictions = gene.get("predictions")
    if tissue["predicted_label"] == "LUAD":
        if not isinstance(predictions, dict) or not predictions:
            raise PathologyInferenceError("LUAD response is missing gene predictions.")
        for symbol, prediction in predictions.items():
            if not isinstance(symbol, str) or not symbol or not isinstance(prediction, dict):
                raise PathologyInferenceError("Gene prediction has an invalid shape.")
            prediction["probability"] = _probability(
                prediction.get("probability"), f"gene.predictions.{symbol}.probability"
            )
    elif predictions is not None:
        raise PathologyInferenceError("Non-LUAD response must not contain gene predictions.")
    if not isinstance(embedding, dict) or embedding.get("dimension") != 1536:
        raise PathologyInferenceError("Pathology response has invalid embedding metadata.")
    return payload


def request_pathology_prediction(*, case_id, patient_id, wsi_id, wsi_gcs_uri):
    if not settings.PATHOLOGY_ANALYSIS_SERVICE_URL:
        raise PathologyInferenceError("PATHOLOGY_ANALYSIS_SERVICE_URL is not configured.")
    headers = {"Content-Type": "application/json"}
    if settings.PATHOLOGY_ANALYSIS_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"
    request = Request(
        f"{settings.PATHOLOGY_ANALYSIS_SERVICE_URL}/v1/predict",
        data=json.dumps({
            "case_id": str(case_id),
            "patient_id": str(patient_id),
            "wsi_id": str(wsi_id),
            "wsi_gcs_uri": wsi_gcs_uri,
            "include_heatmap": False,
        }).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.PATHOLOGY_ANALYSIS_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise PathologyInferenceError(f"Pathology service rejected the request (HTTP {exc.code}).") from exc
    except (URLError, TimeoutError) as exc:
        raise PathologyInferenceError("Pathology service is unreachable.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PathologyInferenceError("Pathology service returned invalid JSON.") from exc
    return validate_pathology_prediction(payload)
