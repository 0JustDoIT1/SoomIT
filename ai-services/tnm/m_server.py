from __future__ import annotations

import logging
import math
import os
import re
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd
import nibabel as nib
import numpy as np
from catboost import CatBoostClassifier
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from scipy import ndimage

from model_io import ensure_file, read_json
from nnunet_runtime import ResidentNnUNetPredictor
from storage_io import download_file, download_prefix, upload_file
from pet_dicom import convert_pet_dicom_to_ct_grid
from runtime.m_rule_engine import classify_m
from m_pipeline import (
    HELPER_FEATURE_ORDER,
    PREPROCESSOR_REVISION,
    add_anatomy_context,
    aggregate_patient_features,
    apply_helper,
    component_labels,
    conservative_imaging_evidence,
    extract_lesion_features,
    load_anatomy_masks,
    load_scalar_image,
    run_totalsegmentator,
    validate_aligned_images,
    write_json,
)


MODEL_ROOT = Path(os.environ.get("MODEL_ROOT", "/models"))
DATASET = "Dataset502_AutoPETLung336"
TRAINER = os.environ.get("M_NNUNET_TRAINER", "nnUNetTrainer_100epochs_Save10")
CONFIGURATION = "3d_lowres"
NNUNET_DIR = MODEL_ROOT / "nnUNet_results" / DATASET / f"{TRAINER}__nnUNetPlans__{CONFIGURATION}"
FOLD_DIR = NNUNET_DIR / "fold_0"
MODEL_GCS_PREFIX = os.environ.get("M_MODEL_GCS_PREFIX", "gs://soomit-bucket/models/tnm/m").rstrip("/")
OUTPUT_PREFIX = os.environ.get("TNM_OUTPUT_GCS_PREFIX", "gs://soomit-bucket/tnm").rstrip("/")
MODEL_REVISION = os.environ.get("MODEL_REVISION", "tnm-m-v1.0.0")
CASE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
FILES = {
    "checkpoint_best.pth": (FOLD_DIR / "checkpoint_best.pth", os.environ.get("M_CHECKPOINT_SHA256")),
    "plans.json": (NNUNET_DIR / "plans.json", os.environ.get("M_PLANS_SHA256")),
    "dataset.json": (NNUNET_DIR / "dataset.json", os.environ.get("M_DATASET_SHA256")),
    "catboost_m.cbm": (MODEL_ROOT / "catboost_m.cbm", os.environ.get("M_CATBOOST_SHA256")),
    "m_feature_contract.json": (MODEL_ROOT / "m_feature_contract.json", os.environ.get("M_CONTRACT_SHA256")),
    "catboost_lesion_helper.cbm": (MODEL_ROOT / "catboost_lesion_helper.cbm", os.environ.get("M_HELPER_SHA256")),
    "m_anatomy_contract.json": (MODEL_ROOT / "m_anatomy_contract.json", os.environ.get("M_ANATOMY_CONTRACT_SHA256")),
}
hashes: dict[str, str] = {}
catboost_model: CatBoostClassifier | None = None
helper_model: CatBoostClassifier | None = None
contract: dict[str, Any] = {}
anatomy_contract: dict[str, Any] = {}
nnunet_predictor: ResidentNnUNetPredictor | None = None
inference_lock = threading.Lock()
logger = logging.getLogger("uvicorn.error")


