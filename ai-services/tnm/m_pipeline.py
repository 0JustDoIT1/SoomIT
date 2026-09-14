from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path
from typing import Any

import nibabel as nib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from scipy import ndimage


PREPROCESSOR_REVISION = "m-image-features-v1"
HELPER_FEATURE_ORDER = [
    "volume_ml", "bbox_x_mm", "bbox_y_mm", "bbox_z_mm", "bbox_diagonal_mm",
    "extent", "elongation", "flatness", "centroid_x_normalized",
    "centroid_y_normalized", "centroid_si_normalized", "ct_mean", "ct_std",
    "ct_min", "ct_max", "ct_p10", "ct_p50", "ct_p90", "ct_p95",
    "pet_intensity_mean", "pet_intensity_std", "pet_intensity_min",
    "pet_intensity_max", "pet_intensity_p10", "pet_intensity_p50",
    "pet_intensity_p90", "pet_intensity_p95", "location_band",
]
DISTANT_GROUPS = {"bone", "liver", "adrenal"}
SAFE_THRESHOLD = 0.13
STRONG_THRESHOLD = 0.46
OVERLAP_THRESHOLD = 0.20


def load_scalar_image(path: Path) -> tuple[nib.Nifti1Image, np.ndarray]:
    image = nib.load(str(path))
    if len(image.shape) != 3:
        raise ValueError(f"Expected a scalar 3D NIfTI image: {path.name}")
    data = np.asarray(image.dataobj, dtype=np.float32)
    if not np.isfinite(data).all():
        raise ValueError(f"Image contains NaN or Inf: {path.name}")
    return image, data


def validate_aligned_images(ct_image: nib.Nifti1Image, pet_image: nib.Nifti1Image) -> None:
    if ct_image.shape != pet_image.shape:
        raise ValueError(f"CT/PET shape mismatch: {ct_image.shape} != {pet_image.shape}")
    if not np.allclose(ct_image.affine, pet_image.affine, atol=1e-4):
        raise ValueError("CT/PET affine mismatch; PET must be resampled onto the CT grid")


def component_labels(mask: np.ndarray) -> tuple[np.ndarray, int]:
    return ndimage.label(mask > 0, structure=ndimage.generate_binary_structure(3, 2))


def location_band(normalized_si: float) -> str:
    # Historical helper input uses a three-level craniocaudal band.
    if normalized_si < 1.0 / 3.0:
        return "lower"
    if normalized_si < 2.0 / 3.0:
        return "middle"
    return "upper"


def _stats(prefix: str, values: np.ndarray) -> dict[str, float]:
    values = np.asarray(values, dtype=np.float64)
    if values.size == 0:
        raise ValueError(f"Cannot calculate {prefix} statistics for an empty lesion")
    return {
        f"{prefix}_mean": float(np.mean(values)),
        f"{prefix}_std": float(np.std(values)),
        f"{prefix}_min": float(np.min(values)),
        f"{prefix}_max": float(np.max(values)),
        f"{prefix}_p10": float(np.percentile(values, 10)),
        f"{prefix}_p50": float(np.percentile(values, 50)),
        f"{prefix}_p90": float(np.percentile(values, 90)),
        f"{prefix}_p95": float(np.percentile(values, 95)),
    }


