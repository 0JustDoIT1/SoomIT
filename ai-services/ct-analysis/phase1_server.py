from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from artifact import ensure_artifact
from input_io import InvalidCtInput, dicom_directory_to_nifti, extract_dicom_zip
from model_artifacts import phase1_artifacts
from orthanc_client import OrthancDownloadError, download_orthanc_series
from storage_io import download_file, upload_tree


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
inference_lock = threading.Lock()


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
    phase1_dir = work_root / "phase1"
    orchestrator = load_orchestrator()
    with inference_lock:
        result = orchestrator.phase1(
            ct_path=ct_path,
            case_id=case_id,
            output_dir=phase1_dir,
            python_executable=sys.executable,
            totalseg_env=os.environ.get("TOTALSEG_ENV", "totalseg"),
        )
    artifact_uri = upload_tree(work_root, destination)
    return {
        "status": "READY_FOR_T_MODEL",
        "model_revision": MODEL_REVISION,
        "case_id": case_id,
        "artifact_uri": artifact_uri,
        "phase1_result_uri": f"{artifact_uri}phase1/phase1_result.json",
        "t_input_uri": f"{artifact_uri}phase1/t_input/{case_id}_0000.nii.gz",
        "result": result,
    }


@asynccontextmanager
async def lifespan(_: FastAPI):
    for artifact in phase1_artifacts():
        model_hashes[artifact.name] = ensure_artifact(artifact)
    yield
    model_hashes.clear()


app = FastAPI(title="SoomIT CT analysis phase 1", version="1.0.0", lifespan=lifespan)


class OrthancPhase1Request(BaseModel):
    orthanc_series_id: str = Field(min_length=40, max_length=40)
    case_id: str = Field(min_length=1, max_length=128)
    series_instance_uid: str | None = Field(default=None, max_length=128)
    output_gcs_uri: str | None = None


class GcsPhase1Request(BaseModel):
    ct_gcs_uri: str
    case_id: str = Field(min_length=1, max_length=128)
    output_gcs_uri: str | None = None


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
            archive.unlink(missing_ok=True)
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
            ct_path = download_file(
                body.ct_gcs_uri, work_root / "source" / f"{case_id}_0000.nii.gz"
            )
            return run_phase1(
                ct_path, case_id, work_root, output_uri(case_id, body.output_gcs_uri)
            )
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