def log_latency(stage: str, started: float) -> None:
    logger.info(
        "latency service=tnm_m stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


def filter_small_components(mask_path: Path, minimum_volume_ml: float = 2.0) -> int:
    image = nib.load(str(mask_path))
    mask = np.asarray(image.dataobj) > 0
    spacing = np.asarray(nib.affines.voxel_sizes(image.affine), dtype=float)
    minimum_voxels = int(math.ceil(minimum_volume_ml * 1000.0 / float(np.prod(spacing))))
    labels, count = ndimage.label(mask, structure=ndimage.generate_binary_structure(3, 2))
    kept = np.zeros(mask.shape, dtype=np.uint8)
    kept_count = 0
    for label in range(1, count + 1):
        component = labels == label
        if int(component.sum()) >= minimum_voxels:
            kept[component] = 1
            kept_count += 1
    output = nib.Nifti1Image(kept, image.affine, header=image.header.copy())
    output.set_data_dtype(np.uint8)
    nib.save(output, str(mask_path))
    return kept_count


@asynccontextmanager
async def lifespan(_: FastAPI):
    global catboost_model, helper_model, contract, anatomy_contract, nnunet_predictor
    started = time.perf_counter()
    for name, (path, expected) in FILES.items():
        hashes[name] = ensure_file(f"{MODEL_GCS_PREFIX}/{name}", path, expected)
    contract = read_json(FILES["m_feature_contract.json"][0])
    catboost_model = CatBoostClassifier()
    catboost_model.load_model(str(FILES["catboost_m.cbm"][0]))
    helper_model = CatBoostClassifier()
    helper_model.load_model(str(FILES["catboost_lesion_helper.cbm"][0]))
    anatomy_contract = read_json(FILES["m_anatomy_contract.json"][0])
    feature_order = contract.get("feature_order") or contract.get("features")
    if list(catboost_model.feature_names_) != list(feature_order):
        raise RuntimeError("CatBoost-M feature order does not match its contract")
    if list(helper_model.feature_names_) != HELPER_FEATURE_ORDER:
        raise RuntimeError("M lesion helper feature order does not match the 28-feature contract")
    nnunet_predictor = ResidentNnUNetPredictor(
        NNUNET_DIR, "checkpoint_best.pth", offload_after_predict=True
    )
    log_latency("model_initialization", started)
    yield
    nnunet_predictor = None


app = FastAPI(title="SoomIT TNM M", version="1.0.0", lifespan=lifespan)


class MSegmentationRequest(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
    ct_gcs_uri: str
    pet_gcs_uri: str
    output_gcs_uri: str | None = None


class MPredictRequest(BaseModel):
    patient_id: str | None = None
    features: dict[str, Any]
    imaging_evidence: dict[str, Any]


class MAnalyzeRequest(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
    patient_id: str | None = None
    ct_gcs_uri: str
    pet_suvbw_gcs_uri: str | None = None
    pet_dicom_gcs_prefix: str | None = None
    pet_series_instance_uid: str | None = None
    patient_weight_kg: float | None = Field(default=None, gt=0)
    injected_dose_bq: float | None = Field(default=None, gt=0)
    output_gcs_prefix: str | None = None


@app.get("/health")
def health() -> dict:
    if (
        catboost_model is None
        or helper_model is None
        or nnunet_predictor is None
        or len(hashes) != len(FILES)
    ):
        raise HTTPException(status_code=503, detail="M models are not loaded")
    return {"status": "ok", "component": "M", "model_revision": MODEL_REVISION, "models": hashes, "device": "cuda"}


def run_m_segmentation(input_dir: Path, output_dir: Path, case_id: str) -> Path:
    output_dir.mkdir(parents=True)
    if nnunet_predictor is None:
        raise RuntimeError("M predictor is not initialized")
    with inference_lock:
        nnunet_predictor.predict(input_dir, output_dir)
    mask = output_dir / f"{case_id}.nii.gz"
    if not mask.is_file():
        raise FileNotFoundError("nnU-Net did not create the expected M lesion mask")
    return mask


@app.post("/v1/segment")
def segment(body: MSegmentationRequest) -> dict:
    total_started = time.perf_counter()
    if not CASE_PATTERN.fullmatch(body.case_id):
        raise HTTPException(status_code=422, detail="invalid case_id")
    destination = body.output_gcs_uri or f"{OUTPUT_PREFIX}/{body.case_id}/m/lesion_mask.nii.gz"
    try:
        with tempfile.TemporaryDirectory(prefix="tnm-m-") as temporary:
            root = Path(temporary)
            input_dir, output_dir = root / "input", root / "output"
            stage_started = time.perf_counter()
            download_file(body.ct_gcs_uri, input_dir / f"{body.case_id}_0000.nii.gz")
            download_file(body.pet_gcs_uri, input_dir / f"{body.case_id}_0001.nii.gz")
            log_latency("download", stage_started)
            stage_started = time.perf_counter()
            mask = run_m_segmentation(input_dir, output_dir, body.case_id)
            log_latency("inference", stage_started)
            stage_started = time.perf_counter()
            lesion_candidate_count = filter_small_components(mask)
            upload_file(mask, destination)
            log_latency("postprocessing_and_upload", stage_started)
            response = {
                "status": "READY_FOR_M_FEATURE_EXTRACTION", "case_id": body.case_id,
                "lesion_mask_uri": destination, "model_revision": MODEL_REVISION,
                "model_sha256": hashes["checkpoint_best.pth"],
                "minimum_component_volume_ml": 2.0,
                "lesion_candidate_count": lesion_candidate_count,
                "next_required": "lesion candidates, anatomical summary, and imaging evidence",
            }
            log_latency("total", total_started)
            return response
    except (FileNotFoundError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/analyze")
def analyze(body: MAnalyzeRequest) -> dict:
    total_started = time.perf_counter()
    if catboost_model is None or helper_model is None:
        raise HTTPException(status_code=503, detail="M models are not loaded")
    if not CASE_PATTERN.fullmatch(body.case_id):
        raise HTTPException(status_code=422, detail="invalid case_id")
    patient_id = body.patient_id or body.case_id
    output_prefix = (body.output_gcs_prefix or f"{OUTPUT_PREFIX}/{body.case_id}/m").rstrip("/")
    try:
        with tempfile.TemporaryDirectory(prefix="tnm-m-full-") as temporary:
            root = Path(temporary)
            input_dir, prediction_dir, anatomy_dir = root / "input", root / "prediction", root / "anatomy"
            stage_started = time.perf_counter()
            ct_path = download_file(body.ct_gcs_uri, input_dir / f"{body.case_id}_0000.nii.gz")
            pet_path = input_dir / f"{body.case_id}_0001.nii.gz"
            if bool(body.pet_suvbw_gcs_uri) == bool(body.pet_dicom_gcs_prefix):
                raise ValueError("Provide exactly one of pet_suvbw_gcs_uri or pet_dicom_gcs_prefix")
            if body.pet_suvbw_gcs_uri:
                download_file(body.pet_suvbw_gcs_uri, pet_path)
                pet_conversion = {"source": "SUVBW_NIFTI"}
            else:
                dicom_dir = download_prefix(body.pet_dicom_gcs_prefix, root / "pet_dicom")
                pet_conversion = convert_pet_dicom_to_ct_grid(
                    dicom_dir, ct_path, pet_path,
                    body.pet_series_instance_uid, body.patient_weight_kg, body.injected_dose_bq,
                )
            log_latency("download_and_pet_preprocessing", stage_started)
            stage_started = time.perf_counter()
            ct_image, ct = load_scalar_image(ct_path)
            pet_image, pet = load_scalar_image(pet_path)
            validate_aligned_images(ct_image, pet_image)
            log_latency("volume_preprocessing", stage_started)

            stage_started = time.perf_counter()
            mask_path = run_m_segmentation(input_dir, prediction_dir, body.case_id)
            log_latency("inference", stage_started)
            stage_started = time.perf_counter()
            kept_count = filter_small_components(mask_path)
            mask_image, mask = load_scalar_image(mask_path)
            if mask_image.shape != ct_image.shape or not np.allclose(mask_image.affine, ct_image.affine, atol=1e-4):
                raise ValueError("M prediction geometry does not match the CT grid")
            labels, component_count = component_labels(mask)
            if component_count != kept_count:
                raise RuntimeError("Filtered lesion component count is inconsistent")

            groups = anatomy_contract["overlap_groups"]
            required_structures = sorted({name for names in groups.values() for name in names})
            run_totalsegmentator(ct_path, anatomy_dir, required_structures)
            log_latency("mask_postprocessing_and_anatomy", stage_started)
            stage_started = time.perf_counter()
            structures, group_masks = load_anatomy_masks(anatomy_dir, groups, ct_image)

            spacing = np.asarray(nib.affines.voxel_sizes(ct_image.affine), dtype=float)
            lesions = [
                extract_lesion_features(body.case_id, patient_id, labels, component, ct, pet, spacing)
                for component in range(1, component_count + 1)
            ]
            apply_helper(lesions, helper_model)
            add_anatomy_context(lesions, labels, structures, group_masks)
            feature_order = contract.get("feature_order") or contract.get("features")
            features = aggregate_patient_features(lesions, feature_order)
            probability = float(catboost_model.predict_proba(pd.DataFrame([features], columns=feature_order))[0, 1])
            threshold = float(contract.get("candidate_threshold", contract.get("model_threshold", 0.33)))
            model_support = {
                "m_positive_probability": probability,
                "review_threshold": threshold,
                "model_review_positive": probability >= threshold,
            }
            imaging_evidence = conservative_imaging_evidence(lesions)
            rule_result = classify_m({
                "patient_id": patient_id,
                "model_support": model_support,
                "imaging_evidence": imaging_evidence,
            })
            log_latency("feature_extraction", stage_started)
            stage_started = time.perf_counter()
            lesion_json, feature_json = root / "lesions.json", root / "patient_features.json"
            write_json(lesion_json, lesions)
            write_json(feature_json, features)
            uris = {
                "lesion_mask_uri": upload_file(mask_path, f"{output_prefix}/lesion_mask.nii.gz"),
                "lesions_uri": upload_file(lesion_json, f"{output_prefix}/lesions.json"),
                "patient_features_uri": upload_file(feature_json, f"{output_prefix}/patient_features.json"),
            }
            log_latency("artifact_save_and_upload", stage_started)
            response = {
                "status": "SUCCEEDED",
                "case_id": body.case_id,
                "patient_id": patient_id,
                "model_revision": MODEL_REVISION,
                "preprocessor_revision": PREPROCESSOR_REVISION,
                "models": hashes,
                "pet_conversion": pet_conversion,
                "lesion_candidate_count": len(lesions),
                "lesions": lesions,
                "features": features,
                "model_support": model_support,
                "imaging_evidence": imaging_evidence,
                "m_rule_result": rule_result,
                "m_candidate": rule_result["m_candidate"],
                "artifacts": uris,
                "candidate_only": True,
                "physician_review_required": True,
            }
            log_latency("total", total_started)
            return response
    except (FileNotFoundError, KeyError, TypeError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/predict")
def predict(body: MPredictRequest) -> dict:
    if catboost_model is None:
        raise HTTPException(status_code=503, detail="M CatBoost model is not loaded")
    order = contract.get("feature_order") or contract.get("features")
    missing = [name for name in order if name not in body.features]
    if missing:
        raise HTTPException(status_code=422, detail=f"missing M features: {missing}")
    try:
        values = [float(body.features[name]) for name in order]
        if not all(math.isfinite(value) for value in values):
            raise ValueError("M features must be finite numbers")
        probability = float(catboost_model.predict_proba(pd.DataFrame([values], columns=order))[0, 1])
        threshold = float(contract.get("candidate_threshold", contract.get("model_threshold", 0.33)))
        model_support = {"m_positive_probability": probability, "review_threshold": threshold, "model_review_positive": probability >= threshold}
        rule_result = classify_m({"patient_id": body.patient_id, "model_support": model_support, "imaging_evidence": body.imaging_evidence})
        return {
            "patient_id": body.patient_id, "model_revision": MODEL_REVISION,
            "model_sha256": hashes["catboost_m.cbm"], "model_support": model_support,
            "m_rule_result": rule_result, "m_candidate": rule_result["m_candidate"],
            "candidate_only": True, "physician_review_required": True,
        }
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
