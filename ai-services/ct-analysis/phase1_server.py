from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
import shutil
import sys
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from artifact import ensure_artifact
from cornerstone_labelmap import generate_cornerstone_segmentation
from input_io import InvalidCtInput, dicom_directory_to_nifti, extract_dicom_zip
from model_artifacts import phase1_artifacts
from phase1_models import ResidentNoduleModels
from orthanc_client import OrthancDownloadError, download_orthanc_series
from storage_io import download_file, upload_tree
from visualization import ANATOMY_LAYERS, LOBE_LAYERS


ROOT = Path(__file__).resolve().parent
ORCHESTRATOR_PATH = (
    ROOT / "packages/final_ct_analysis_deploy_ready/code/orchestrator.py"
)
OUTPUT_GCS_PREFIX = os.environ.get(
    "CT_ANALYSIS_OUTPUT_GCS_PREFIX", "gs://soomit-bucket/ct-analysis"
).rstrip("/")
ORTHANC_BASE_URL = os.environ.get("ORTHANC_BASE_URL", "").rstrip("/")
ORTHANC_USERNAME = os.environ.get("ORTHANC_USERNAME", "")
ORTHANC_PASSWORD = os.environ.get("ORTHANC_PASSWORD", "")
ORTHANC_TIMEOUT_SECONDS = float(os.environ.get("ORTHANC_TIMEOUT_SECONDS", "300"))
MAX_CT_BYTES = int(os.environ.get("MAX_CT_BYTES", str(2 * 1024**3)))
MAX_DICOM_FILES = int(os.environ.get("MAX_DICOM_FILES", "10000"))
MAX_EXPANDED_BYTES = int(os.environ.get("MAX_EXPANDED_BYTES", str(4 * 1024**3)))
MODEL_REVISION = os.environ.get("MODEL_REVISION", "ct-analysis-v1.0.0")
CASE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")

model_hashes: dict[str, str] = {}
nodule_models: ResidentNoduleModels | None = None
inference_lock = threading.Lock()
logger = logging.getLogger("uvicorn.error")


