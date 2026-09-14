from __future__ import annotations

import importlib.util
import os
import re
import sys
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from storage_io import download_file, download_prefix, upload_tree


ROOT = Path(__file__).resolve().parent
ORCHESTRATOR_PATH = ROOT / "packages/final_ct_analysis_deploy_ready/code/orchestrator.py"
OUTPUT_GCS_PREFIX = os.environ.get(
    "CT_ANALYSIS_OUTPUT_GCS_PREFIX", "gs://soomit-bucket/ct-analysis"
).rstrip("/")
MODEL_REVISION = os.environ.get("MODEL_REVISION", "ct-analysis-v1.0.0")
CASE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
inference_lock = threading.Lock()


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
    if not CASE_ID_PATTERN.fullmatch(body.case_id):
        raise HTTPException(status_code=422, detail="invalid case_id")
    destination = (
        body.output_gcs_uri
        or f"{OUTPUT_GCS_PREFIX}/{body.case_id}/phase2"
    ).rstrip("/")
    try:
        with tempfile.TemporaryDirectory(prefix="ct-analysis-phase2-") as temporary:
            work_root = Path(temporary)
            case_root = download_prefix(body.phase1_artifact_uri, work_root / "case")
            ct_path = case_root / "source" / f"{body.case_id}_0000.nii.gz"
            phase1_dir = case_root / "phase1"
            if not ct_path.is_file() or not phase1_dir.is_dir():
                raise FileNotFoundError(
                    "phase1 artifact must contain source CT and the phase1 directory"
                )
            tumor_mask = download_file(
                body.t_tumor_mask_uri, work_root / "t" / "tumor_mask.nii.gz"
            )
            output_dir = work_root / "phase2"
            orchestrator = load_orchestrator()
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
            artifact_uri = upload_tree(output_dir, destination)
            return {
                "status": "READY_FOR_N_MODEL",
                "model_revision": MODEL_REVISION,
                "case_id": body.case_id,
                "patient_id": body.patient_id,
                "feature_count": result.get("feature_count"),
                "artifact_uri": artifact_uri,
                "n_input_uri": f"{artifact_uri}n_input.json",
                "result": result,
            }
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
