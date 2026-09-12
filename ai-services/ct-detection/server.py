from __future__ import annotations

import json
import os
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel, Field

from artifact import ensure_gcs_artifact
from input_io import (
    InvalidCtInput,
    prepare_ct_input,
    stream_request_to_file,
    validate_filename,
)
from orthanc_client import OrthancDownloadError, download_orthanc_series


SERVICE_ROOT = Path(__file__).resolve().parent
CODE_ROOT = SERVICE_ROOT / "code"
if str(CODE_ROOT) not in sys.path:
    sys.path.insert(0, str(CODE_ROOT))

MODEL_PATH = Path(os.environ.get("MODEL_PATH", SERVICE_ROOT / "models" / "best_val_loss.pt"))
MODEL_GCS_URI = os.environ.get("MODEL_GCS_URI")
DEVICE = os.environ.get("DEVICE") or None
INFERENCE_BATCH_SIZE = int(os.environ.get("INFERENCE_BATCH_SIZE", "4"))
MAX_CT_BYTES = int(os.environ.get("MAX_CT_BYTES", str(2 * 1024**3)))
MAX_DICOM_FILES = int(os.environ.get("MAX_DICOM_FILES", "10000"))
MAX_EXPANDED_BYTES = int(os.environ.get("MAX_EXPANDED_BYTES", str(4 * 1024**3)))
MODEL_VERSION = os.environ.get("MODEL_VERSION", "cpmnetv2-hn25-v1.0.0")
MODEL_SHA256 = os.environ.get(
    "MODEL_SHA256",
    "4d1036ba7bdb7aec132d13ce8d0b760d277146e48511d459e6379c0651d1a009",
)
DEFAULT_SCORE_THRESHOLD = float(
    os.environ.get("DEFAULT_SCORE_THRESHOLD", "0.9612025618553162")
)
ORTHANC_BASE_URL = os.environ.get("ORTHANC_BASE_URL", "").rstrip("/")
ORTHANC_USERNAME = os.environ.get("ORTHANC_USERNAME", "")
ORTHANC_PASSWORD = os.environ.get("ORTHANC_PASSWORD", "")
ORTHANC_TIMEOUT_SECONDS = float(os.environ.get("ORTHANC_TIMEOUT_SECONDS", "120"))

runtime_model = None
runtime_device = None
runtime_model_sha256 = None


class OrthancDetectionRequest(BaseModel):
    orthanc_series_id: str = Field(min_length=40, max_length=40)
    series_instance_uid: str | None = Field(default=None, min_length=1, max_length=128)
    case_id: str | None = Field(default=None, min_length=1, max_length=128)
    score_threshold: float = Field(default=DEFAULT_SCORE_THRESHOLD, ge=0.0, le=1.0)


def run_detection(
    ct_path: Path,
    work_dir: Path,
    *,
    input_size: int,
    series_uid: str | None,
    score_threshold: float,
) -> dict:
    from inference import run_detection_inference
    from postprocessing import postprocess_candidates, save_outputs
    from visualization import build_viewer_annotation

    candidates, metadata = run_detection_inference(
        input_path=ct_path,
        checkpoint_path=MODEL_PATH,
        device=DEVICE,
        series_uid=series_uid,
        batch_size=INFERENCE_BATCH_SIZE,
        loaded_model=runtime_model,
        loaded_device=runtime_device,
    )
    final_candidates, nodules = postprocess_candidates(
        raw_candidates=candidates,
        metadata=metadata,
        score_threshold=score_threshold,
    )
    paths = save_outputs(
        output_dir=work_dir / "output",
        final_candidates=final_candidates,
        detections=nodules,
        metadata=metadata,
    )
    payload = json.loads(paths["final_detections_json"].read_text(encoding="utf-8"))
    payload.update(
        {
            "model_version": MODEL_VERSION,
            "model_sha256": runtime_model_sha256,
            "score_threshold": score_threshold,
            "input_size_bytes": input_size,
            "viewer_annotations": {
                "status": "SUCCESS",
                "case_id": payload.get("case_id"),
                "series_uid": payload.get("series_uid"),
                "annotation_coordinate_system": "patient physical XYZ mm",
                "annotation_count": len(nodules),
                "annotations": [build_viewer_annotation(nodule) for nodule in nodules],
            },
        }
    )
    return payload


