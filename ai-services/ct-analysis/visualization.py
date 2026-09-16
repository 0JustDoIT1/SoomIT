from __future__ import annotations

import argparse
import json
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure


LOBE_LAYERS = (
    ("LUL", "Left upper lobe", "lung_upper_lobe_left.nii.gz", "#67C8FF"),
    ("LLL", "Left lower lobe", "lung_lower_lobe_left.nii.gz", "#4EA5D9"),
    ("RUL", "Right upper lobe", "lung_upper_lobe_right.nii.gz", "#8ED1A5"),
    ("RML", "Right middle lobe", "lung_middle_lobe_right.nii.gz", "#62B77D"),
    ("RLL", "Right lower lobe", "lung_lower_lobe_right.nii.gz", "#3E8F5A"),
)
ANATOMY_LAYERS = (
    ("airway", "Airway", "airway.nii.gz", "#F6C85F"),
    ("heart", "Heart", "heart.nii.gz", "#D95F76"),
    ("great_vessels", "Great vessels", "great_vessels.nii.gz", "#9B59B6"),
    ("esophagus", "Esophagus", "esophagus.nii.gz", "#E67E22"),
    ("vertebral_body", "Vertebral body", "vertebral_body_proxy.nii.gz", "#D7CCC8"),
    ("chest_wall", "Chest wall", "chest_wall_proxy.nii.gz", "#B0BEC5"),
)


def _rgba(hex_color: str, alpha: int = 255) -> list[int]:
    value = hex_color.lstrip("#")
    return [int(value[index:index + 2], 16) for index in (0, 2, 4)] + [alpha]


def _write_mesh(mask: np.ndarray, affine: np.ndarray, output_path: Path, color: str, *, step_size: int) -> dict:
    # Padding closes structures that touch a volume edge. The vertex offset
    # maps the padded voxel coordinates back into the original NIfTI grid.
    padded = np.pad(mask.astype(np.uint8), 1)
    try:
        vertices, faces, _, _ = measure.marching_cubes(
            padded,
            level=0.5,
            step_size=step_size,
            allow_degenerate=False,
        )
    except (RuntimeError, ValueError):
        if step_size == 1:
            raise
        vertices, faces, _, _ = measure.marching_cubes(
            padded,
            level=0.5,
            step_size=1,
            allow_degenerate=False,
        )
    vertices -= 1.0
    vertices = nib.affines.apply_affine(affine, vertices)
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    mesh.visual.face_colors = _rgba(color)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(output_path, file_type="glb")
    return {
        "vertex_count": int(len(mesh.vertices)),
        "face_count": int(len(mesh.faces)),
        "size_bytes": output_path.stat().st_size,
    }


def _layer(layer_id: str, name: str, category: str, path: Path, color: str, stats: dict) -> dict:
    return {
        "id": layer_id,
        "name": name,
        "category": category,
        "mesh_relative_path": path.as_posix(),
        "color": color,
        "default_visible": category in {"NODULE", "LUNG_LOBE"},
        "default_opacity": 1.0 if category == "NODULE" else 0.18,
        "supported_render_modes": ["surface", "wireframe"],
        **stats,
    }


def label_nodule_components(nodule_image) -> list[np.ndarray]:
    """Split a binary nodule mask into ordered, size-filtered connected components.

    Shared by the GLB and Cornerstone labelmap exporters so a nodule's numeric
    order (N001, N002, ...) is identical in both. Ordered by descending voxel
    count; components smaller than a 3 mm-diameter sphere are dropped as noise.
    """
    nodule_mask = np.asarray(nodule_image.dataobj) > 0
    labels, count = ndimage.label(nodule_mask, structure=np.ones((3, 3, 3), dtype=np.uint8))
    components = [labels == label_id for label_id in range(1, count + 1)]
    components = sorted((item for item in components if item.any()), key=lambda item: int(item.sum()), reverse=True)
    voxel_volume = float(np.prod(nodule_image.header.get_zooms()[:3]))
    return [
        item for item in components
        if (6.0 * float(item.sum()) * voxel_volume / np.pi) ** (1.0 / 3.0) >= 3.0
    ]


def generate_visualization(*, segmentation_path: Path, lobe_dir: Path, canonical_dir: Path, output_dir: Path, case_id: str) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    layers: list[dict] = []

    nodule_image = nib.load(str(segmentation_path))
    for index, component in enumerate(label_nodule_components(nodule_image), start=1):
        layer_id = f"N{index:03d}"
        relative_path = Path("nodules") / f"{layer_id}.glb"
        stats = _write_mesh(component, nodule_image.affine, output_dir / relative_path, "#FF3B30", step_size=1)
        layers.append(_layer(layer_id, f"Nodule {index}", "NODULE", relative_path, "#FF3B30", stats))

    for layer_id, name, filename, color in LOBE_LAYERS:
        image = nib.load(str(lobe_dir / filename))
        mask = np.asarray(image.dataobj) > 0
        if mask.any():
            relative_path = Path("lung_lobes") / f"{layer_id}.glb"
            stats = _write_mesh(mask, image.affine, output_dir / relative_path, color, step_size=2)
            layers.append(_layer(layer_id, name, "LUNG_LOBE", relative_path, color, stats))

    for layer_id, name, filename, color in ANATOMY_LAYERS:
        image = nib.load(str(canonical_dir / filename))
        mask = np.asarray(image.dataobj) > 0
        if mask.any():
            relative_path = Path("anatomy") / f"{layer_id}.glb"
            stats = _write_mesh(mask, image.affine, output_dir / relative_path, color, step_size=2)
            layers.append(_layer(layer_id, name, "ANATOMY", relative_path, color, stats))

    manifest = {
        "schema_version": "ct-visualization-v1",
        "case_id": case_id,
        "coordinate_system": "NIfTI physical coordinates (millimetres)",
        "source_geometry": "same_as_CT",
        "layers": layers,
    }
    manifest_path = output_dir / "visualization_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--segmentation", type=Path, required=True)
    parser.add_argument("--lobe-dir", type=Path, required=True)
    parser.add_argument("--canonical-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--case-id", required=True)
    args = parser.parse_args()
    generate_visualization(
        segmentation_path=args.segmentation,
        lobe_dir=args.lobe_dir,
        canonical_dir=args.canonical_dir,
        output_dir=args.output_dir,
        case_id=args.case_id,
    )


if __name__ == "__main__":
    main()
