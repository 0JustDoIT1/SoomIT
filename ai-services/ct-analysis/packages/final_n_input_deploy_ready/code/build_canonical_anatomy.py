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

TOTAL_MULTILABEL_NAME = "thoracic_total_multilabel.nii.gz"
VESSEL_MULTILABEL_NAME = "lung_vessels_multilabel.nii.gz"


def load_label_map(path):
    """Reads a --ml TotalSegmentator output with plain nibabel - this script runs
    in the main conda env, which does not have the totalsegmentator package
    (kept isolated in the totalseg env with TotalSegmentator itself). The
    name->label-id mapping comes from the JSON sidecar run_anatomy_segmentation.py
    writes alongside the multi-label NIfTI.
    """
    image = nib.load(str(path))
    labelmap_path = path.with_suffix("").with_suffix(".labelmap.json")
    with open(labelmap_path, encoding="utf-8") as f:
        name_to_id = json.load(f)
    return image, {name: int(label_id) for name, label_id in name_to_id.items()}


def mask_for(data, name_to_id, name):
    if name not in name_to_id:
        raise KeyError(f"'{name}' not present in multi-label header")
    return data == name_to_id[name]


def union(masks):
    result = None
    for mask in masks:
        result = mask if result is None else (result | mask)
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

    output_path.parent.mkdir(parents=True, exist_ok=True)

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

    output_dir = Path(
        args.output_dir
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    total_image, total_name_to_id = load_label_map(
        anatomy_dir / TOTAL_MULTILABEL_NAME
    )
    vessel_image, vessel_name_to_id = load_label_map(
        anatomy_dir / VESSEL_MULTILABEL_NAME
    )

    reference_img = total_image
    shape = reference_img.shape
    affine = reference_img.affine

    if vessel_image.shape != shape or not np.allclose(vessel_image.affine, affine, atol=1e-5):
        raise ValueError(
            "lung_vessels_multilabel.nii.gz geometry does not match "
            "thoracic_total_multilabel.nii.gz"
        )

    total_data = np.asarray(total_image.dataobj)
    vessel_data = np.asarray(vessel_image.dataobj)

    def total_mask(name):
        return mask_for(total_data, total_name_to_id, name)

    def vessel_mask(name):
        return mask_for(vessel_data, vessel_name_to_id, name)

    # --- Final per-lobe masks (thoracic_total/) ---
    # build_t_input.py and Phase 2's extract_anatomy_features.py still read
    # these exact file paths directly, so the old directory/file contract is
    # preserved even though the source is now a multi-label volume.
    lobe_dir = anatomy_dir / "thoracic_total"
    lobe_masks = {name: total_mask(name) for name in LOBE_NAMES}
    for name, mask in lobe_masks.items():
        save_mask(mask, lobe_dir / f"{name}.nii.gz", reference_img)

    # --- Canonical anatomy (7 masks) ---
    outputs = {}

    outputs["lung_union"] = union(lobe_masks.values())

    outputs["airway"] = vessel_mask("lung_airways")

    outputs["heart"] = total_mask("heart")

    outputs["great_vessels"] = union([
        total_mask("aorta"),
        total_mask("pulmonary_vein"),
        vessel_mask("lung_arteries"),
        vessel_mask("lung_veins"),
    ])

    outputs["esophagus"] = total_mask("esophagus")

    outputs["vertebral_body_proxy"] = union([
        total_mask(f"vertebrae_T{i}")
        for i in range(1, 13)
    ])

    outputs["chest_wall_proxy"] = union(
        [total_mask(f"rib_left_{i}") for i in range(1, 13)]
        + [total_mask(f"rib_right_{i}") for i in range(1, 13)]
        + [total_mask("sternum")]
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
