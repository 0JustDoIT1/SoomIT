import argparse
import json
from pathlib import Path

import nibabel as nib
import numpy as np
import sys

from model import Vista3DModel
from preprocessing import inspect_input_ct
from postprocessing import (
    to_binary_nodule_mask,
    save_binary_mask,
)


POSTPROCESS_DIR = Path(__file__).resolve().parent / "postprocess"
sys.path.insert(0, str(POSTPROCESS_DIR))

from nodule_patch import (
    split_nodule_components,
    make_morphology_patch,
    make_malignancy_patch,
    filter_components_by_equivalent_diameter,
)


MODEL_NAME = "VISTA3D"
MODEL_VERSION = "vista3d-lidc-v1.0.0"


def run_inference(
    image_file,
    output_mask,
    output_metadata=None,
):
    image_file = Path(image_file)
    output_mask = Path(output_mask)

    original = inspect_input_ct(image_file)

    print("[1/5] Input CT")
    print(" shape   :", original["shape_xyz"])
    print(" spacing :", original["spacing_xyz_mm"])

    print("[2/5] Loading VISTA3D")
    model = Vista3DModel()

    print("[3/5] Running inference")
    raw_pred = model.predict(image_file)

    print("[4/5] Postprocessing")
    binary_mask = to_binary_nodule_mask(raw_pred)

    if tuple(binary_mask.shape) != tuple(
        original["shape_xyz"]
    ):
        raise RuntimeError(
            f"Prediction/original shape mismatch: "
            f"{binary_mask.shape} vs {original['shape_xyz']}"
        )

    save_binary_mask(
        mask=binary_mask,
        output_file=output_mask,
        reference_affine=original["affine"],
        reference_header=original["header"],
    )

    print("[5/5] Output QA")

    saved = nib.load(str(output_mask))
    saved_mask = saved.get_fdata()

    shape_match = (
        tuple(saved.shape)
        == tuple(original["shape_xyz"])
    )

    affine_match = np.allclose(
        saved.affine,
        original["affine"],
        atol=1e-5,
    )

    unique_labels = [
        int(x)
        for x in np.unique(saved_mask)
    ]

    foreground_voxels = int(
        (saved_mask > 0).sum()
    )

    # --------------------------------------------------
    # Downstream nodule patch generation
    # NIfTI/nibabel array order: XYZ
    # Patch generator order: ZYX
    # --------------------------------------------------
    ct_xyz = nib.load(str(image_file)).get_fdata().astype(np.float32)

    ct_zyx = np.transpose(
        ct_xyz,
        (2, 1, 0),
    )

    mask_zyx = np.transpose(
        binary_mask,
        (2, 1, 0),
    )

    spacing_xyz = np.asarray(
        original["spacing_xyz_mm"],
        dtype=np.float32,
    )

    spacing_zyx = spacing_xyz[::-1]

    all_components = split_nodule_components(
        mask_zyx
    )

    component_filter = (
        filter_components_by_equivalent_diameter(
            all_components,
            spacing_zyx=spacing_zyx,
            min_diameter_mm=3.0,
        )
    )

    components = component_filter["kept"]
    rejected_components = component_filter["rejected"]

    rejected_outputs = [
        {
            "nodule_id": c["nodule_id"],
            "voxel_count": int(c["voxel_count"]),
            "center_zyx": [
                float(x)
                for x in c["center_zyx"]
            ],
            "volume_mm3": float(c["volume_mm3"]),
            "equivalent_diameter_mm": float(
                c["equivalent_diameter_mm"]
            ),
            "reason": "equivalent_diameter_below_3mm",
        }
        for c in rejected_components
    ]

    patch_root = (
        output_mask.parent
        / "patches"
    )

    patch_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    patch_outputs = []

    for component in components:
        nodule_id = component["nodule_id"]
        component_mask = component["mask"]

        nodule_dir = (
            patch_root
            / nodule_id
        )

        nodule_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        morphology = make_morphology_patch(
            ct_zyx,
            component_mask,
            spacing_zyx=spacing_zyx,
        )

        malignancy = make_malignancy_patch(
            ct_zyx,
            component_mask,
            spacing_zyx=spacing_zyx,
            cube_mm=50.0,
        )

        morphology_ct_path = (
            nodule_dir
            / "morphology_ct.npy"
        )

        morphology_mask_path = (
            nodule_dir
            / "morphology_mask.npy"
        )

        malignancy_ct_path = (
            nodule_dir
            / "malignancy_ct.npy"
        )

        np.save(
            morphology_ct_path,
            morphology["ct_patch"][None].astype(np.float32),
        )

        np.save(
            morphology_mask_path,
            morphology["mask_patch"][None].astype(np.float32),
        )

        np.save(
            malignancy_ct_path,
            malignancy["ct_patch"][None].astype(np.float32),
        )

        patch_outputs.append({
            "nodule_id": nodule_id,
            "voxel_count": int(component["voxel_count"]),
            "volume_mm3": float(component["volume_mm3"]),
            "equivalent_diameter_mm": float(
                component["equivalent_diameter_mm"]
            ),
            "center_zyx": [
                float(x)
                for x in component["center_zyx"]
            ],
            "morphology_ct": str(morphology_ct_path),
            "morphology_mask": str(morphology_mask_path),
            "morphology_texture_preprocessing": {
                "isotropic_spacing_mm": float(
                    morphology["isotropic_spacing_mm"]
                ),
                "resample_zoom_zyx": [
                    float(x)
                    for x in morphology["resample_zoom_zyx"]
                ],
                "clip_percentiles": [0.1, 99.8],
                "clip_low": float(
                    morphology["clip_low"]
                ),
                "clip_high": float(
                    morphology["clip_high"]
                ),
                "normalization": "volume_zscore_after_percentile_clipping",
                "normalization_mean": float(
                    morphology["normalization_mean"]
                ),
                "normalization_std": float(
                    morphology["normalization_std"]
                ),
                "patch_shape": [1, 64, 64, 64],
            },
            "malignancy_ct": str(malignancy_ct_path),
            "malignancy_source_crop_shape": malignancy[
                "source_crop_shape"
            ],
        })

    metadata = {
        "model": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "task": "lung_nodule_segmentation",
        "input": str(image_file),
        "output_mask": str(output_mask),
        "input_shape_xyz": [
            int(x)
            for x in original["shape_xyz"]
        ],
        "input_spacing_xyz_mm": [
            float(x)
            for x in original["spacing_xyz_mm"]
        ],
        "output_labels": {
            "0": "background",
            "1": "lung_nodule",
        },
        "vista_internal_target_label": 23,
        "foreground_voxels": foreground_voxels,
        "detected_component_count": len(all_components),
        "nodule_count": len(patch_outputs),
        "nodule_patches": patch_outputs,
        "rejected_component_count": len(rejected_outputs),
        "rejected_components": rejected_outputs,
        "downstream_min_diameter_mm": 3.0,
        "qa": {
            "shape_match": bool(shape_match),
            "affine_match": bool(affine_match),
            "unique_labels": unique_labels,
        },
    }

    if output_metadata is None:
        output_metadata = (
            output_mask.parent
            / "metadata.json"
        )

    output_metadata = Path(output_metadata)
    output_metadata.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with open(
        output_metadata,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            metadata,
            f,
            indent=2,
        )

    if not shape_match:
        raise RuntimeError(
            "Output shape QA failed"
        )

    if not affine_match:
        raise RuntimeError(
            "Output affine QA failed"
        )

    if not set(
        unique_labels
    ).issubset({0, 1}):
        raise RuntimeError(
            f"Invalid output labels: {unique_labels}"
        )

    print()
    print("=" * 68)
    print("[PASS] VISTA3D serving inference complete")
    print("=" * 68)
    print("mask        :", output_mask)
    print("metadata    :", output_metadata)
    print("shape match :", shape_match)
    print("affine match:", affine_match)
    print("labels      :", unique_labels)
    print("foreground  :", foreground_voxels)

    return metadata


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--input",
        required=True,
    )

    parser.add_argument(
        "--output",
        required=True,
    )

    parser.add_argument(
        "--metadata",
        default=None,
    )

    args = parser.parse_args()

    run_inference(
        image_file=args.input,
        output_mask=args.output,
        output_metadata=args.metadata,
    )


if __name__ == "__main__":
    main()