def extract_lesion_features(
    case_id: str,
    patient_id: str,
    labels: np.ndarray,
    component: int,
    ct: np.ndarray,
    pet: np.ndarray,
    spacing_xyz: np.ndarray,
) -> dict[str, Any]:
    mask = labels == component
    coordinates = np.argwhere(mask)
    minimum = coordinates.min(axis=0)
    maximum = coordinates.max(axis=0)
    bbox_voxels = maximum - minimum + 1
    bbox_mm = bbox_voxels.astype(float) * spacing_xyz
    voxel_count = int(coordinates.shape[0])
    physical = coordinates.astype(float) * spacing_xyz
    covariance = np.cov(physical, rowvar=False, bias=True) if voxel_count > 1 else np.eye(3)
    eigenvalues = np.sort(np.maximum(np.linalg.eigvalsh(covariance), 1e-12))[::-1]
    normalized_centroid = coordinates.mean(axis=0) / np.maximum(np.asarray(mask.shape) - 1, 1)
    features: dict[str, Any] = {
        "case_id": case_id,
        "patient_id": patient_id,
        "lesion_id": f"{case_id}_L{component:03d}",
        "component_label": component,
        "voxel_count": voxel_count,
        "volume_ml": float(voxel_count * np.prod(spacing_xyz) / 1000.0),
        "bbox_x_mm": float(bbox_mm[0]),
        "bbox_y_mm": float(bbox_mm[1]),
        "bbox_z_mm": float(bbox_mm[2]),
        "bbox_diagonal_mm": float(np.linalg.norm(bbox_mm)),
        "extent": float(voxel_count / np.prod(bbox_voxels)),
        "elongation": float(math.sqrt(eigenvalues[0] / eigenvalues[1])),
        "flatness": float(math.sqrt(eigenvalues[1] / eigenvalues[2])),
        "centroid_x_normalized": float(normalized_centroid[0]),
        "centroid_y_normalized": float(normalized_centroid[1]),
        "centroid_si_normalized": float(normalized_centroid[2]),
    }
    features.update(_stats("ct", ct[mask]))
    features.update(_stats("pet_intensity", pet[mask]))
    features["location_band"] = location_band(features["centroid_si_normalized"])
    return features


