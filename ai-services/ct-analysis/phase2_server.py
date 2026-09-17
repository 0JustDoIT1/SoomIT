from __future__ import annotations

import importlib.util
import logging
import os
import re
import sys
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from storage_io import download_file, upload_tree


ROOT = Path(__file__).resolve().parent
ORCHESTRATOR_PATH = ROOT / "packages/final_ct_analysis_deploy_ready/code/orchestrator.py"
OUTPUT_GCS_PREFIX = os.environ.get(
    "CT_ANALYSIS_OUTPUT_GCS_PREFIX", "gs://soomit-bucket/ct-analysis"
).rstrip("/")
MODEL_REVISION = os.environ.get("MODEL_REVISION", "ct-analysis-v1.0.0")
CASE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
inference_lock = threading.Lock()
logger = logging.getLogger("uvicorn.error")

LOBE_MASKS = (
    "lung_upper_lobe_left.nii.gz",
    "lung_lower_lobe_left.nii.gz",
    "lung_upper_lobe_right.nii.gz",
    "lung_middle_lobe_right.nii.gz",
    "lung_lower_lobe_right.nii.gz",
)
CANONICAL_MASKS = (
    "airway.nii.gz",
    "heart.nii.gz",
    "great_vessels.nii.gz",
    "esophagus.nii.gz",
    "vertebral_body_proxy.nii.gz",
    "chest_wall_proxy.nii.gz",
)


def log_latency(stage: str, started: float) -> None:
    logger.info(
        "latency service=ct_phase2 stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


def download_phase1_inputs(artifact_uri: str, case_id: str, case_root: Path) -> tuple[Path, Path]:
    prefix = artifact_uri.rstrip("/")
    ct_path = download_file(
        f"{prefix}/source/{case_id}_0000.nii.gz",
        case_root / "source" / f"{case_id}_0000.nii.gz",
    )
    phase1_dir = case_root / "phase1"
    for filename in LOBE_MASKS:
        download_file(
            f"{prefix}/phase1/anatomy/thoracic_total/{filename}",
            phase1_dir / "anatomy" / "thoracic_total" / filename,
        )
    for filename in CANONICAL_MASKS:
        download_file(
            f"{prefix}/phase1/canonical_anatomy/{filename}",
            phase1_dir / "canonical_anatomy" / filename,
        )
    return ct_path, phase1_dir


def load_orchestrator():
    spec = importlib.util.spec_from_file_location("ct_analysis_orchestrator", ORCHESTRATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load CT analysis orchestrator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Phase2Request(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
    patient_id: str = Field(min_length=1, max_length=128)
    age: float = Field(ge=0, le=130)
    gender: str = Field(min_length=1, max_length=64)
    histology: str = Field(min_length=1, max_length=128)
    phase1_artifact_uri: str
    t_tumor_mask_uri: str
    output_gcs_uri: str | None = None


app = FastAPI(title="SoomIT CT analysis phase 2", version="1.0.0")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "phase": 2,
        "model_revision": MODEL_REVISION,
        "device": "cpu",
    }


@app.post("/v1/phase2")
def phase2(body: Phase2Request) -> dict:
    total_started = time.perf_counter()
    if not CASE_ID_PATTERN.fullmatch(body.case_id):
        raise HTTPException(status_code=422, detail="invalid case_id")
    destination = (
        body.output_gcs_uri
        or f"{OUTPUT_GCS_PREFIX}/{body.case_id}/phase2"
    ).rstrip("/")
    try:
        with tempfile.TemporaryDirectory(prefix="ct-analysis-phase2-") as temporary:
            work_root = Path(temporary)
            stage_started = time.perf_counter()
            ct_path, phase1_dir = download_phase1_inputs(
                body.phase1_artifact_uri, body.case_id, work_root / "case"
            )
            tumor_mask = download_file(
                body.t_tumor_mask_uri, work_root / "t" / "tumor_mask.nii.gz"
            )
            log_latency("download", stage_started)
            output_dir = work_root / "phase2"
            orchestrator = load_orchestrator()
            stage_started = time.perf_counter()
            with inference_lock:
                result = orchestrator.phase2(
                    ct_path=ct_path,
                    case_id=body.case_id,
                    patient_id=body.patient_id,
                    age=body.age,
                    gender=body.gender,
                    histology=body.histology,
                    tumor_mask=tumor_mask,
                    phase1_dir=phase1_dir,
                    output_dir=output_dir,
                    python_executable=sys.executable,
                )
            log_latency("feature_extraction", stage_started)
            stage_started = time.perf_counter()
            artifact_uri = upload_tree(output_dir, destination)
            log_latency("upload", stage_started)
            response = {
                "status": "READY_FOR_N_MODEL",
                "model_revision": MODEL_REVISION,
                "case_id": body.case_id,
                "patient_id": body.patient_id,
                "feature_count": result.get("feature_count"),
                "artifact_uri": artifact_uri,
                "n_input_uri": f"{artifact_uri}n_input.json",
                "result": result,
            }
            log_latency("total", total_started)
            return response
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