def log_latency(stage: str, started: float) -> None:
    logger.info(
        "latency service=ct_phase1 stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


def load_orchestrator():
    spec = importlib.util.spec_from_file_location("ct_analysis_orchestrator", ORCHESTRATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load CT analysis orchestrator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_case_id(case_id: str) -> str:
    if not CASE_ID_PATTERN.fullmatch(case_id):
        raise ValueError("case_id may contain only letters, numbers, dot, underscore, and dash")
    return case_id


def output_uri(case_id: str, requested: str | None) -> str:
    return (requested or f"{OUTPUT_GCS_PREFIX}/{case_id}").rstrip("/")


def run_phase1(ct_path: Path, case_id: str, work_root: Path, destination: str) -> dict:
    total_started = time.perf_counter()
    phase1_dir = work_root / "phase1"
    orchestrator = load_orchestrator()
    stage_started = time.perf_counter()
    with inference_lock:
        result = orchestrator.phase1(
            ct_path=ct_path,
            case_id=case_id,
            output_dir=phase1_dir,
            python_executable=sys.executable,
            totalseg_env=os.environ.get("TOTALSEG_ENV", "totalseg"),
            nodule_models=nodule_models,
        )
    log_latency("pipeline", stage_started)
    stage_started = time.perf_counter()
    artifact_uri = upload_tree(work_root, destination)
    log_latency("upload", stage_started)
    visualization = result.get("visualization", {})
    visualization_prefix = f"{artifact_uri}phase1/visualization/"
    for layer in visualization.get("layers", []):
        relative_path = layer.get("mesh_relative_path")
        if relative_path:
            layer["mesh_uri"] = f"{visualization_prefix}{relative_path}"

    cornerstone_segmentation = result.get("cornerstone_segmentation", {})
    cornerstone_prefix = f"{artifact_uri}phase1/cornerstone/"
    for uri_key, relative_key in (
        ("labelmap_uri", "labelmap_relative_path"),
        ("metadata_uri", "metadata_relative_path"),
        ("geometry_uri", "geometry_relative_path"),
    ):
        relative_path = cornerstone_segmentation.get(relative_key)
        if relative_path:
            cornerstone_segmentation[uri_key] = f"{cornerstone_prefix}{relative_path}"

    response = {
        "status": "READY_FOR_T_MODEL",
        "model_revision": MODEL_REVISION,
        "case_id": case_id,
        "artifact_uri": artifact_uri,
        "phase1_result_uri": f"{artifact_uri}phase1/phase1_result.json",
        "t_input_uri": f"{artifact_uri}phase1/t_input/{case_id}_0000.nii.gz",
        "visualization_manifest_uri": f"{visualization_prefix}visualization_manifest.json",
        "visualization": visualization,
        "cornerstone_manifest_uri": f"{cornerstone_prefix}cornerstone_manifest.json",
        "cornerstone_segmentation": cornerstone_segmentation,
        "result": result,
    }
    log_latency("request_total", total_started)
    return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    global nodule_models
    started = time.perf_counter()
    for artifact in phase1_artifacts():
        model_hashes[artifact.name] = ensure_artifact(artifact)
    nodule_models = ResidentNoduleModels()
    log_latency("model_initialization", started)
    yield
    nodule_models = None
    model_hashes.clear()


app = FastAPI(title="SoomIT CT analysis phase 1", version="1.0.0", lifespan=lifespan)


class OrthancPhase1Request(BaseModel):
    # Orthanc resource IDs are 44 chars: 5 groups of 8 hex chars joined by dashes.
    orthanc_series_id: str = Field(min_length=44, max_length=44)
    case_id: str = Field(min_length=1, max_length=128)
    series_instance_uid: str | None = Field(default=None, max_length=128)
    output_gcs_uri: str | None = None


class GcsPhase1Request(BaseModel):
    ct_gcs_uri: str
    case_id: str = Field(min_length=1, max_length=128)
    output_gcs_uri: str | None = None


class BackfillCornerstoneRequest(BaseModel):
    artifact_uri: str
    case_id: str = Field(min_length=1, max_length=128)


@app.get("/health")
def health() -> dict:
    if len(model_hashes) != len(phase1_artifacts()):
        raise HTTPException(status_code=503, detail="phase 1 models are not loaded")
    return {
        "status": "ok",
        "phase": 1,
        "model_revision": MODEL_REVISION,
        "models": model_hashes,
        "device": "cuda",
    }


@app.post("/v1/phase1/orthanc")
def phase1_from_orthanc(body: OrthancPhase1Request) -> dict:
    if not ORTHANC_BASE_URL or not ORTHANC_USERNAME or not ORTHANC_PASSWORD:
        raise HTTPException(status_code=503, detail="Orthanc connection is not configured")
    try:
        case_id = validate_case_id(body.case_id)
        with tempfile.TemporaryDirectory(prefix="ct-analysis-phase1-") as temporary:
            work_root = Path(temporary)
            archive = work_root / "source" / "dicom.zip"
            stage_started = time.perf_counter()
            download_orthanc_series(
                base_url=ORTHANC_BASE_URL,
                username=ORTHANC_USERNAME,
                password=ORTHANC_PASSWORD,
                series_id=body.orthanc_series_id,
                destination=archive,
                timeout=ORTHANC_TIMEOUT_SECONDS,
                max_bytes=MAX_CT_BYTES,
                expected_series_uid=body.series_instance_uid,
            )
            log_latency("orthanc_download", stage_started)
            stage_started = time.perf_counter()
            dicom_root = extract_dicom_zip(
                archive,
                work_root / "source" / "dicom",
                max_files=MAX_DICOM_FILES,
                max_uncompressed_bytes=MAX_EXPANDED_BYTES,
            )
            ct_path = dicom_directory_to_nifti(
                dicom_root,
                work_root / "source" / f"{case_id}_0000.nii.gz",
                metadata_path=work_root / "source" / "dicom_to_nifti_metadata.json",
            )
            log_latency("dicom_preprocessing", stage_started)
            archive.unlink(missing_ok=True)
            # Orthanc is the source of truth for original DICOM. The extracted
            # files are temporary conversion input and must not be uploaded as
            # derived CT artifacts.
            shutil.rmtree(dicom_root)
            return run_phase1(
                ct_path, case_id, work_root, output_uri(case_id, body.output_gcs_uri)
            )
    except OrthancDownloadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (InvalidCtInput, FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/phase1/gcs")
def phase1_from_gcs(body: GcsPhase1Request) -> dict:
    try:
        case_id = validate_case_id(body.case_id)
        with tempfile.TemporaryDirectory(prefix="ct-analysis-phase1-") as temporary:
            work_root = Path(temporary)
            stage_started = time.perf_counter()
            ct_path = download_file(
                body.ct_gcs_uri, work_root / "source" / f"{case_id}_0000.nii.gz"
            )
            log_latency("gcs_download", stage_started)
            return run_phase1(
                ct_path, case_id, work_root, output_uri(case_id, body.output_gcs_uri)
            )
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/phase1/backfill-cornerstone")
def backfill_cornerstone(body: BackfillCornerstoneRequest) -> dict:
    """Add a Cornerstone3D labelmap to an already-completed Phase 1 result.

    Reads the NIfTI masks a prior Phase 1 run already wrote under
    ``artifact_uri`` and converts them into the same labelmap artifacts a
    fresh run would produce. No model inference runs here.
    """
    try:
        case_id = validate_case_id(body.case_id)
        artifact_uri = body.artifact_uri.rstrip("/") + "/"
        with tempfile.TemporaryDirectory(prefix="ct-analysis-backfill-") as temporary:
            work_root = Path(temporary)
            ct_path = download_file(
                f"{artifact_uri}source/{case_id}_0000.nii.gz", work_root / "ct.nii.gz"
            )
            seg_path = download_file(
                f"{artifact_uri}phase1/segmentation/{case_id}_seg.nii.gz", work_root / "seg.nii.gz"
            )
            lobe_dir = work_root / "lobes"
            for _, _, filename, _ in LOBE_LAYERS:
                download_file(f"{artifact_uri}phase1/anatomy/thoracic_total/{filename}", lobe_dir / filename)
            canonical_dir = work_root / "canonical"
            for _, _, filename, _ in ANATOMY_LAYERS:
                download_file(f"{artifact_uri}phase1/canonical_anatomy/{filename}", canonical_dir / filename)

            output_dir = work_root / "cornerstone"
            generate_cornerstone_segmentation(
                segmentation_path=seg_path,
                lobe_dir=lobe_dir,
                canonical_dir=canonical_dir,
                ct_path=ct_path,
                output_dir=output_dir,
                case_id=case_id,
            )

            cornerstone_prefix = f"{artifact_uri}phase1/cornerstone/"
            upload_tree(output_dir, cornerstone_prefix)
            manifest = json.loads((output_dir / "cornerstone_manifest.json").read_text(encoding="utf-8"))
            for uri_key, relative_key in (
                ("labelmap_uri", "labelmap_relative_path"),
                ("metadata_uri", "metadata_relative_path"),
                ("geometry_uri", "geometry_relative_path"),
            ):
                manifest[uri_key] = f"{cornerstone_prefix}{manifest[relative_key]}"

            return {
                "artifact_uri": artifact_uri,
                "cornerstone_manifest_uri": f"{cornerstone_prefix}cornerstone_manifest.json",
                "cornerstone_segmentation": manifest,
            }
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
