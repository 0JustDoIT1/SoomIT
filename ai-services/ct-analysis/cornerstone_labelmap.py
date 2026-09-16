from __future__ import annotations

import argparse
import json
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage

from visualization import ANATOMY_LAYERS, LOBE_LAYERS, label_nodule_components


SCHEMA_VERSION = "ct-cornerstone-labelmap-v1"


def _rgb(hex_color: str) -> list[int]:
    value = hex_color.lstrip("#")
    return [int(value[index:index + 2], 16) for index in (0, 2, 4)]


def _segment(segment_index: int, layer_id: str, name: str, category: str, color: str, *, default_visible: bool, default_opacity: float) -> dict:
    return {
        "segment_index": segment_index,
        "id": layer_id,
        "name": name,
        "category": category,
        "color": _rgb(color),
        "default_visible": default_visible,
        "default_opacity": default_opacity,
    }


def _resample_to_ct_grid(mask: np.ndarray, source_affine: np.ndarray, target_shape: tuple[int, ...], target_affine: np.ndarray) -> np.ndarray:
    """Align a mask onto the CT voxel grid, nearest-neighbour since labels are categorical."""
    if mask.shape == target_shape and np.allclose(source_affine, target_affine, atol=1e-3):
        return mask
    voxel_to_voxel = np.linalg.inv(source_affine) @ target_affine
    resampled = ndimage.affine_transform(
        mask.astype(np.uint8),
        voxel_to_voxel[:3, :3],
        offset=voxel_to_voxel[:3, 3],
        output_shape=target_shape,
        order=0,
        mode="constant",
        cval=0,
    )
    return resampled > 0


def generate_cornerstone_segmentation(*, segmentation_path: Path, lobe_dir: Path, canonical_dir: Path, ct_path: Path, output_dir: Path, case_id: str) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)

    ct_image = nib.load(str(ct_path))
    target_shape = ct_image.shape[:3]
    target_affine = ct_image.affine

    labelmap = np.zeros(target_shape, dtype=np.uint16)
    segments: list[dict] = []

    nodule_image = nib.load(str(segmentation_path))
    for index, component in enumerate(label_nodule_components(nodule_image), start=1):
        mask = _resample_to_ct_grid(component, nodule_image.affine, target_shape, target_affine)
        labelmap[mask] = index
        segments.append(_segment(index, f"N{index:03d}", f"Nodule {index}", "NODULE", "#FF3B30", default_visible=True, default_opacity=0.7))

    for offset, (layer_id, name, filename, color) in enumerate(LOBE_LAYERS):
        image = nib.load(str(lobe_dir / filename))
        mask = np.asarray(image.dataobj) > 0
        if not mask.any():
            continue
        segment_index = 101 + offset
        mask = _resample_to_ct_grid(mask, image.affine, target_shape, target_affine)
        # Preserve the higher-priority nodule labels already written above.
        labelmap[mask & (labelmap == 0)] = segment_index
        segments.append(_segment(segment_index, layer_id, name, "LUNG_LOBE", color, default_visible=True, default_opacity=0.5))

    for offset, (layer_id, name, filename, color) in enumerate(ANATOMY_LAYERS):
        image = nib.load(str(canonical_dir / filename))
        mask = np.asarray(image.dataobj) > 0
        if not mask.any():
            continue
        segment_index = 201 + offset
        mask = _resample_to_ct_grid(mask, image.affine, target_shape, target_affine)
        # A scalar labelmap cannot represent overlaps. Keep nodules highest
        # priority, then let anatomy replace lung-lobe context where they cross.
        nodule_voxels = (labelmap >= 1) & (labelmap < 101)
        labelmap[mask & ~nodule_voxels] = segment_index
        segments.append(_segment(segment_index, layer_id, name, "ANATOMY", color, default_visible=False, default_opacity=0.35))

    max_segment_index = max((item["segment_index"] for item in segments), default=0)
    scalar_type = "uint8" if max_segment_index <= 255 else "uint16"
    if scalar_type == "uint8":
        labelmap = labelmap.astype(np.uint8)

    # Cornerstone/DICOM volumes iterate slice-major: frame (k), row (j), column (i).
    dicom_order = np.transpose(labelmap, (2, 1, 0))
    (output_dir / "labelmap.bin").write_bytes(dicom_order.tobytes(order="C"))

    # NIfTI affines are RAS; DICOM/Cornerstone3D expect LPS. Flip X and Y so
    # geometry.json lines up with the original series instead of appearing
    # mirrored left-right and front-back in the viewer.
    target_affine_lps = np.diag([-1.0, -1.0, 1.0, 1.0]) @ target_affine
    spacing = nib.affines.voxel_sizes(target_affine_lps)
    direction = (target_affine_lps[:3, :3] / spacing).flatten().tolist()
    geometry = {
        "dimensions": [int(value) for value in target_shape],
        "spacing": [float(value) for value in spacing],
        "origin": [float(value) for value in target_affine_lps[:3, 3]],
        "direction": direction,
        "voxel_order": "slice_row_column",
    }
    (output_dir / "geometry.json").write_text(json.dumps(geometry, indent=2), encoding="utf-8")

    metadata = {
        "schema_version": SCHEMA_VERSION,
        "case_id": case_id,
        "scalar_type": scalar_type,
        "dimensions": geometry["dimensions"],
        "segments": segments,
    }
    (output_dir / "labelmap_metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "case_id": case_id,
        "scalar_type": scalar_type,
        "dimensions": geometry["dimensions"],
        "labelmap_relative_path": "labelmap.bin",
        "metadata_relative_path": "labelmap_metadata.json",
        "geometry_relative_path": "geometry.json",
        "segments": segments,
    }
    (output_dir / "cornerstone_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--segmentation", type=Path, required=True)
    parser.add_argument("--lobe-dir", type=Path, required=True)
    parser.add_argument("--canonical-dir", type=Path, required=True)
    parser.add_argument("--ct", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--case-id", required=True)
    args = parser.parse_args()
    generate_cornerstone_segmentation(
        segmentation_path=args.segmentation,
        lobe_dir=args.lobe_dir,
        canonical_dir=args.canonical_dir,
        ct_path=args.ct,
        output_dir=args.output_dir,
        case_id=args.case_id,
    )


if __name__ == "__main__":
    main()
