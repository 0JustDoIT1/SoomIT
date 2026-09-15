import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class CtAnalysisInferenceError(RuntimeError):
    """Raised when the CT analysis Phase 1 service cannot return a valid result."""


def _fetch_id_token():
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token

        request = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(request, settings.CT_ANALYSIS_PHASE1_SERVICE_URL)
    except Exception as exc:
        raise CtAnalysisInferenceError("CT 분석 서비스 인증 토큰을 발급할 수 없습니다.") from exc


def request_ct_phase1_analysis(*, orthanc_series_id, case_id, series_instance_uid=None):
    """Call ct-analysis-phase1-serve's /v1/phase1/orthanc endpoint.

    Phase 1 downloads the Series directly from Orthanc, so this function has no DB
    or storage access of its own - it only sends identifiers and returns the raw
    response (DICOM->NIfTI, VISTA3D nodule segmentation/quantification, morphology,
    texture, malignancy, thoracic anatomy segmentation, and TNM T-model input prep).
    """
    if not settings.CT_ANALYSIS_PHASE1_SERVICE_URL:
        raise CtAnalysisInferenceError("CT_ANALYSIS_PHASE1_SERVICE_URL 설정이 필요합니다.")
    if not orthanc_series_id:
        raise CtAnalysisInferenceError("orthanc_series_id가 필요합니다.")

    body = {"orthanc_series_id": orthanc_series_id, "case_id": case_id}
    if series_instance_uid:
        body["series_instance_uid"] = series_instance_uid

    headers = {"Content-Type": "application/json"}
    if settings.CT_ANALYSIS_PHASE1_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"

    request = Request(
        f"{settings.CT_ANALYSIS_PHASE1_SERVICE_URL}/v1/phase1/orthanc",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.CT_ANALYSIS_PHASE1_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise CtAnalysisInferenceError("CT 분석 서비스 인증이 거부되었습니다.") from exc
        if exc.code == 502:
            raise CtAnalysisInferenceError("CT 분석 서비스가 Orthanc에서 Series를 내려받지 못했습니다.") from exc
        raise CtAnalysisInferenceError(f"CT 분석 서비스가 HTTP {exc.code} 오류를 반환했습니다.") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise CtAnalysisInferenceError("CT 분석 서비스(Phase 1)에 연결할 수 없습니다.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CtAnalysisInferenceError("CT 분석 서비스 응답이 올바른 JSON이 아닙니다.") from exc

    return validate_phase1_response(payload)


def validate_phase1_response(payload):
    if not isinstance(payload, dict):
        raise CtAnalysisInferenceError("Phase 1 응답이 객체가 아닙니다.")
    for field_name in ("status", "case_id", "artifact_uri", "phase1_result_uri", "t_input_uri", "result"):
        if field_name not in payload:
            raise CtAnalysisInferenceError(f"Phase 1 응답에 {field_name} 필드가 없습니다.")
    result = payload["result"]
    if not isinstance(result, dict) or "nodules" not in result or not isinstance(result["nodules"], list):
        raise CtAnalysisInferenceError("Phase 1 응답의 result.nodules 값이 목록이 아닙니다.")
    for index, nodule in enumerate(result["nodules"]):
        if not isinstance(nodule, dict) or "nodule_id" not in nodule:
            raise CtAnalysisInferenceError(f"Phase 1 응답의 result.nodules[{index}]에 nodule_id가 없습니다.")
    return payload
