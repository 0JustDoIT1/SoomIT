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


def load_lung_union(mask_dir, reference_shape, reference_affine):
    mask_dir = Path(mask_dir)

    lung_union = np.zeros(
        reference_shape,
        dtype=bool,
    )

    mask_files = {}

    for name in LOBE_NAMES:
        path = mask_dir / f"{name}.nii.gz"

        if not path.exists():
            raise FileNotFoundError(
                f"Missing lobe mask: {path}"
            )

        img = nib.load(path)

        if img.shape != reference_shape:
            raise ValueError(
                f"{name}: shape mismatch "
                f"{img.shape} != {reference_shape}"
            )

        if not np.allclose(
            img.affine,
            reference_affine,
            atol=1e-5,
        ):
            raise ValueError(
                f"{name}: affine mismatch"
            )

        data = np.asarray(
            img.dataobj
        ) > 0

        lung_union |= data

        mask_files[name] = str(path)

    if not lung_union.any():
        raise ValueError(
            "Lung union contains no foreground voxels"
        )

    return lung_union, mask_files


def calculate_crop(
    lung_union,
    spacing_xyz,
    margin_mm,
):
    coords = np.argwhere(
        lung_union
    )

    lung_bbox_min = coords.min(
        axis=0
    )

    lung_bbox_max = (
        coords.max(axis=0) + 1
    )

    spacing_xyz = np.asarray(
        spacing_xyz,
        dtype=np.float64,
    )

    margin_vox = np.ceil(
        margin_mm / spacing_xyz
    ).astype(int)

    image_shape = np.asarray(
        lung_union.shape,
        dtype=int,
    )

    crop_min = np.maximum(
        lung_bbox_min - margin_vox,
        0,
    )

    crop_max = np.minimum(
        lung_bbox_max + margin_vox,
        image_shape,
    )

    return {
        "lung_bbox_min_xyz": lung_bbox_min,
        "lung_bbox_max_xyz": lung_bbox_max,
        "margin_vox_xyz": margin_vox,
        "crop_min_xyz": crop_min,
        "crop_max_xyz": crop_max,
    }


def crop_volume(
    volume,
    crop_min,
    crop_max,
):
    x0, y0, z0 = crop_min
    x1, y1, z1 = crop_max

    return volume[
        x0:x1,
        y0:y1,
        z0:z1,
    ]


def build_crop_affine(
    original_affine,
    crop_min_xyz,
):
    crop_min_xyz = np.asarray(
        crop_min_xyz,
        dtype=np.float64,
    )

    new_affine = np.array(
        original_affine,
        dtype=np.float64,
        copy=True,
    )

    offset_voxel = np.array([
        crop_min_xyz[0],
        crop_min_xyz[1],
        crop_min_xyz[2],
        1.0,
    ])

    new_origin = (
        original_affine
        @ offset_voxel
    )[:3]

    new_affine[:3, 3] = (
        new_origin
    )

    return new_affine


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--ct",
        required=True,
    )

    parser.add_argument(
        "--lung-mask-dir",
        required=True,
    )

    parser.add_argument(
        "--case-id",
        required=True,
    )

    parser.add_argument(
        "--output-dir",
        required=True,
    )

    parser.add_argument(
        "--margin-mm",
        type=float,
        default=50.0,
    )

    args = parser.parse_args()

    ct_path = Path(
        args.ct
    )

    output_dir = Path(
        args.output_dir
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    ct_img = nib.load(
        ct_path
    )

    ct = np.asarray(
        ct_img.dataobj,
        dtype=np.float32,
    )

    spacing_xyz = np.asarray(
        ct_img.header.get_zooms()[:3],
        dtype=np.float64,
    )

    lung_union, mask_files = (
        load_lung_union(
            args.lung_mask_dir,
            ct.shape,
            ct_img.affine,
        )
    )

    crop_info = calculate_crop(
        lung_union,
        spacing_xyz,
        args.margin_mm,
    )

    crop_min = crop_info[
        "crop_min_xyz"
    ]

    crop_max = crop_info[
        "crop_max_xyz"
    ]

    cropped_ct = crop_volume(
        ct,
        crop_min,
        crop_max,
    )

    crop_affine = (
        build_crop_affine(
            ct_img.affine,
            crop_min,
        )
    )

    output_ct = (
        output_dir
        / f"{args.case_id}_0000.nii.gz"
    )

    crop_img = nib.Nifti1Image(
        cropped_ct.astype(np.float32),
        crop_affine,
        header=ct_img.header.copy(),
    )

    crop_img.set_data_dtype(
        np.float32
    )

    nib.save(
        crop_img,
        output_ct,
    )

    output_lung_union = (
        output_dir
        / "lung_union.nii.gz"
    )

    union_img = nib.Nifti1Image(
        lung_union.astype(np.uint8),
        ct_img.affine,
        header=ct_img.header.copy(),
    )

    union_img.set_data_dtype(
        np.uint8
    )

    nib.save(
        union_img,
        output_lung_union,
    )

    crop_shape = np.asarray(
        cropped_ct.shape,
        dtype=int,
    )

    metadata = {
        "case_id": args.case_id,
        "source_ct": str(ct_path),
        "t_input": str(output_ct),

        "crop_method": (
            "lung_union_bbox_plus_physical_margin"
        ),

        "margin_mm": float(
            args.margin_mm
        ),

        "coordinate_order": "XYZ",

        "original_shape_xyz": [
            int(x)
            for x in ct.shape
        ],

        "original_spacing_xyz_mm": [
            float(x)
            for x in spacing_xyz
        ],

        "original_affine": (
            ct_img.affine.tolist()
        ),

        "lung_bbox_min_xyz": [
            int(x)
            for x in crop_info[
                "lung_bbox_min_xyz"
            ]
        ],

        "lung_bbox_max_xyz": [
            int(x)
            for x in crop_info[
                "lung_bbox_max_xyz"
            ]
        ],

        "margin_vox_xyz": [
            int(x)
            for x in crop_info[
                "margin_vox_xyz"
            ]
        ],

        "crop_min_xyz": [
            int(x)
            for x in crop_min
        ],

        "crop_max_xyz": [
            int(x)
            for x in crop_max
        ],

        "crop_shape_xyz": [
            int(x)
            for x in crop_shape
        ],

        "crop_spacing_xyz_mm": [
            float(x)
            for x in spacing_xyz
        ],

        "crop_affine": (
            crop_affine.tolist()
        ),

        "lung_union_voxels": int(
            lung_union.sum()
        ),

        "lung_masks": mask_files,

        "hu_preprocessing": (
            "none_preserve_original_hu"
        ),

        "nnunet_preprocessing": (
            "deferred_to_nnUNetv2_DefaultPreprocessor"
        ),
    }

    metadata_path = (
        output_dir
        / "crop_metadata.json"
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
        "T INPUT BUILD SUCCESS"
    )

    print(
        "Output:",
        output_ct,
    )

    print(
        "Original shape:",
        ct.shape,
    )

    print(
        "Crop shape:",
        tuple(cropped_ct.shape),
    )

    print(
        "Spacing XYZ:",
        spacing_xyz.tolist(),
    )

    print(
        "Crop min XYZ:",
        crop_min.tolist(),
    )

    print(
        "Crop max XYZ:",
        crop_max.tolist(),
    )

    print(
        "Metadata:",
        metadata_path,
    )


if __name__ == "__main__":
    main()

