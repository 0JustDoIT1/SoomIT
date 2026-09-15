from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd
from catboost import CatBoostClassifier
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from model_io import ensure_file, read_json
from runtime.tnm_stage_group import integrate


MODEL_ROOT = Path(os.environ.get("MODEL_ROOT", "/models"))
PREFIX = os.environ.get("TNM_CORE_MODEL_GCS_PREFIX", "gs://soomit-bucket/models/tnm/core").rstrip("/")
REVISION = os.environ.get("MODEL_REVISION", "tnm-v1.0.0")
FILES = {
    "catboost_n.cbm": (MODEL_ROOT / "catboost_n.cbm", os.environ.get("N_MODEL_SHA256")),
    "n_feature_contract.json": (MODEL_ROOT / "n_feature_contract.json", os.environ.get("N_CONTRACT_SHA256")),
    "locked_review_policy.json": (MODEL_ROOT / "locked_review_policy.json", os.environ.get("N_POLICY_SHA256")),
}
hashes: dict[str, str] = {}
model: CatBoostClassifier | None = None
contract: dict[str, Any] = {}
review_policy: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, contract, review_policy
    for name, (path, expected) in FILES.items():
        hashes[name] = ensure_file(f"{PREFIX}/{name}", path, expected)
    contract = read_json(FILES["n_feature_contract.json"][0])
    review_policy = read_json(FILES["locked_review_policy.json"][0])
    model = CatBoostClassifier()
    model.load_model(str(FILES["catboost_n.cbm"][0]))
    yield


app = FastAPI(title="SoomIT TNM decision support", version="1.0.0", lifespan=lifespan)


class NRequest(BaseModel):
    patient_id: str | None = None
    features: dict[str, Any]


class StageRequest(BaseModel):
    patient_id: str | None = None
    t_candidate: str
    n_candidate: str
    m_candidate: str
    component_evidence: dict[str, Any] = Field(default_factory=dict)
    discordance_flags: list[str] = Field(default_factory=list)


@app.get("/health")
def health() -> dict:
    if model is None:
        raise HTTPException(status_code=503, detail="N model is not loaded")
    return {"status": "ok", "component": "TNM", "model_revision": REVISION, "models": hashes, "device": "cpu"}


@app.post("/v1/n/predict")
def predict_n(body: NRequest) -> dict:
    if model is None:
        raise HTTPException(status_code=503, detail="N model is not loaded")
    order = contract["model_features"]
    missing = [name for name in order if name not in body.features]
    if missing:
        raise HTTPException(status_code=422, detail=f"missing N features: {missing}")
    row = dict(body.features)
    numeric = contract.get("numeric_features", [])
    for name in numeric:
        value = row[name]
        if value is None:
            continue
        try:
            row[name] = float(value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"N feature must be numeric or null: {name}") from exc
    aliases = {
        "gender": {"m": "male", "male": "male", "f": "female", "female": "female"},
        "histology": {
            "luad": "adenocarcinoma", "adenocarcinoma": "adenocarcinoma",
            "lusc": "squamous cell carcinoma", "squamous": "squamous cell carcinoma",
            "squamous cell carcinoma": "squamous cell carcinoma", "large cell": "large cell",
            "nos": "nos", "other-not-specified": "nos", "unknown": "unknown",
        },
    }
    for name in contract["categorical_features"]:
        value = "unknown" if row[name] is None else str(row[name]).strip().lower()
        row[name] = aliases.get(name, {}).get(value, value)
    allowed = {
        "gender": {"male", "female", "unknown"},
        "histology": {"adenocarcinoma", "squamous cell carcinoma", "large cell", "nos", "unknown"},
        "primary_lobe": {
            "lung_upper_lobe_left", "lung_lower_lobe_left", "lung_upper_lobe_right",
            "lung_middle_lobe_right", "lung_lower_lobe_right", "unassigned",
        },
    }
    invalid = [name for name, values in allowed.items() if row[name] not in values]
    if invalid:
        raise HTTPException(status_code=422, detail=f"invalid N categorical feature(s): {invalid}")
    probability = float(model.predict_proba(pd.DataFrame([row], columns=order))[0, 1])
    thresholds = review_policy["thresholds"]
    review_threshold = float(thresholds["review"])
    elevated_threshold = float(thresholds["elevated_review_priority"])
    tier = "ELEVATED_REVIEW_PRIORITY" if probability >= elevated_threshold else "REVIEW" if probability >= review_threshold else "LOW_SIGNAL"
    return {
        "patient_id": body.patient_id, "nplus_probability": probability, "risk_tier": tier,
        "review_threshold": review_threshold, "elevated_threshold": elevated_threshold, "may_assign_cn": False,
        "categorical_ood_warning": row["gender"] == "unknown",
        "policy_version": review_policy["policy_version"],
        "model_revision": REVISION, "model_sha256": hashes["catboost_n.cbm"],
        "physician_review_required": True,
    }


@app.post("/v1/stage")
def stage(body: StageRequest) -> dict:
    return integrate(body.model_dump())
