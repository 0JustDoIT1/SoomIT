from __future__ import annotations

import os
import re
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .artifacts import ensure_artifact
from .pipeline import PathologyPipeline
from .storage import download_wsi


CASE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
MODEL_REVISION = os.getenv("PATHOLOGY_MODEL_REVISION", "pathology-analysis-v1")
TISSUE_PATH = Path(os.getenv("PATHOLOGY_TISSUE_MODEL_PATH", "/models/clam_tissue.pt"))
GENE_PATH = Path(os.getenv("PATHOLOGY_GENE_MODEL_PATH", "/models/clam_gene.pt"))
TISSUE_URI = os.environ["PATHOLOGY_TISSUE_MODEL_GCS_URI"]
GENE_URI = os.environ["PATHOLOGY_GENE_MODEL_GCS_URI"]
TISSUE_SHA = os.environ["PATHOLOGY_TISSUE_MODEL_SHA256"].lower()
GENE_SHA = os.environ["PATHOLOGY_GENE_MODEL_SHA256"].lower()
MAX_WSI_BYTES = int(os.getenv("PATHOLOGY_MAX_WSI_BYTES", str(10 * 1024**3)))
MAX_PATCHES = int(os.getenv("PATHOLOGY_MAX_PATCHES", "10000"))
BATCH_SIZE = int(os.getenv("PATHOLOGY_UNI2H_BATCH_SIZE", "32"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    device_name = os.getenv("PATHOLOGY_DEVICE", "cuda")
    if device_name == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("PATHOLOGY_DEVICE=cuda but CUDA is unavailable")
    device = torch.device(device_name)
    hashes = {
        "tissue_clam": ensure_artifact(TISSUE_URI, TISSUE_PATH, TISSUE_SHA),
        "gene_clam": ensure_artifact(GENE_URI, GENE_PATH, GENE_SHA),
    }
    app.state.model_hashes = hashes
    app.state.pipeline = PathologyPipeline(
        tissue_checkpoint=TISSUE_PATH,
        gene_checkpoint=GENE_PATH,
        device=device,
        batch_size=BATCH_SIZE,
        tissue_confidence_threshold=0.60,
    )
    yield
    app.state.pipeline = None


app = FastAPI(title="SoomIT pathology and genomics inference", version="1.0.0", lifespan=lifespan)


class PredictRequest(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
    patient_id: str = Field(min_length=1, max_length=128)
    wsi_id: str = Field(min_length=1, max_length=128)
    wsi_gcs_uri: str
    include_heatmap: bool = False


@app.get("/health")
def health() -> dict:
    pipeline = getattr(app.state, "pipeline", None)
    if pipeline is None:
        raise HTTPException(status_code=503, detail="models are not loaded")
    return {
        "status": "ok",
        "model_revision": MODEL_REVISION,
        "device": str(pipeline.device),
        "models": app.state.model_hashes,
        "embedding_backbone": "UNI2-h",
    }


@app.post("/v1/predict")
def predict(body: PredictRequest) -> dict:
    if not CASE_PATTERN.fullmatch(body.case_id):
        raise HTTPException(status_code=422, detail="invalid case_id")
    if body.include_heatmap:
        raise HTTPException(status_code=422, detail="attention heatmap generation is not enabled")
    try:
        with tempfile.TemporaryDirectory(prefix="pathology-analysis-") as temporary:
            slide_path = download_wsi(
                body.wsi_gcs_uri, Path(temporary) / "source.svs", MAX_WSI_BYTES
            )
            result = app.state.pipeline.predict_wsi(
                slide_path,
                max_patches=MAX_PATCHES,
                tile_size=256,
                target_mpp=0.5,
                tissue_fraction=0.5,
                thumbnail_size=2000,
                seed=42,
            )
        return {
            "status": "ok",
            "model_revision": MODEL_REVISION,
            "case_id": body.case_id,
            "patient_id": body.patient_id,
            "wsi_id": body.wsi_id,
            **result,
        }
    except (ValueError, OSError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
