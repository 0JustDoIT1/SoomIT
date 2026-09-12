#!/usr/bin/env python3

"""
inference.py

CPMNetv2 HN25 deployment inference core.

Pipeline
--------
CT

-> preprocessing.py
   - load CT
   - 1 mm isotropic
   - HU [-1200, 600]
   - normalize [-1, 1]

-> SplitComb
   crop = [64, 128, 128]
   overlap = [16, 32, 32]

-> CPMNetv2

-> Detection_Postprocess
   threshold = 0.01
   crop top-k = 120
   crop num-top-k = 60
   crop NMS = 0.05

-> SplitComb.combine

-> raw full-volume candidates

IMPORTANT
---------
Final full-volume NMS is NOT executed here.

Step 22 will perform:
- final NMS = 0.05
- top-k = 300
- coordinate transformation
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch


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


from model import (
    DEFAULT_CHECKPOINT,
    CPMNET_ROOT,
    load_detection_model,
)

from preprocessing import (
    preprocess_ct,
    save_metadata_json,
)


# =============================================================================
# FINAL CONFIG
# =============================================================================

CROP_SIZE = [
    64,
    128,
    128,
]

OVERLAP_SIZE = [
    16,
    32,
    32,
]

PAD_VALUE = -1.0

INFERENCE_BATCH_SIZE = 4

CROP_SCORE_THRESHOLD = 0.01

CROP_POST_TOPK = 120

CROP_POST_NUM_TOPK = 60

CROP_NMS_THRESHOLD = 0.05


# =============================================================================
# CPMNet utility imports
# =============================================================================

def ensure_cpmnet_path():

    root_str = str(
        CPMNET_ROOT
    )

    if root_str not in sys.path:

        sys.path.insert(
            0,
            root_str,
        )


def import_inference_utilities():

    ensure_cpmnet_path()

    try:

        from networks.ResNet_3D_CPM import (
            Detection_Postprocess,
        )

        from dataload.split_combine import (
            SplitComb,
        )

    except Exception as exc:

        raise RuntimeError(
            "CPMNetv2 inference utility import 실패.\n"
            f"Repository: {CPMNET_ROOT}"
        ) from exc

    return (
        Detection_Postprocess,
        SplitComb,
    )


# =============================================================================
# DETECTION POSTPROCESS
# =============================================================================

def build_crop_postprocessor():

    (
        Detection_Postprocess,
        _,
    ) = import_inference_utilities()

    postprocess = (
        Detection_Postprocess(
            topk=CROP_POST_TOPK,

            threshold=(
                CROP_SCORE_THRESHOLD
            ),

            nms_threshold=(
                CROP_NMS_THRESHOLD
            ),

            num_topk=(
                CROP_POST_NUM_TOPK
            ),

            crop_size=CROP_SIZE,
        )
    )

    return postprocess


# =============================================================================
# SPLITTER
# =============================================================================

def build_split_comber():

    (
        _,
        SplitComb,
    ) = import_inference_utilities()

    return SplitComb(
        crop_size=CROP_SIZE,

        overlap=OVERLAP_SIZE,

        pad_value=PAD_VALUE,
    )


# =============================================================================
# INFERENCE
# =============================================================================

def run_crop_inference(
    model,
    device: torch.device,
    split_images: np.ndarray,
    detection_postprocess,
    batch_size: int,
) -> np.ndarray:

    tensor = torch.from_numpy(
        np.asarray(
            split_images,
            dtype=np.float32,
        )
    )

    outputs = []

    number_of_crops = int(
        tensor.shape[0]
    )

    number_of_batches = int(
        math.ceil(
            number_of_crops
            / batch_size
        )
    )

    print(
        "Split crops:",
        number_of_crops,
    )

    print(
        "Inference batch size:",
        batch_size,
    )

    print(
        "Inference batches:",
        number_of_batches,
    )

    model.eval()

    for batch_index in range(
        number_of_batches
    ):

        start = (
            batch_index
            * batch_size
        )

        end = min(
            start
            + batch_size,
            number_of_crops,
        )

        inputs = (
            tensor[
                start:end
            ]
            .to(
                device,
                non_blocking=True,
            )
        )

        with torch.inference_mode():

            model_output = model(
                inputs
            )

            decoded = (
                detection_postprocess(
                    model_output,
                    device=device,
                )
            )

        outputs.append(
            decoded
            .detach()
            .cpu()
            .numpy()
        )

        print(
            f"\rInference "
            f"{batch_index + 1}"
            f"/{number_of_batches}",
            end="",
            flush=True,
        )

    print()

    if not outputs:

        return np.empty(
            (
                0,
                CROP_POST_NUM_TOPK,
                8,
            ),
            dtype=np.float32,
        )

    return np.concatenate(
        outputs,
        axis=0,
    )


# =============================================================================
# COMBINE
# =============================================================================

def combine_crop_candidates(
    split_comber,
    crop_outputs: np.ndarray,
    nzhw,
) -> np.ndarray:

    combined = (
        split_comber.combine(
            crop_outputs,
            nzhw=nzhw,
        )
    )

    combined = np.asarray(
        combined,
        dtype=np.float32,
    )

    combined = combined.reshape(
        -1,
        8,
    )

    # CPMNetv2 format:
    #
    # [object_id, score, z, y, x, d, h, w]
    #
    # invalid rows use object_id == -1

    valid = (
        combined[
            :,
            0
        ]
        != -1.0
    )

    combined = combined[
        valid
    ]

    return combined


# =============================================================================
# JSON
# =============================================================================

def candidates_to_json(
    candidates: np.ndarray,
) -> List[
    Dict[
        str,
        Any,
    ]
]:

    results = []

    for index, row in enumerate(
        candidates
    ):

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

        results.append(
            {
                "candidate_index":
                    int(
                        index
                    ),

                "object_id":
                    object_id,

                "score":
                    score,

                "center_resampled_zyx":
                    [
                        z,
                        y,
                        x,
                    ],

                "size_resampled_dhw":
                    [
                        d,
                        h,
                        w,
                    ],
            }
        )

    return results


# =============================================================================
# COMPLETE INFERENCE
# =============================================================================

def run_detection_inference(
    input_path: Path | str,
    checkpoint_path: Path | str = DEFAULT_CHECKPOINT,
    device: Optional[str] = None,
    series_uid: Optional[str] = None,
    batch_size: int = INFERENCE_BATCH_SIZE,
    loaded_model=None,
    loaded_device: Optional[torch.device] = None,
) -> Tuple[
    np.ndarray,
    Dict[str, Any],
]:

    # -------------------------------------------------------------------------
    # 1. Preprocess
    # -------------------------------------------------------------------------

    print()

    print(
        "[1/5] Preprocessing CT"
    )

    volume, metadata = (
        preprocess_ct(
            input_path=input_path,
            series_uid=series_uid,
        )
    )

    print(
        "Preprocessed shape ZYX:",
        list(
            volume.shape
        ),
    )

    # -------------------------------------------------------------------------
    # 2. Split
    # -------------------------------------------------------------------------

    print()

    print(
        "[2/5] Split full CT"
    )

    split_comber = (
        build_split_comber()
    )

    split_images, nzhw = (
        split_comber.split(
            volume
        )
    )

    print(
        "Split tensor shape:",
        list(
            split_images.shape
        ),
    )

    print(
        "nzhw:",
        nzhw,
    )

    # -------------------------------------------------------------------------
    # 3. Model
    # -------------------------------------------------------------------------

    print()

    print(
        "[3/5] Load CPMNetv2 HN25"
    )

    if loaded_model is None:
        model, torch_device = (
            load_detection_model(
                checkpoint_path=checkpoint_path,
                device=device,
            )
        )
    else:
        if loaded_device is None:
            raise ValueError(
                "loaded_device is required when loaded_model is provided"
            )
        model = loaded_model
        torch_device = loaded_device

    print(
        "Device:",
        torch_device,
    )

    print(
        "Checkpoint:",
        checkpoint_path,
    )

    # -------------------------------------------------------------------------
    # 4. Crop inference
    # -------------------------------------------------------------------------

    print()

    print(
        "[4/5] Crop inference"
    )

    detection_postprocess = (
        build_crop_postprocessor()
    )

    crop_outputs = (
        run_crop_inference(
            model=model,
            device=torch_device,
            split_images=split_images,
            detection_postprocess=(
                detection_postprocess
            ),
            batch_size=batch_size,
        )
    )

    # -------------------------------------------------------------------------
    # 5. Combine
    # -------------------------------------------------------------------------

    print()

    print(
        "[5/5] Combine crop candidates"
    )

    combined_candidates = (
        combine_crop_candidates(
            split_comber=split_comber,
            crop_outputs=crop_outputs,
            nzhw=nzhw,
        )
    )

    print(
        "Raw full-volume candidates:",
        len(
            combined_candidates
        ),
    )

    metadata[
        "inference"
    ] = {
        "model":
            "CPMNetv2_HN25",

        "checkpoint":
            str(
                checkpoint_path
            ),

        "device":
            str(
                torch_device
            ),

        "crop_size_zyx":
            CROP_SIZE,

        "overlap_size_zyx":
            OVERLAP_SIZE,

        "pad_value":
            PAD_VALUE,

        "batch_size":
            int(
                batch_size
            ),

        "crop_score_threshold":
            CROP_SCORE_THRESHOLD,

        "crop_post_topk":
            CROP_POST_TOPK,

        "crop_post_num_topk":
            CROP_POST_NUM_TOPK,

        "crop_nms_threshold":
            CROP_NMS_THRESHOLD,

        "final_nms_applied":
            False,

        "coordinate_system":
            "resampled_voxel_ZYX_DHW",

        "raw_candidate_count":
            int(
                len(
                    combined_candidates
                )
            ),
    }

    return (
        combined_candidates,
        metadata,
    )


# =============================================================================
# SAVE
# =============================================================================

def save_inference_outputs(
    output_dir: Path | str,
    candidates: np.ndarray,
    metadata: Dict[str, Any],
):

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
        / "raw_candidates.npz"
    )

    np.savez_compressed(
        npz_path,

        candidates=np.asarray(
            candidates,
            dtype=np.float32,
        ),
    )

    # -------------------------------------------------------------------------
    # JSON candidates
    # -------------------------------------------------------------------------

    json_path = (
        output_dir
        / "raw_candidates.json"
    )

    payload = {
        "case_id":
            metadata.get(
                "case_id"
            ),

        "status":
            "SUCCESS",

        "final_nms_applied":
            False,

        "coordinate_system":
            (
                "resampled CT voxel coordinates "
                "[Z,Y,X,D,H,W]"
            ),

        "candidate_count":
            int(
                len(
                    candidates
                )
            ),

        "candidates":
            candidates_to_json(
                candidates
            ),
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

    # -------------------------------------------------------------------------
    # Metadata
    # -------------------------------------------------------------------------

    metadata_path = (
        output_dir
        / "preprocessing_metadata.json"
    )

    save_metadata_json(
        metadata=metadata,
        output_path=metadata_path,
    )

    return {
        "raw_candidates_npz":
            npz_path,

        "raw_candidates_json":
            json_path,

        "metadata_json":
            metadata_path,
    }


# =============================================================================
# CLI
# =============================================================================

def main():

    parser = argparse.ArgumentParser(
        description=(
            "CPMNetv2 HN25 deployment inference core"
        )
    )

    parser.add_argument(
        "--input",
        required=True,
        type=str,
        help=(
            "NIfTI file or DICOM series directory"
        ),
    )

    parser.add_argument(
        "--output-dir",
        required=True,
        type=str,
    )

    parser.add_argument(
        "--checkpoint",
        default=str(
            DEFAULT_CHECKPOINT
        ),
        type=str,
    )

    parser.add_argument(
        "--device",
        default=None,
        type=str,
        help=(
            "cuda, cuda:0, cpu. "
            "Default: CUDA if available."
        ),
    )

    parser.add_argument(
        "--series-uid",
        default=None,
        type=str,
    )

    parser.add_argument(
        "--batch-size",
        default=INFERENCE_BATCH_SIZE,
        type=int,
    )

    args = parser.parse_args()

    if args.batch_size <= 0:

        raise ValueError(
            "--batch-size는 1 이상이어야 합니다."
        )

    print(
        "=" * 100
    )

    print(
        "CPMNetv2 HN25 Deployment Inference"
    )

    print(
        "=" * 100
    )

    print(
        "Input:",
        args.input,
    )

    print(
        "Checkpoint:",
        args.checkpoint,
    )

    print(
        "Output:",
        args.output_dir,
    )

    print()

    candidates, metadata = (
        run_detection_inference(
            input_path=args.input,
            checkpoint_path=args.checkpoint,
            device=args.device,
            series_uid=args.series_uid,
            batch_size=args.batch_size,
        )
    )

    paths = (
        save_inference_outputs(
            output_dir=args.output_dir,
            candidates=candidates,
            metadata=metadata,
        )
    )

    print()

    print(
        "=" * 100
    )

    print(
        "Inference Core Finished"
    )

    print(
        "=" * 100
    )

    print(
        "Raw candidate count:",
        len(
            candidates
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
        "[PASS] Step 21 inference core completed"
    )

    print()

    print(
        "IMPORTANT:"
    )

    print(
        "Final NMS / coordinate conversion은 "
        "아직 적용되지 않았습니다."
    )

    print(
        "Next: Step 22 "
        "postprocessing + coordinate_transform"
    )


if __name__ == "__main__":

    main()
