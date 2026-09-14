import argparse
import json
from pathlib import Path

import nibabel as nib
import numpy as np


LOBE_NAMES = [
    "lung_upper_lobe_left",
    "lung_lower_lobe_left",
    "lung_upper_lobe_right",
    "lung_middle_lobe_right",
    "lung_lower_lobe_right",
]


def load_mask(path, reference_shape, reference_affine):
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(path)

    img = nib.load(path)

    if img.shape != reference_shape:
        raise ValueError(
            f"shape mismatch: {path.name} "
            f"{img.shape} != {reference_shape}"
        )

    if not np.allclose(
        img.affine,
        reference_affine,
        atol=1e-5,
    ):
        raise ValueError(
            f"affine mismatch: {path.name}"
        )

    return np.asarray(img.dataobj) > 0


def union_masks(paths, reference_shape, reference_affine):
    result = np.zeros(
        reference_shape,
        dtype=bool,
    )

    for path in paths:
        result |= load_mask(
            path,
            reference_shape,
            reference_affine,
        )

    return result


def save_mask(mask, output_path, reference_img):
    img = nib.Nifti1Image(
        mask.astype(np.uint8),
        reference_img.affine,
        header=reference_img.header.copy(),
    )

    img.set_data_dtype(
        np.uint8
    )

    nib.save(
        img,
        output_path,
    )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--anatomy-dir",
        required=True,
    )

    parser.add_argument(
        "--output-dir",
        required=True,
    )

    parser.add_argument(
        "--case-id",
        required=True,
    )

    args = parser.parse_args()

    anatomy_dir = Path(
        args.anatomy_dir
    )

    total_dir = (
        anatomy_dir
        / "thoracic_total"
    )

    vessel_dir = (
        anatomy_dir
        / "lung_vessels"
    )

    output_dir = Path(
        args.output_dir
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    reference_path = (
        total_dir
        / "heart.nii.gz"
    )

    reference_img = nib.load(
        reference_path
    )

    shape = reference_img.shape
    affine = reference_img.affine

    outputs = {}

    # Lung union
    lung_union = union_masks(
        [
            total_dir / f"{name}.nii.gz"
            for name in LOBE_NAMES
        ],
        shape,
        affine,
    )

    outputs["lung_union"] = lung_union

    # Airway
    outputs["airway"] = load_mask(
        vessel_dir / "lung_airways.nii.gz",
        shape,
        affine,
    )

    # Heart / pericardial proxy
    outputs["heart"] = load_mask(
        total_dir / "heart.nii.gz",
        shape,
        affine,
    )

    # Great-vessel proxy
    outputs["great_vessels"] = union_masks(
        [
            total_dir / "aorta.nii.gz",
            total_dir / "pulmonary_vein.nii.gz",
            vessel_dir / "lung_arteries.nii.gz",
            vessel_dir / "lung_veins.nii.gz",
        ],
        shape,
        affine,
    )

    # Esophagus
    outputs["esophagus"] = load_mask(
        total_dir / "esophagus.nii.gz",
        shape,
        affine,
    )

    # Thoracic vertebrae proxy
    outputs["vertebral_body_proxy"] = union_masks(
        [
            total_dir / f"vertebrae_T{i}.nii.gz"
            for i in range(1, 13)
        ],
        shape,
        affine,
    )

    # Chest wall proxy
    rib_paths = [
        total_dir / f"rib_left_{i}.nii.gz"
        for i in range(1, 13)
    ] + [
        total_dir / f"rib_right_{i}.nii.gz"
        for i in range(1, 13)
    ]

    outputs["chest_wall_proxy"] = union_masks(
        rib_paths
        + [total_dir / "sternum.nii.gz"],
        shape,
        affine,
    )

    metadata = {
        "case_id": args.case_id,
        "source_anatomy_dir": str(anatomy_dir),
        "coordinate_geometry": "same_as_CT",
        "masks": {},
        "notes": {
            "great_vessels": (
                "QA proxy union: aorta + pulmonary_vein "
                "+ lung_arteries + lung_veins"
            ),
            "vertebral_body_proxy": (
                "QA proxy union of vertebrae_T1-T12"
            ),
            "chest_wall_proxy": (
                "QA proxy union of ribs + sternum"
            ),
        },
    }

    for name, mask in outputs.items():
        output_path = (
            output_dir
            / f"{name}.nii.gz"
        )

        save_mask(
            mask,
            output_path,
            reference_img,
        )

        metadata["masks"][name] = {
            "path": str(output_path),
            "foreground_voxels": int(
                mask.sum()
            ),
        }

    metadata_path = (
        output_dir
        / "canonical_anatomy_metadata.json"
    )

    with open(
        metadata_path,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            metadata,
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(
        "CANONICAL ANATOMY BUILD SUCCESS"
    )

    for name, mask in outputs.items():
        print(
            f"{name}:",
            int(mask.sum()),
            "voxels",
        )

    print(
        "Metadata:",
        metadata_path,
    )


if __name__ == "__main__":
    main()

