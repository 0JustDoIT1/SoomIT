import argparse
import json
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage


LOBE_MAP = {
    "lung_upper_lobe_left": "lung_upper_lobe_left",
    "lung_lower_lobe_left": "lung_lower_lobe_left",
    "lung_upper_lobe_right": "lung_upper_lobe_right",
    "lung_middle_lobe_right": "lung_middle_lobe_right",
    "lung_lower_lobe_right": "lung_lower_lobe_right",
}


def load_mask(path, ref_shape, ref_affine):
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(path)

    img = nib.load(path)

    if img.shape != ref_shape:
        raise RuntimeError(
            f"Shape mismatch: {path.name} "
            f"{img.shape} != {ref_shape}"
        )

    if not np.allclose(
        img.affine,
        ref_affine,
        atol=1e-5,
    ):
        raise RuntimeError(
            f"Affine mismatch: {path.name}"
        )

    return np.asarray(img.dataobj) > 0


def minimum_distance_mm(
    tumor_mask,
    anatomy_mask,
    spacing_xyz,
):
    if not tumor_mask.any():
        return None

    if not anatomy_mask.any():
        return None

    # 실제 overlap/contact가 있으면 0 mm
    if np.any(tumor_mask & anatomy_mask):
        return 0.0

    # anatomy까지의 physical distance map
    distance_map = ndimage.distance_transform_edt(
        ~anatomy_mask,
        sampling=spacing_xyz,
    )

    distances = distance_map[
        tumor_mask
    ]

    if distances.size == 0:
        return None

    return float(
        distances.min()
    )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--ct",
        required=True,
    )

    parser.add_argument(
        "--tumor-mask",
        required=True,
    )

    parser.add_argument(
        "--thoracic-total-dir",
        required=True,
    )

    parser.add_argument(
        "--canonical-anatomy-dir",
        required=True,
    )

    parser.add_argument(
        "--output",
        required=True,
    )

    args = parser.parse_args()

    ct_path = Path(args.ct)
    tumor_path = Path(args.tumor_mask)
    total_dir = Path(args.thoracic_total_dir)
    canonical_dir = Path(args.canonical_anatomy_dir)
    output_path = Path(args.output)

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    ct_img = nib.load(ct_path)

    shape = ct_img.shape
    affine = ct_img.affine

    spacing_xyz = np.asarray(
        nib.affines.voxel_sizes(affine),
        dtype=np.float64,
    )

    tumor = load_mask(
        tumor_path,
        shape,
        affine,
    )

    tumor_voxels = int(
        tumor.sum()
    )

    if tumor_voxels == 0:
        raise RuntimeError(
            "Tumor mask is empty"
        )

    # ---------------------------------
    # Primary lobe
    # ---------------------------------

    lobe_overlap = {}

    for filename, canonical_name in LOBE_MAP.items():
        lobe_mask = load_mask(
            total_dir / f"{filename}.nii.gz",
            shape,
            affine,
        )

        intersection = int(
            np.logical_and(
                tumor,
                lobe_mask,
            ).sum()
        )

        fraction = (
            intersection / tumor_voxels
        )

        lobe_overlap[canonical_name] = {
            "intersection_voxels": intersection,
            "overlap_fraction": float(fraction),
        }

    best_lobe = max(
        lobe_overlap.items(),
        key=lambda item: item[1]["intersection_voxels"],
    )

    if best_lobe[1]["intersection_voxels"] == 0:
        primary_lobe = "unassigned"
        primary_lobe_fraction = 0.0
    else:
        primary_lobe = best_lobe[0]
        primary_lobe_fraction = float(
            best_lobe[1]["overlap_fraction"]
        )

    # ---------------------------------
    # Canonical anatomy
    # ---------------------------------

    airway = load_mask(
        canonical_dir / "airway.nii.gz",
        shape,
        affine,
    )

    heart = load_mask(
        canonical_dir / "heart.nii.gz",
        shape,
        affine,
    )

    great_vessels = load_mask(
        canonical_dir / "great_vessels.nii.gz",
        shape,
        affine,
    )

    esophagus = load_mask(
        canonical_dir / "esophagus.nii.gz",
        shape,
        affine,
    )

    vertebral = load_mask(
        canonical_dir / "vertebral_body_proxy.nii.gz",
        shape,
        affine,
    )

    chest_wall = load_mask(
        canonical_dir / "chest_wall_proxy.nii.gz",
        shape,
        affine,
    )

    # ---------------------------------
    # Physical minimum distances
    # ---------------------------------

    features = {
        "primary_lobe_tumor_overlap_fraction":
            primary_lobe_fraction,

        "airway_t4_proxy_minimum_distance_mm":
            minimum_distance_mm(
                tumor,
                airway,
                spacing_xyz,
            ),

        "heart_pericardial_t4_proxy_minimum_distance_mm":
            minimum_distance_mm(
                tumor,
                heart,
                spacing_xyz,
            ),

        "great_vessels_t4_proxy_minimum_distance_mm":
            minimum_distance_mm(
                tumor,
                great_vessels,
                spacing_xyz,
            ),

        "esophagus_t4_proxy_minimum_distance_mm":
            minimum_distance_mm(
                tumor,
                esophagus,
                spacing_xyz,
            ),

        "vertebral_body_t4_proxy_minimum_distance_mm":
            minimum_distance_mm(
                tumor,
                vertebral,
                spacing_xyz,
            ),

        "chest_wall_t3_proxy_minimum_distance_mm":
            minimum_distance_mm(
                tumor,
                chest_wall,
                spacing_xyz,
            ),

        "primary_lobe":
            primary_lobe,
    }

    output = {
        "source_ct": str(ct_path),
        "source_tumor_mask": str(tumor_path),

        "geometry": {
            "shape_xyz": [
                int(x)
                for x in shape
            ],
            "spacing_xyz_mm": [
                float(x)
                for x in spacing_xyz
            ],
        },

        "tumor_voxels": tumor_voxels,

        "lobe_overlap": lobe_overlap,

        "features": features,

        "feature_notes": {
            "distance_definition":
                "minimum physical voxel-center distance using scipy.ndimage.distance_transform_edt with sampling=spacing_xyz",

            "distance_overlap_policy":
                "0.0 mm when tumor and anatomy masks overlap",

            "primary_lobe":
                "lobe with maximum tumor-mask voxel overlap; unassigned when all overlaps are zero",

            "heart_pericardial_t4_proxy":
                "currently uses TotalSegmentator heart mask",

            "great_vessels_t4_proxy":
                "currently uses QA canonical great-vessels union",

            "vertebral_body_t4_proxy":
                "currently uses T1-T12 union",

            "chest_wall_t3_proxy":
                "currently uses ribs + sternum union",
        },
    }

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            output,
            f,
            indent=2,
            ensure_ascii=False,
        )

    print("N ANATOMY FEATURE EXTRACTION SUCCESS")
    print("Primary lobe:", primary_lobe)
    print(
        "Primary lobe overlap:",
        primary_lobe_fraction,
    )

    for key, value in features.items():
        if "distance_mm" in key:
            print(key, "=", value)

    print("Output:", output_path)


if __name__ == "__main__":
    main()

