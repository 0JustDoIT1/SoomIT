from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import nibabel as nib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from scipy import ndimage

from model_io import ensure_file
from nnunet_runtime import ResidentNnUNetPredictor
from storage_io import download_file, upload_file


MODEL_ROOT = Path(os.environ.get("MODEL_ROOT", "/models"))
DATASET = "Dataset504_Lung1PrimaryTumorLungCrop50mm417"
TRAINER = "nnUNetTrainer_250epochs"
CONFIGURATION = "3d_fullres"
MODEL_DIR = MODEL_ROOT / "nnUNet_results" / DATASET / f"{TRAINER}__nnUNetPlans__{CONFIGURATION}"
FOLD_DIR = MODEL_DIR / "fold_0"
MODEL_REVISION = os.environ.get("MODEL_REVISION", "tnm-t-v1.0.0")
MODEL_GCS_PREFIX = os.environ.get("T_MODEL_GCS_PREFIX", "gs://soomit-bucket/models/tnm/t").rstrip("/")
OUTPUT_PREFIX = os.environ.get("TNM_OUTPUT_GCS_PREFIX", "gs://soomit-bucket/tnm").rstrip("/")
CASE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
MODEL_FILES = {
    "checkpoint_best.pth": (FOLD_DIR / "checkpoint_best.pth", os.environ.get("T_CHECKPOINT_SHA256")),
    "plans.json": (MODEL_DIR / "plans.json", os.environ.get("T_PLANS_SHA256")),
    "dataset.json": (MODEL_DIR / "dataset.json", os.environ.get("T_DATASET_SHA256")),
}
model_hashes: dict[str, str] = {}
nnunet_predictor: ResidentNnUNetPredictor | None = None
inference_lock = threading.Lock()
logger = logging.getLogger("uvicorn.error")