def run_totalsegmentator(ct_path: Path, output_dir: Path, required_structures: list[str]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    executable = Path("/opt/totalseg/bin/TotalSegmentator")
    command = [
        str(executable), "-i", str(ct_path), "-o", str(output_dir),
        "-ta", "total", "-rs", *required_structures, "-d", "gpu",
    ]
    completed = subprocess.run(command, text=True, capture_output=True, timeout=3300)
    if completed.returncode:
        raise RuntimeError(completed.stderr[-4000:] or completed.stdout[-4000:])
    missing = [name for name in required_structures if not (output_dir / f"{name}.nii.gz").is_file()]
    if missing:
        raise RuntimeError(f"TotalSegmentator did not create required masks: {missing}")


def load_anatomy_masks(
    anatomy_dir: Path,
    groups: dict[str, list[str]],
    reference: nib.Nifti1Image,
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
    structures: dict[str, np.ndarray] = {}
    group_masks: dict[str, np.ndarray] = {}
    for group, names in groups.items():
        union = np.zeros(reference.shape, dtype=bool)
        for name in names:
            image = nib.load(str(anatomy_dir / f"{name}.nii.gz"))
            if image.shape != reference.shape or not np.allclose(image.affine, reference.affine, atol=1e-4):
                raise ValueError(f"Anatomy geometry mismatch: {name}")
            mask = np.asarray(image.dataobj) > 0
            structures[name] = mask
            union |= mask
        group_masks[group] = union
    return structures, group_masks


def add_anatomy_context(
    lesions: list[dict[str, Any]],
    labels: np.ndarray,
    structures: dict[str, np.ndarray],
    groups: dict[str, np.ndarray],
) -> None:
    for row in lesions:
        lesion = labels == int(row["component_label"])
        denominator = max(int(lesion.sum()), 1)
        structure_overlap = {
            name: float(np.count_nonzero(lesion & mask) / denominator)
            for name, mask in structures.items()
        }
        group_overlap = {
            group: float(np.count_nonzero(lesion & mask) / denominator)
            for group, mask in groups.items()
        }
        top_structure = max(structure_overlap, key=structure_overlap.get)
        top_group = max(group_overlap, key=group_overlap.get)
        if group_overlap[top_group] <= 0:
            top_structure, top_group = "unassigned", "unassigned"
        row.update({f"{group}_overlap_fraction": value for group, value in group_overlap.items()})
        row["brain_overlap_fraction"] = 0.0
        row["top_anatomical_structure"] = top_structure
        row["top_anatomical_group"] = top_group
        row["anatomy_covered_fraction"] = float(np.count_nonzero(lesion & np.logical_or.reduce(list(groups.values()))) / denominator)
        row["potential_distant_site_by_location"] = top_group in DISTANT_GROUPS


def apply_helper(lesions: list[dict[str, Any]], model: CatBoostClassifier) -> None:
    if not lesions:
        return
    frame = pd.DataFrame([{name: row[name] for name in HELPER_FEATURE_ORDER} for row in lesions])
    probabilities = model.predict_proba(frame[HELPER_FEATURE_ORDER])[:, 1]
    for row, probability in zip(lesions, probabilities):
        row["reference_lesion_probability"] = float(probability)
        row["filter_keep_safe_013"] = bool(probability >= SAFE_THRESHOLD)
        row["filter_keep_default_046"] = bool(probability >= STRONG_THRESHOLD)


def aggregate_patient_features(lesions: list[dict[str, Any]], feature_order: list[str]) -> dict[str, float]:
    if not lesions:
        return {name: 0.0 for name in feature_order}
    frame = pd.DataFrame(lesions)
    vol = frame["volume_ml"].astype(float).to_numpy()
    prob = frame["reference_lesion_probability"].astype(float).to_numpy()
    overlaps = {name: frame.get(f"{name}_overlap_fraction", pd.Series(0.0, index=frame.index)).astype(float).to_numpy() for name in ("lung", "bone", "liver", "adrenal")}
    core = np.column_stack([overlaps["bone"], overlaps["liver"], overlaps["adrenal"], np.zeros(len(frame))])
    core_max = core.max(axis=1)
    strong_group_count = sum(int(np.any((values >= OVERLAP_THRESHOLD) & (prob >= STRONG_THRESHOLD))) for values in core.T)
    distant_flag = frame["potential_distant_site_by_location"].astype(bool).to_numpy()
    safe = prob >= SAFE_THRESHOLD
    strong_flag = prob >= STRONG_THRESHOLD
    distant = distant_flag & safe
    strong = distant & strong_flag
    subthreshold = distant & ~strong_flag
    weighted = prob * np.log1p(np.maximum(vol, 0))
    groups = frame["top_anatomical_group"].astype(str).to_numpy()
    max_distant = float(prob[distant].max()) if distant.any() else 0.0
    non_distant = ~distant_flag
    max_non_distant = float(prob[non_distant].max()) if non_distant.any() else 0.0
    bone = distant & (groups == "bone")
    liver = distant & (groups == "liver")
    values = {
        "lesion_candidate_count": float(len(frame)),
        "max_helper_probability": float(prob.max()),
        "lung_log1p_weighted_burden": float(np.log1p(np.sum(vol * prob * overlaps["lung"]))),
        "bone_log1p_weighted_burden": float(np.log1p(np.sum(vol * prob * overlaps["bone"]))),
        "liver_log1p_weighted_burden": float(np.log1p(np.sum(vol * prob * overlaps["liver"]))),
        "strong_distant_group_count": float(strong_group_count),
        "strong_distant_max_score": float(np.max(prob * core_max)),
        "strong_distant_log1p_weighted_burden": float(np.log1p(np.sum(vol * prob * core_max))),
        "gated_distant_count": float(distant.sum()),
        "gated_distant_strong_count": float(strong.sum()),
        "gated_distant_subthreshold_count": float(subthreshold.sum()),
        "gated_distant_max_probability": max_distant,
        "gated_distant_weighted_burden": float(weighted[distant].sum()),
        "gated_strong_weighted_burden": float(weighted[strong].sum()),
        "gated_strong_group_count": float(len(set(groups[strong]))),
        "gated_bone_strong_count": float((bone & strong_flag).sum()),
        "gated_bone_subthreshold_burden": float(weighted[bone & ~strong_flag].sum()),
        "gated_liver_max_probability": float(prob[liver].max()) if liver.any() else 0.0,
        "gated_liver_strong_burden": float(weighted[liver & strong_flag].sum()),
        "gated_helper_probability_gap": max_non_distant - max_distant,
    }
    missing = [name for name in feature_order if name not in values]
    if missing:
        raise ValueError(f"Unsupported M patient features: {missing}")
    return {name: float(values[name]) for name in feature_order}


def conservative_imaging_evidence(lesions: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = [
        {
            "lesion_id": row["lesion_id"],
            "organ_system": row["top_anatomical_group"],
            "status": "indeterminate",
            "helper_probability": row["reference_lesion_probability"],
        }
        for row in lesions
        if row.get("filter_keep_safe_013") and row.get("potential_distant_site_by_location")
    ]
    return {
        "distant_metastasis_assessment_complete": False,
        "contralateral_lung_nodules": 0,
        "pleural_nodules": 0,
        "pericardial_nodules": 0,
        "malignant_pleural_effusion": False,
        "malignant_pericardial_effusion": False,
        "extrathoracic_lesions": candidates,
    }


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
