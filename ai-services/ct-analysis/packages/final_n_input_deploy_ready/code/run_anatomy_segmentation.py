import argparse
import json
import subprocess
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from totalsegmentator.nifti_ext_header import load_multilabel_nifti


TOTAL_ROIS = [
    "lung_upper_lobe_left",
    "lung_lower_lobe_left",
    "lung_upper_lobe_right",
    "lung_middle_lobe_right",
    "lung_lower_lobe_right",
    "esophagus",
    "heart",
    "aorta",
    "pulmonary_vein",

    "vertebrae_T1",
    "vertebrae_T2",
    "vertebrae_T3",
    "vertebrae_T4",
    "vertebrae_T5",
    "vertebrae_T6",
    "vertebrae_T7",
    "vertebrae_T8",
    "vertebrae_T9",
    "vertebrae_T10",
    "vertebrae_T11",
    "vertebrae_T12",

    "sternum",

    *[f"rib_left_{i}" for i in range(1, 13)],
    *[f"rib_right_{i}" for i in range(1, 13)],
]

VESSEL_ROIS = [
    "lung_airways",
    "lung_airways_wall",
    "lung_arteries",
    "lung_veins",
]

# Multi-label output file names, written directly under the anatomy output dir.
# These are pure intermediates: build_canonical_anatomy.py reads them once to
# produce the final per-structure files downstream code actually consumes, and
# orchestrator.py deletes them before the work tree is uploaded to GCS.
TOTAL_MULTILABEL_NAME = "thoracic_total_multilabel.nii.gz"
VESSEL_MULTILABEL_NAME = "lung_vessels_multilabel.nii.gz"


def run_command(cmd):
    print("RUN:")
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)


def load_label_map(path):
    """Returns (nibabel image, {class_name: label_id}) for a --ml TotalSegmentator
    output. Names are read from the NIfTI extended header rather than assuming a
    fixed label-ID scheme, since TotalSegmentator's label ordering has changed
    across major versions.
    """
    image, label_map = load_multilabel_nifti(str(path))
    return image, {name: int(label_id) for label_id, name in label_map.items()}


def validate_labels_present(name_to_id, required_names, source_name):
    missing = [name for name in required_names if name not in name_to_id]
    if missing:
        raise RuntimeError(
            f"{source_name} multi-label output is missing expected classes: {missing}"
        )


def labelmap_sidecar_path(multilabel_path):
    return multilabel_path.with_suffix("").with_suffix(".labelmap.json")


def write_label_map(name_to_id, multilabel_path):
    """build_canonical_anatomy.py runs in the main conda env, which does not have
    the totalsegmentator package installed (it stays isolated in the totalseg
    env alongside TotalSegmentator itself). Persist the name->label-id mapping
    as a plain JSON sidecar so that script can read it with nibabel alone.
    """
    with open(labelmap_sidecar_path(multilabel_path), "w", encoding="utf-8") as f:
        json.dump(name_to_id, f, indent=2, ensure_ascii=False)


def validate_geometry(ct, labeled_images):
    results = {}
    failed = []

    for name, img in labeled_images.items():
        shape_match = img.shape == ct.shape
        affine_match = np.allclose(img.affine, ct.affine, atol=1e-5)

        results[name] = {
            "shape_match": bool(shape_match),
            "affine_match": bool(affine_match),
        }

        if not shape_match or not affine_match:
            failed.append(name)

    return results, failed


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--ct",
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
        "--device",
        default="gpu",
    )

    args = parser.parse_args()

    ct_path = Path(args.ct).resolve()
    output_root = Path(args.output_dir).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    total_ml_path = output_root / TOTAL_MULTILABEL_NAME
    vessel_ml_path = output_root / VESSEL_MULTILABEL_NAME

    totalsegmentator = str(Path(sys.executable).with_name("TotalSegmentator"))

    total_cmd = [
        totalsegmentator,
        "-i", str(ct_path),
        "-o", str(total_ml_path),
        "-ta", "total",
        "-rs",
        *TOTAL_ROIS,
        "--ml",
        "-d", args.device,
    ]

    run_command(total_cmd)

    vessel_cmd = [
        totalsegmentator,
        "-i", str(ct_path),
        "-o", str(vessel_ml_path),
        "-ta", "lung_vessels",
        "--ml",
        "-d", args.device,
    ]

    run_command(vessel_cmd)

    if not total_ml_path.exists():
        raise RuntimeError(f"Missing multi-label output: {total_ml_path}")
    if not vessel_ml_path.exists():
        raise RuntimeError(f"Missing multi-label output: {vessel_ml_path}")

    total_image, total_name_to_id = load_label_map(total_ml_path)
    vessel_image, vessel_name_to_id = load_label_map(vessel_ml_path)

    validate_labels_present(total_name_to_id, TOTAL_ROIS, "total")
    validate_labels_present(vessel_name_to_id, VESSEL_ROIS, "lung_vessels")

    write_label_map(total_name_to_id, total_ml_path)
    write_label_map(vessel_name_to_id, vessel_ml_path)

    ct = nib.load(ct_path)
    qa, failed = validate_geometry(
        ct,
        {
            TOTAL_MULTILABEL_NAME: total_image,
            VESSEL_MULTILABEL_NAME: vessel_image,
        },
    )

    metadata = {
        "case_id": args.case_id,
        "source_ct": str(ct_path),
        "anatomy_model": "TotalSegmentator",
        "output_mode": "multilabel",
        "task_total": "total",
        "task_lung_vessels": "lung_vessels",
        "geometry_qa_pass": len(failed) == 0,
        "geometry_failed_masks": failed,
        "masks": qa,
        "total_label_map": total_name_to_id,
        "vessel_label_map": vessel_name_to_id,
    }

    metadata_path = (
        output_root
        / "anatomy_metadata.json"
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

    if failed:
        raise RuntimeError(
            f"Geometry mismatch: {failed}"
        )

    print()
    print("ANATOMY SEGMENTATION SUCCESS")
    print("Case:", args.case_id)
    print("Output:", output_root)
    print("Geometry QA: PASS")
    print("Metadata:", metadata_path)


if __name__ == "__main__":
    main()
