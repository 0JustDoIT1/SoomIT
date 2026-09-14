import argparse
import json
import subprocess
import sys
from pathlib import Path

import nibabel as nib
import numpy as np


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


def run_command(cmd):
    print("RUN:")
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)


def validate_geometry(ct_path, mask_paths):
    ct = nib.load(ct_path)

    results = {}
    failed = []

    for path in mask_paths:
        img = nib.load(path)
        data = np.asarray(img.dataobj)

        shape_match = img.shape == ct.shape
        affine_match = np.allclose(
            img.affine,
            ct.affine,
            atol=1e-5,
        )

        voxels = int(
            (data > 0).sum()
        )

        results[path.name] = {
            "shape_match": bool(shape_match),
            "affine_match": bool(affine_match),
            "foreground_voxels": voxels,
        }

        if not shape_match or not affine_match:
            failed.append(path.name)

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

    total_dir = output_root / "thoracic_total"
    vessel_dir = output_root / "lung_vessels"

    total_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    vessel_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    totalsegmentator = str(Path(sys.executable).with_name("TotalSegmentator"))

    total_cmd = [
        totalsegmentator,
        "-i", str(ct_path),
        "-o", str(total_dir),
        "-ta", "total",
        "-rs",
        *TOTAL_ROIS,
        "-d", args.device,
    ]

    run_command(total_cmd)

    vessel_cmd = [
        totalsegmentator,
        "-i", str(ct_path),
        "-o", str(vessel_dir),
        "-ta", "lung_vessels",
        "-d", args.device,
    ]

    run_command(vessel_cmd)

    expected_total = [
        total_dir / f"{name}.nii.gz"
        for name in TOTAL_ROIS
    ]

    expected_vessel = [
        vessel_dir / "lung_airways.nii.gz",
        vessel_dir / "lung_airways_wall.nii.gz",
        vessel_dir / "lung_arteries.nii.gz",
        vessel_dir / "lung_veins.nii.gz",
    ]

    expected = (
        expected_total
        + expected_vessel
    )

    missing = [
        str(path)
        for path in expected
        if not path.exists()
    ]

    if missing:
        raise RuntimeError(
            "Missing anatomy masks:\n"
            + "\n".join(missing)
        )

    qa, failed = validate_geometry(
        ct_path,
        expected,
    )

    metadata = {
        "case_id": args.case_id,
        "source_ct": str(ct_path),
        "anatomy_model": "TotalSegmentator",
        "task_total": "total",
        "task_lung_vessels": "lung_vessels",
        "geometry_qa_pass": len(failed) == 0,
        "geometry_failed_masks": failed,
        "masks": qa,
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