@asynccontextmanager
async def lifespan(_: FastAPI):
    global runtime_model, runtime_device, runtime_model_sha256
    from model import load_detection_model

    runtime_model_sha256 = ensure_gcs_artifact(MODEL_GCS_URI, MODEL_PATH, MODEL_SHA256)
    runtime_model, runtime_device = load_detection_model(
        checkpoint_path=MODEL_PATH,
        device=DEVICE,
    )
    yield
    runtime_model = None
    runtime_device = None
    runtime_model_sha256 = None


app = FastAPI(
    title="SoomIT CT nodule detection",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict:
    if runtime_model is None or runtime_device is None:
        raise HTTPException(status_code=503, detail="CT detection model is not loaded")
    return {
        "status": "ok",
        "model": "CPMNetv2_HN25",
        "model_version": MODEL_VERSION,
        "model_sha256": runtime_model_sha256,
        "device": str(runtime_device),
    }


@app.post("/v1/detect")
async def detect(
    request: Request,
    filename: str = Query(description="Input name ending in .nii, .nii.gz, or .zip"),
    series_uid: str | None = Query(default=None),
    score_threshold: float = Query(
        default=DEFAULT_SCORE_THRESHOLD,
        ge=0.0,
        le=1.0,
        description="Minimum score for returned detections; use 0 for the full NMS candidate pool",
    ),
) -> dict:
    if runtime_model is None or runtime_device is None:
        raise HTTPException(status_code=503, detail="CT detection model is not loaded")

    try:
        safe_filename = validate_filename(filename)
    except InvalidCtInput as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_CT_BYTES:
                raise HTTPException(status_code=413, detail="CT input exceeds the configured size limit")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="invalid Content-Length header") from exc

    with tempfile.TemporaryDirectory(prefix="ct-detection-") as temporary:
        work_dir = Path(temporary)
        upload_path = work_dir / safe_filename

        try:
            input_size = await stream_request_to_file(request, upload_path, MAX_CT_BYTES)
            ct_path = prepare_ct_input(
                upload_path,
                safe_filename,
                work_dir,
                max_dicom_files=MAX_DICOM_FILES,
                max_uncompressed_bytes=MAX_EXPANDED_BYTES,
            )

            detection_payload = run_detection(
                ct_path,
                work_dir,
                input_size=input_size,
                series_uid=series_uid,
                score_threshold=score_threshold,
            )
        except InvalidCtInput as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except (FileNotFoundError, ValueError, RuntimeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return detection_payload


@app.post("/v1/detect/orthanc")
def detect_from_orthanc(body: OrthancDetectionRequest) -> dict:
    if runtime_model is None or runtime_device is None:
        raise HTTPException(status_code=503, detail="CT detection model is not loaded")
    if not ORTHANC_BASE_URL or not ORTHANC_USERNAME or not ORTHANC_PASSWORD:
        raise HTTPException(status_code=503, detail="Orthanc connection is not configured")

    with tempfile.TemporaryDirectory(prefix="ct-detection-orthanc-") as temporary:
        work_dir = Path(temporary)
        archive_path = work_dir / "dicom.zip"
        try:
            input_size, actual_series_uid = download_orthanc_series(
                base_url=ORTHANC_BASE_URL,
                username=ORTHANC_USERNAME,
                password=ORTHANC_PASSWORD,
                series_id=body.orthanc_series_id,
                destination=archive_path,
                timeout=ORTHANC_TIMEOUT_SECONDS,
                max_bytes=MAX_CT_BYTES,
                expected_series_uid=body.series_instance_uid,
            )
            ct_path = prepare_ct_input(
                archive_path,
                "dicom.zip",
                work_dir,
                max_dicom_files=MAX_DICOM_FILES,
                max_uncompressed_bytes=MAX_EXPANDED_BYTES,
            )
            detection_payload = run_detection(
                ct_path,
                work_dir,
                input_size=input_size,
                series_uid=actual_series_uid,
                score_threshold=body.score_threshold,
            )
        except OrthancDownloadError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except InvalidCtInput as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except (FileNotFoundError, ValueError, RuntimeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    detection_payload["orthanc_series_id"] = body.orthanc_series_id.lower()
    if body.case_id:
        detection_payload["case_id"] = body.case_id
        viewer_annotations = detection_payload.get("viewer_annotations")
        if isinstance(viewer_annotations, dict):
            viewer_annotations["case_id"] = body.case_id
    return detection_payload
