import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class XrayInferenceError(RuntimeError):
    """Raised when the X-ray inference service cannot return a valid result."""


def _fetch_id_token():
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token

        request = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(request, settings.XRAY_SERVICE_URL)
    except Exception as exc:
        raise XrayInferenceError("X-ray 서비스 인증 토큰을 발급할 수 없습니다.") from exc


def _require_number(value, field_name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise XrayInferenceError(f"X-ray 응답의 {field_name} 값이 숫자가 아닙니다.")
    return value


def _require_mapping(value, field_name):
    if not isinstance(value, dict):
        raise XrayInferenceError(f"X-ray 응답의 {field_name} 값이 객체가 아닙니다.")
    return value


def _require_field(mapping, field_name):
    if field_name not in mapping:
        raise XrayInferenceError(f"X-ray 응답에 {field_name} 필드가 없습니다.")
    return mapping[field_name]


def validate_prediction(payload):
    """Validate the documented xray-serve response without transforming it."""
    payload = _require_mapping(payload, "최상위")
    _require_field(payload, "model_revision")
    image = _require_mapping(_require_field(payload, "image"), "image")
    _require_number(_require_field(image, "width"), "image.width")
    _require_number(_require_field(image, "height"), "image.height")

    classification = _require_mapping(
        _require_field(payload, "classification"), "classification"
    )
    for field_name in ("prediction", "class_index", "assessment", "suspicion_score", "probabilities"):
        _require_field(classification, field_name)
    _require_number(classification["class_index"], "classification.class_index")
    _require_number(classification["suspicion_score"], "classification.suspicion_score")
    _require_mapping(classification["probabilities"], "classification.probabilities")

    detections = _require_field(payload, "detections")
    if not isinstance(detections, list):
        raise XrayInferenceError("X-ray 응답의 detections 값이 목록이 아닙니다.")
    for index, detection in enumerate(detections):
        detection = _require_mapping(detection, f"detections[{index}]")
        for field_name in ("class_id", "class_name", "score", "bbox_xyxy"):
            _require_field(detection, field_name)
        _require_number(detection["class_id"], f"detections[{index}].class_id")
        _require_number(detection["score"], f"detections[{index}].score")
        bbox = detection["bbox_xyxy"]
        if not isinstance(bbox, list) or len(bbox) != 4:
            raise XrayInferenceError(
                f"X-ray 응답의 detections[{index}].bbox_xyxy 값은 숫자 4개여야 합니다."
            )
        for coordinate_index, coordinate in enumerate(bbox):
            _require_number(
                coordinate,
                f"detections[{index}].bbox_xyxy[{coordinate_index}]",
            )
    return payload


def request_xray_prediction(png_bytes):
    """Send original PNG bytes directly to xray-serve; this function has no DB access."""
    if not settings.XRAY_SERVICE_URL:
        raise XrayInferenceError("XRAY_SERVICE_URL 설정이 필요합니다.")
    if not isinstance(png_bytes, bytes):
        raise XrayInferenceError("X-ray 추론 입력은 원본 PNG bytes여야 합니다.")

    headers = {"Content-Type": "image/png"}
    if settings.XRAY_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"

    request = Request(
        f"{settings.XRAY_SERVICE_URL}/v1/predict?score_threshold=0.30",
        data=png_bytes,
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.XRAY_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise XrayInferenceError("X-ray 서비스 인증이 거부되었습니다.") from exc
        raise XrayInferenceError(f"X-ray 서비스가 HTTP {exc.code} 오류를 반환했습니다.") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise XrayInferenceError("X-ray 추론 서비스에 연결할 수 없습니다.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise XrayInferenceError("X-ray 서비스 응답이 올바른 JSON이 아닙니다.") from exc

    return validate_prediction(payload)
