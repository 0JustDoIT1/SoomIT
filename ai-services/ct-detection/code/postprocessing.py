#!/usr/bin/env python3

"""
postprocessing.py

CPMNetv2 HN25 final deployment postprocessing.

Input
-----
Step 21 raw candidates:

    [object_id, score, z, y, x, d, h, w]

Output
------
Final nodules after:

    score > 0
    ↓
    final 3D NMS = 0.05
    ↓
    top-k = 300
    ↓
    coordinate transform
    ↓
    final_detections.json

Final fixed settings
--------------------
FINAL_NMS_THRESHOLD = 0.05
FINAL_TOPK_PER_SCAN = 300

IMPORTANT
---------
This is NOT a Best-F1 threshold filter.

The final candidate pool is retained for downstream
clinical visualization / operating-threshold decisions.

Best-F1 threshold from validation:
    0.9612025618553162

is saved as metadata only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


# =============================================================================
# LOCAL IMPORT
# =============================================================================

THIS_DIR = Path(
    __file__
).resolve().parent

if str(
    THIS_DIR
) not in sys.path:

    sys.path.insert(
        0,
        str(
            THIS_DIR
        ),
    )


from coordinate_transform import (
    transform_detection_coordinates,
)


# =============================================================================
# FINAL SETTINGS
# =============================================================================

FINAL_NMS_THRESHOLD = 0.05

FINAL_TOPK_PER_SCAN = 300

BEST_F1_THRESHOLD_VALIDATION = (
    0.9612025618553162
)

FIXED_THRESHOLD_REFERENCE = 0.5


# =============================================================================
# IO
# =============================================================================

def load_raw_candidates_npz(
    path: Path | str,
) -> np.ndarray:

    path = Path(
        path
    )

    if not path.exists():

        raise FileNotFoundError(
            f"raw_candidates.npz 없음:\n"
            f"{path}"
        )

    data = np.load(
        path
    )

    if "candidates" not in data:

        raise RuntimeError(
            "NPZ에 candidates key가 없습니다."
        )

    candidates = np.asarray(
        data[
            "candidates"
        ],
        dtype=np.float32,
    )

    if candidates.ndim != 2:

        raise RuntimeError(
            "candidates shape 오류:\n"
            f"{candidates.shape}"
        )

    if candidates.shape[1] != 8:

        raise RuntimeError(
            "candidates는 8 columns 이어야 합니다:\n"
            "[object_id, score, z, y, x, d, h, w]\n"
            f"Current shape: {candidates.shape}"
        )

    return candidates


def load_metadata(
    path: Path | str,
) -> Dict[str, Any]:

    path = Path(
        path
    )

    if not path.exists():

        raise FileNotFoundError(
            f"metadata JSON 없음:\n"
            f"{path}"
        )

    with open(
        path,
        "r",
        encoding="utf-8",
    ) as file:

        return json.load(
            file
        )


# =============================================================================
# BBOX IOU
# =============================================================================

def bbox_bounds_zyx(
    row: np.ndarray,
) -> Tuple[
    np.ndarray,
    np.ndarray,
]:

    center = np.asarray(
        row[
            2:5
        ],
        dtype=np.float64,
    )

    size = np.asarray(
        row[
            5:8
        ],
        dtype=np.float64,
    )

    minimum = (
        center
        - size
        / 2.0
    )

    maximum = (
        center
        + size
        / 2.0
    )

    return (
        minimum,
        maximum,
    )


def iou_3d(
    row_a: np.ndarray,
    row_b: np.ndarray,
) -> float:

    min_a, max_a = (
        bbox_bounds_zyx(
            row_a
        )
    )

    min_b, max_b = (
        bbox_bounds_zyx(
            row_b
        )
    )

    intersection_min = (
        np.maximum(
            min_a,
            min_b,
        )
    )

    intersection_max = (
        np.minimum(
            max_a,
            max_b,
        )
    )

    intersection_size = np.maximum(
        intersection_max
        - intersection_min,
        0.0,
    )

    intersection_volume = float(
        np.prod(
            intersection_size
        )
    )

    size_a = np.maximum(
        max_a
        - min_a,
        0.0,
    )

    size_b = np.maximum(
        max_b
        - min_b,
        0.0,
    )

    volume_a = float(
        np.prod(
            size_a
        )
    )

    volume_b = float(
        np.prod(
            size_b
        )
    )

    union = (
        volume_a
        + volume_b
        - intersection_volume
    )

    if union <= 0:

        return 0.0

    return (
        intersection_volume
        / union
    )


# =============================================================================
# NMS
# =============================================================================

def nms_3d(
    candidates: np.ndarray,
    threshold: float = FINAL_NMS_THRESHOLD,
    top_k: int = FINAL_TOPK_PER_SCAN,
) -> np.ndarray:

    if len(
        candidates
    ) == 0:

        return np.empty(
            (
                0,
                8,
            ),
            dtype=np.float32,
        )

    # invalid score 제거
    valid = np.isfinite(
        candidates
    ).all(
        axis=1
    )

    candidates = candidates[
        valid
    ]

    if len(
        candidates
    ) == 0:

        return np.empty(
            (
                0,
                8,
            ),
            dtype=np.float32,
        )

    # positive score만
    candidates = candidates[
        candidates[
            :,
            1
        ]
        > 0.0
    ]

    if len(
        candidates
    ) == 0:

        return np.empty(
            (
                0,
                8,
            ),
            dtype=np.float32,
        )

    # score descending
    order = np.argsort(
        candidates[
            :,
            1
        ]
    )[
        ::-1
    ]

    keep = []

    while (
        len(
            order
        )
        > 0
    ):

        current_index = int(
            order[0]
        )

        keep.append(
            current_index
        )

        if (
            len(
                keep
            )
            >= top_k
        ):

            break

        if len(
            order
        ) == 1:

            break

        remaining = (
            order[
                1:
            ]
        )

        suppress_mask = np.zeros(
            len(
                remaining
            ),
            dtype=bool,
        )

        current = candidates[
            current_index
        ]

        for idx, candidate_index in enumerate(
            remaining
        ):

            overlap = iou_3d(
                current,
                candidates[
                    int(
                        candidate_index
                    )
                ],
            )

            if overlap > threshold:

                suppress_mask[
                    idx
                ] = True

        order = (
            remaining[
                ~suppress_mask
            ]
        )

    output = candidates[
        keep
    ]

    # 안전하게 다시 score 정렬
    output = output[
        np.argsort(
            output[
                :,
                1
            ]
        )[
            ::-1
        ]
    ]

    output = output[
        :
        top_k
    ]

    return output.astype(
        np.float32,
        copy=False,
    )


# =============================================================================
# DETECTION OBJECT
# =============================================================================

def detection_row_to_dict(
    row: np.ndarray,
    index: int,
    metadata: Dict[str, Any],
) -> Dict[str, Any]:

    (
        object_id,
        score,
        z,
        y,
        x,
        d,
        h,
        w,
    ) = [
        float(
            value
        )
        for value
        in row
    ]

    transformed = (
        transform_detection_coordinates(
            center_resampled_zyx=[
                z,
                y,
                x,
            ],

            size_resampled_dhw=[
                d,
                h,
                w,
            ],

            original_geometry=metadata[
                "original"
            ],

            resampled_geometry=metadata[
                "resampled"
            ],
        )
    )

    nodule_id = (
        f"NODULE_{index + 1:03d}"
    )

    result = {
        "nodule_id":
            nodule_id,

        "rank":
            int(
                index + 1
            ),

        "score":
            score,

        "source_object_id":
            object_id,

        "classification": {
            "best_f1_operating_point":
                bool(
                    score
                    >= BEST_F1_THRESHOLD_VALIDATION
                ),

            "fixed_0_5_operating_point":
                bool(
                    score
                    >= FIXED_THRESHOLD_REFERENCE
                ),
        },

        **transformed,
    }

    # convenience
    original_bbox = (
        transformed[
            "original_voxel"
        ]
    )

    z_min = float(
        original_bbox[
            "bbox_min_zyx"
        ][0]
    )

    y_min = float(
        original_bbox[
            "bbox_min_zyx"
        ][1]
    )

    x_min = float(
        original_bbox[
            "bbox_min_zyx"
        ][2]
    )

    z_max = float(
        original_bbox[
            "bbox_max_zyx"
        ][0]
    )

    y_max = float(
        original_bbox[
            "bbox_max_zyx"
        ][1]
    )

    x_max = float(
        original_bbox[
            "bbox_max_zyx"
        ][2]
    )

    result[
        "viewer_helper"
    ] = {
        "original_slice_range_z":
            [
                int(
                    np.floor(
                        z_min
                    )
                ),

                int(
                    np.ceil(
                        z_max
                    )
                ),
            ],

        "original_bbox_xy":
            {
                "x_min":
                    x_min,

                "y_min":
                    y_min,

                "x_max":
                    x_max,

                "y_max":
                    y_max,
            },
    }

    return result


# =============================================================================
# FINAL POSTPROCESS
# =============================================================================

def postprocess_candidates(
    raw_candidates: np.ndarray,
    metadata: Dict[str, Any],
    score_threshold: Optional[float] = None,
) -> Tuple[
    np.ndarray,
    List[
        Dict[
            str,
            Any,
        ]
    ],
]:

    before_count = int(
        len(
            raw_candidates
        )
    )

    final_candidates = (
        nms_3d(
            candidates=raw_candidates,
            threshold=FINAL_NMS_THRESHOLD,
            top_k=FINAL_TOPK_PER_SCAN,
        )
    )

    if score_threshold is not None:
        if not 0.0 <= score_threshold <= 1.0:
            raise ValueError("score_threshold must be between 0 and 1")
        final_candidates = final_candidates[
            final_candidates[:, 1] >= score_threshold
        ]

    detections = [
        detection_row_to_dict(
            row=row,
            index=index,
            metadata=metadata,
        )

        for index, row in enumerate(
            final_candidates
        )
    ]

    print(
        "Raw candidates:",
        before_count,
    )

    print(
        "Returned after final NMS / top-k / score threshold:",
        len(
            final_candidates
        ),
    )

    print(
        "Best-F1 positive count:",
        sum(
            detection[
                "classification"
            ][
                "best_f1_operating_point"
            ]

            for detection in detections
        ),
    )

    print(
        "Score >= 0.5 count:",
        sum(
            detection[
                "classification"
            ][
                "fixed_0_5_operating_point"
            ]

            for detection in detections
        ),
    )

    return (
        final_candidates,
        detections,
    )


# =============================================================================
# SAVE
# =============================================================================

def save_outputs(
    output_dir: Path | str,
    final_candidates: np.ndarray,
    detections: List[
        Dict[
            str,
            Any,
        ]
    ],
    metadata: Dict[str, Any],
) -> Dict[str, Path]:

    output_dir = Path(
        output_dir
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # -------------------------------------------------------------------------
    # NPZ
    # -------------------------------------------------------------------------

    npz_path = (
        output_dir
        / "final_candidates.npz"
    )

    np.savez_compressed(
        npz_path,
        candidates=np.asarray(
            final_candidates,
            dtype=np.float32,
        ),
    )

    # -------------------------------------------------------------------------
    # JSON
    # -------------------------------------------------------------------------

    json_path = (
        output_dir
        / "final_detections.json"
    )

    payload = {
        "status":
            "SUCCESS",

        "case_id":
            metadata.get(
                "case_id"
            ),

        "series_uid":
            metadata.get(
                "series_uid"
            ),

        "model":
            "CPMNetv2_HN25",

        "postprocessing": {
            "final_nms_threshold":
                FINAL_NMS_THRESHOLD,

            "final_topk_per_scan":
                FINAL_TOPK_PER_SCAN,

            "validation_best_f1_threshold":
                BEST_F1_THRESHOLD_VALIDATION,

            "reference_fixed_threshold":
                FIXED_THRESHOLD_REFERENCE,
        },

        "coordinate_convention": {
            "internal_detection":
                "ZYX / DHW",

            "world":
                "XYZ millimeters",

            "original_voxel":
                "XYZ and ZYX both provided",
        },

        "nodule_count":
            int(
                len(
                    detections
                )
            ),

        "nodules":
            detections,
    }

    with open(
        json_path,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            payload,
            file,
            indent=2,
            ensure_ascii=False,
        )

    return {
        "final_candidates_npz":
            npz_path,

        "final_detections_json":
            json_path,
    }


# =============================================================================
# CLI
# =============================================================================

def main():

    parser = argparse.ArgumentParser(
        description=(
            "CPMNetv2 HN25 deployment final postprocessing"
        )
    )

    parser.add_argument(
        "--raw-candidates",
        required=True,
        type=str,
    )

    parser.add_argument(
        "--metadata",
        required=True,
        type=str,
    )

    parser.add_argument(
        "--output-dir",
        required=True,
        type=str,
    )

    args = parser.parse_args()

    print(
        "=" * 100
    )

    print(
        "CPMNetv2 HN25 Final Postprocessing"
    )

    print(
        "=" * 100
    )

    print(
        "Final NMS:",
        FINAL_NMS_THRESHOLD,
    )

    print(
        "Final Top-K:",
        FINAL_TOPK_PER_SCAN,
    )

    print()

    raw_candidates = (
        load_raw_candidates_npz(
            args.raw_candidates
        )
    )

    metadata = (
        load_metadata(
            args.metadata
        )
    )

    final_candidates, detections = (
        postprocess_candidates(
            raw_candidates=raw_candidates,
            metadata=metadata,
        )
    )

    paths = (
        save_outputs(
            output_dir=args.output_dir,
            final_candidates=final_candidates,
            detections=detections,
            metadata=metadata,
        )
    )

    print()

    print(
        "=" * 100
    )

    print(
        "Final Postprocessing Finished"
    )

    print(
        "=" * 100
    )

    print(
        "Final nodule candidates:",
        len(
            detections
        ),
    )

    print()

    for name, path in (
        paths.items()
    ):

        print(
            f"{name}:"
        )

        print(
            path
        )

    print()

    print(
        "[PASS] Step 22 postprocessing completed"
    )


if __name__ == "__main__":

    main()
