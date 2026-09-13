import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class PDL1InferenceError(RuntimeError):
    pass


CLASS_TO_RANGE = {
    0: "LT_1",
    1: "FROM_1_TO_49",
    2: "GE_50",
}


def _fetch_id_token():
    import google.auth.transport.requests
    import google.oauth2.id_token

    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(
        request,
        settings.PDL1_INFERENCE_SERVICE_URL,
    )


def _validate_probability(value, field_name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PDL1InferenceError(f"추론 응답의 {field_name} 값이 숫자가 아닙니다.")
    value = float(value)
    if not 0 <= value <= 1:
        raise PDL1InferenceError(f"추론 응답의 {field_name} 값이 0~1 범위가 아닙니다.")
    return value


def validate_prediction(payload):
    if not isinstance(payload, dict):
        raise PDL1InferenceError("추론 서비스가 JSON 객체를 반환하지 않았습니다.")

    predicted_class = payload.get("predicted_class")
    if isinstance(predicted_class, bool) or predicted_class not in CLASS_TO_RANGE:
        raise PDL1InferenceError("추론 응답의 predicted_class가 유효하지 않습니다.")
    expected_range = CLASS_TO_RANGE[predicted_class]
    if payload.get("predicted_tps_range") != expected_range:
        raise PDL1InferenceError("추론 클래스와 TPS 구간이 일치하지 않습니다.")

    confidence = _validate_probability(payload.get("confidence"), "confidence")
    raw_probabilities = payload.get("probabilities")
    if not isinstance(raw_probabilities, dict):
        raise PDL1InferenceError("추론 응답에 probabilities가 없습니다.")
    probabilities = {
        key: _validate_probability(raw_probabilities.get(key), f"probabilities.{key}")
        for key in ("class_0", "class_1", "class_2")
    }
    if abs(sum(probabilities.values()) - 1) > 1e-5:
        raise PDL1InferenceError("추론 확률의 합이 1이 아닙니다.")
    if abs(confidence - probabilities[f"class_{predicted_class}"]) > 1e-6:
        raise PDL1InferenceError("confidence가 예측 클래스 확률과 일치하지 않습니다.")

    return {
        **payload,
        "predicted_class": predicted_class,
        "predicted_tps_range": expected_range,
        "confidence": confidence,
        "probabilities": probabilities,
    }


def request_pdl1_prediction(feature_content):
    headers = {"Content-Type": "application/octet-stream"}
    if settings.PDL1_INFERENCE_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"
    request = Request(
        f"{settings.PDL1_INFERENCE_SERVICE_URL}/v1/predict",
        data=feature_content,
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(
            request,
            timeout=settings.PDL1_INFERENCE_TIMEOUT_SECONDS,
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise PDL1InferenceError(
            f"추론 서비스가 요청을 거부했습니다. (HTTP {exc.code})",
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise PDL1InferenceError("추론 서비스에 연결할 수 없습니다.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PDL1InferenceError("추론 서비스 응답이 올바른 JSON이 아닙니다.") from exc

    return validate_prediction(payload)