def log_latency(stage: str, started: float) -> None:
    logger.info(
        "latency service=tnm_t stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


def size_category(size_mm: float | None) -> str:
    if not size_mm or size_mm <= 0:
        return "TX"
    if size_mm <= 10:
        return "T1a"
    if size_mm <= 20:
        return "T1b"
    if size_mm <= 30:
        return "T1c"
    if size_mm <= 40:
        return "T2a"
    if size_mm <= 50:
        return "T2b"
    if size_mm <= 70:
        return "T3"
    return "T4"


def quantify(mask_path: Path) -> dict:
    image = nib.load(str(mask_path))
    mask = np.asarray(image.dataobj) > 0
    if not mask.any():
        return {"tumor_detected": False, "tumor_volume_ml": None, "mask_bbox_diagonal_mm": None, "component_count": 0}
    spacing = np.asarray(image.header.get_zooms()[:3], dtype=float)
    volume_ml = float(mask.sum() * np.prod(spacing) / 1000.0)
    labels, count = ndimage.label(mask)
    coords = np.argwhere(mask)
    extent = (coords.max(axis=0) - coords.min(axis=0) + 1) * spacing
    diameter = float(np.linalg.norm(extent))
    return {
        "tumor_detected": True,
        "tumor_volume_ml": volume_ml,
        "mask_bbox_diagonal_mm": diameter,
        "component_count": int(count),
        "diameter_method": "physical bounding-box diagonal; physician verification required",
    }


def component_candidates(mask_path: Path) -> tuple[np.ndarray, int, list[dict]]:
    image = nib.load(str(mask_path))
    mask = np.asarray(image.dataobj) > 0
    labels, count = ndimage.label(mask)
    spacing = np.asarray(image.header.get_zooms()[:3], dtype=float)
    candidates = []
    for component_id in range(1, int(count) + 1):
        coordinates = np.argwhere(labels == component_id)
        minimum = coordinates.min(axis=0)
        maximum = coordinates.max(axis=0)
        voxel_count = int(coordinates.shape[0])
        bbox_size_mm = (maximum - minimum + 1) * spacing
        centroid_mm = nib.affines.apply_affine(image.affine, coordinates.mean(axis=0))
        candidates.append({
            "component_id": component_id,
            "voxel_count": voxel_count,
            "volume_ml": float(voxel_count * np.prod(spacing) / 1000.0),
            "bbox": {
                "min_voxel": minimum.tolist(),
                "max_voxel": maximum.tolist(),
                "size_mm": bbox_size_mm.tolist(),
            },
            "centroid": {
                "voxel": coordinates.mean(axis=0).tolist(),
                "mm": centroid_mm.tolist(),
            },
        })
    return labels, int(count), candidates


def select_component(mask_path: Path, component_id: int) -> None:
    image = nib.load(str(mask_path))
    mask = np.asarray(image.dataobj) > 0
    labels, count = ndimage.label(mask)
    if component_id < 1 or component_id > int(count):
        raise ValueError(f"primary_component_id must identify a component from 1 to {count}")
    selected = (labels == component_id).astype(np.uint8)
    output = nib.Nifti1Image(selected, image.affine, header=image.header.copy())
    output.set_data_dtype(np.uint8)
    nib.save(output, str(mask_path))


def select_primary_component(
    mask_path: Path,
    labels: np.ndarray,
    candidates: list[dict],
    metadata: dict,
    target_mask_path: Path | None,
) -> tuple[int, dict]:
    """Choose a deterministic T component in original CT geometry."""
    image = nib.load(str(mask_path))
    target_mask = None
    if target_mask_path is not None:
        target_image = nib.load(str(target_mask_path))
        if target_image.shape != image.shape or not np.allclose(target_image.affine, image.affine, atol=1e-5):
            raise ValueError("Target nodule mask geometry does not match restored T mask")
        target_mask = np.asarray(target_image.dataobj) > 0

    target_centroid_xyz = metadata.get("target_centroid_xyz")
    target_centroid_mm = None
    if isinstance(target_centroid_xyz, list) and len(target_centroid_xyz) == 3:
        target_centroid_mm = nib.affines.apply_affine(image.affine, np.asarray(target_centroid_xyz, dtype=float))

    ranked = []
    for candidate in candidates:
        component_id = int(candidate["component_id"])
        component = labels == component_id
        intersection = int(np.logical_and(component, target_mask).sum()) if target_mask is not None else 0
        union = int(np.logical_or(component, target_mask).sum()) if target_mask is not None else 0
        overlap_iou = float(intersection / union) if union else 0.0
        centroid_distance_mm = float("inf")
        if target_centroid_mm is not None:
            centroid_distance_mm = float(np.linalg.norm(
                np.asarray(candidate["centroid"]["mm"], dtype=float) - target_centroid_mm
            ))
        ranked.append({
            "component_id": component_id,
            "overlap_iou": overlap_iou,
            "centroid_distance_mm": centroid_distance_mm,
            "volume_ml": float(candidate["volume_ml"]),
        })

    selected = min(
        ranked,
        key=lambda item: (
            -item["overlap_iou"],
            item["centroid_distance_mm"],
            -item["volume_ml"],
            item["component_id"],
        ),
    )
    return int(selected["component_id"]), selected


def restore_to_original_geometry(crop_mask_path: Path, metadata_path: Path, output_path: Path) -> Path:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    crop_image = nib.load(str(crop_mask_path))
    crop_mask = np.asarray(crop_image.dataobj) > 0
    crop_min = np.asarray(metadata["crop_min_xyz"], dtype=int)
    crop_max = np.asarray(metadata["crop_max_xyz"], dtype=int)
    original_shape = tuple(int(value) for value in metadata["original_shape_xyz"])
    expected_shape = tuple((crop_max - crop_min).tolist())
    if crop_mask.shape != expected_shape:
        raise ValueError(f"T mask/crop metadata shape mismatch: {crop_mask.shape} != {expected_shape}")
    restored = np.zeros(original_shape, dtype=np.uint8)
    restored[
        crop_min[0]:crop_max[0], crop_min[1]:crop_max[1], crop_min[2]:crop_max[2]
    ] = crop_mask.astype(np.uint8)
    image = nib.Nifti1Image(restored, np.asarray(metadata["original_affine"], dtype=float))
    image.set_data_dtype(np.uint8)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    nib.save(image, str(output_path))
    return output_path


@asynccontextmanager
async def lifespan(_: FastAPI):
    global nnunet_predictor
    started = time.perf_counter()
    for name, (path, expected) in MODEL_FILES.items():
        model_hashes[name] = ensure_file(f"{MODEL_GCS_PREFIX}/{name}", path, expected)
    nnunet_predictor = ResidentNnUNetPredictor(MODEL_DIR, "checkpoint_best.pth")
    log_latency("model_initialization", started)
    yield
    nnunet_predictor = None


app = FastAPI(title="SoomIT TNM T", version="1.0.0", lifespan=lifespan)


class TRequest(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
    t_input_uri: str
    crop_metadata_uri: str | None = None
    output_gcs_uri: str | None = None
    primary_component_id: int | None = Field(default=None, ge=1)


@app.get("/health")
def health() -> dict:
    if len(model_hashes) != len(MODEL_FILES) or nnunet_predictor is None:
        raise HTTPException(status_code=503, detail="T model is not loaded")
    return {"status": "ok", "component": "T", "model_revision": MODEL_REVISION, "models": model_hashes, "device": "cuda"}


@app.post("/v1/predict")
def predict(body: TRequest) -> dict:
    total_started = time.perf_counter()
    if not CASE_PATTERN.fullmatch(body.case_id):
        raise HTTPException(status_code=422, detail="invalid case_id")
    destination = body.output_gcs_uri or f"{OUTPUT_PREFIX}/{body.case_id}/t/tumor_mask.nii.gz"
    try:
        with tempfile.TemporaryDirectory(prefix="tnm-t-") as temporary:
            root = Path(temporary)
            input_dir, output_dir = root / "input", root / "output"
            stage_started = time.perf_counter()
            download_file(body.t_input_uri, input_dir / f"{body.case_id}_0000.nii.gz")
            metadata_uri = body.crop_metadata_uri or body.t_input_uri.rsplit("/", 1)[0] + "/crop_metadata.json"
            metadata_path = download_file(metadata_uri, input_dir / "crop_metadata.json")
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            target_mask_path = None
            target_mask_uri = metadata.get("target_mask_uri")
            if isinstance(target_mask_uri, str) and target_mask_uri.startswith("gs://"):
                # nnU-Net treats every NIfTI file in input_dir as an inference
                # case. Keep this post-processing-only mask outside that folder.
                target_mask_path = download_file(target_mask_uri, root / "metadata" / "target_nodule_mask.nii.gz")
            log_latency("download", stage_started)
            output_dir.mkdir(parents=True)
            if nnunet_predictor is None:
                raise RuntimeError("T predictor is not initialized")
            stage_started = time.perf_counter()
            with inference_lock:
                nnunet_predictor.predict(input_dir, output_dir)
            log_latency("inference", stage_started)
            mask_path = output_dir / f"{body.case_id}.nii.gz"
            if not mask_path.is_file():
                raise FileNotFoundError("nnU-Net did not create the expected tumor mask")
            stage_started = time.perf_counter()
            restored_mask_path = restore_to_original_geometry(mask_path, metadata_path, root / "restored" / "tumor_mask.nii.gz")
            labels, prediction_component_count, components = component_candidates(restored_mask_path)
            if prediction_component_count == 0:
                raise ValueError("T prediction contains no connected component")
            if body.primary_component_id is not None:
                primary_component_id = body.primary_component_id
                primary_component_selection = {"component_id": primary_component_id, "method": "request_override"}
            else:
                primary_component_id, primary_component_selection = select_primary_component(
                    restored_mask_path, labels, components, metadata, target_mask_path
                )
                primary_component_selection["method"] = "auto-primary-v1"
            select_component(restored_mask_path, primary_component_id)
            metrics = quantify(restored_mask_path)
            metrics["prediction_component_count"] = prediction_component_count
            log_latency("postprocessing", stage_started)
            stage_started = time.perf_counter()
            upload_file(restored_mask_path, destination)
            log_latency("upload", stage_started)
            response = {
                "status": "completed", "case_id": body.case_id, "model_revision": MODEL_REVISION,
                "model_sha256": model_hashes["checkpoint_best.pth"], "tumor_mask_uri": destination,
                "mask_geometry": "original_ct",
                "target_nodule_id": metadata.get("target_nodule_id"),
                "primary_component_id": primary_component_id,
                "selection_rule_version": metadata.get("selection_rule_version", "auto-primary-v1"),
                "primary_component_selection": primary_component_selection,
                **metrics,
                "t_candidate": None,
                "size_only_t_candidate": size_category(metrics["mask_bbox_diagonal_mm"]),
                "t_candidate_status": "REQUIRES_VERIFIED_MAXIMUM_DIAMETER_AND_INVASION_EVIDENCE",
                "candidate_only": True, "physician_review_required": True,
            }
            log_latency("total", total_started)
            return response
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
