#!/usr/bin/env python3

"""
model.py

CPMNetv2 HN25 deployment model loader.

Responsibilities
----------------
1. CPMNetv2 repository import
2. Final network architecture construction
3. Final checkpoint loading
4. Device placement
5. eval() mode

This file does NOT:
- preprocess CT
- run SplitComb
- perform NMS
- convert coordinates
"""

from __future__ import annotations

import sys
import os
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Tuple

import torch
from torch import nn


# =============================================================================
# PATH
# =============================================================================

SERVICE_ROOT = Path(__file__).resolve().parent.parent

PROJECT_ROOT = Path(
    os.environ.get("CT_DETECTION_ROOT", SERVICE_ROOT)
).expanduser().resolve()

CPMNET_ROOT = (
    Path(
        os.environ.get(
            "CPMNET_ROOT",
            PROJECT_ROOT / "external" / "CPMNetv2",
        )
    )
    .expanduser()
    .resolve()
)

DEFAULT_CHECKPOINT = (
    Path(
        os.environ.get(
            "MODEL_PATH",
            PROJECT_ROOT / "models" / "best_val_loss.pt",
        )
    )
    .expanduser()
    .resolve()
)


# =============================================================================
# MODEL CONFIG
# =============================================================================

MODEL_CONFIG = {
    "n_channels": 1,

    "n_blocks": [
        2,
        3,
        3,
        3,
    ],

    "n_filters": [
        64,
        96,
        128,
        160,
    ],

    "stem_filters": 32,

    "norm_type": "batchnorm",

    "head_norm": "batchnorm",

    "act_type": "ReLU",

    "se": False,

    "first_stride": (
        1,
        2,
        2,
    ),
}


# =============================================================================
# CPMNet import
# =============================================================================

def ensure_cpmnet_import_path() -> None:

    if not CPMNET_ROOT.exists():

        raise FileNotFoundError(
            "CPMNetv2 repository가 없습니다:\n"
            f"{CPMNET_ROOT}"
        )

    cpmnet_str = str(
        CPMNET_ROOT
    )

    if cpmnet_str not in sys.path:

        sys.path.insert(
            0,
            cpmnet_str,
        )


def import_resnet18():

    ensure_cpmnet_import_path()

    try:

        from networks.ResNet_3D_CPM import resnet18

    except Exception as exc:

        raise RuntimeError(
            "CPMNetv2 resnet18 import 실패.\n"
            f"Repository: {CPMNET_ROOT}"
        ) from exc

    return resnet18


# =============================================================================
# DEVICE
# =============================================================================

def resolve_device(
    device: Optional[str] = None,
) -> torch.device:

    if device is None:

        return torch.device(
            "cuda"
            if torch.cuda.is_available()
            else "cpu"
        )

    requested = str(
        device
    ).strip().lower()

    if requested.startswith(
        "cuda"
    ):

        if not torch.cuda.is_available():

            raise RuntimeError(
                "CUDA device를 요청했지만 "
                "torch.cuda.is_available() == False 입니다."
            )

    return torch.device(
        requested
    )


# =============================================================================
# MODEL
# =============================================================================

def build_model() -> nn.Module:

    resnet18 = import_resnet18()

    model = resnet18(
        n_channels=MODEL_CONFIG[
            "n_channels"
        ],

        n_blocks=MODEL_CONFIG[
            "n_blocks"
        ],

        n_filters=MODEL_CONFIG[
            "n_filters"
        ],

        stem_filters=MODEL_CONFIG[
            "stem_filters"
        ],

        norm_type=MODEL_CONFIG[
            "norm_type"
        ],

        head_norm=MODEL_CONFIG[
            "head_norm"
        ],

        act_type=MODEL_CONFIG[
            "act_type"
        ],

        se=MODEL_CONFIG[
            "se"
        ],

        first_stride=MODEL_CONFIG[
            "first_stride"
        ],
    )

    return model


# =============================================================================
# CHECKPOINT
# =============================================================================

def _looks_like_state_dict(
    obj: Any,
) -> bool:

    if not isinstance(
        obj,
        Mapping,
    ):

        return False

    if len(
        obj
    ) == 0:

        return False

    tensor_values = 0

    for value in obj.values():

        if torch.is_tensor(
            value
        ):

            tensor_values += 1

    return (
        tensor_values
        > 0
    )


def extract_state_dict(
    checkpoint: Any,
) -> Mapping[str, torch.Tensor]:

    if _looks_like_state_dict(
        checkpoint
    ):

        return checkpoint

    if not isinstance(
        checkpoint,
        Mapping,
    ):

        raise RuntimeError(
            "지원하지 않는 checkpoint 형식입니다."
        )

    common_keys = [
        "model_state_dict",
        "state_dict",
        "model",
        "network",
        "net",
    ]

    for key in common_keys:

        value = checkpoint.get(
            key
        )

        if _looks_like_state_dict(
            value
        ):

            return value

    raise RuntimeError(
        "checkpoint에서 model state_dict를 "
        "찾지 못했습니다.\n"
        f"checkpoint keys: {list(checkpoint.keys())}"
    )


def strip_module_prefix(
    state_dict: Mapping[
        str,
        torch.Tensor,
    ],
) -> Dict[str, torch.Tensor]:

    cleaned = {}

    for key, value in (
        state_dict.items()
    ):

        new_key = str(
            key
        )

        if new_key.startswith(
            "module."
        ):

            new_key = (
                new_key[
                    len(
                        "module."
                    ):
                ]
            )

        cleaned[
            new_key
        ] = value

    return cleaned


def load_checkpoint(
    model: nn.Module,
    checkpoint_path: Path | str,
    device: torch.device,
) -> None:

    checkpoint_path = Path(
        checkpoint_path
    )

    if not checkpoint_path.exists():

        raise FileNotFoundError(
            "Checkpoint 없음:\n"
            f"{checkpoint_path}"
        )

    checkpoint = torch.load(
        checkpoint_path,
        map_location=device,
        weights_only=True,
    )

    state_dict = extract_state_dict(
        checkpoint
    )

    state_dict = strip_module_prefix(
        state_dict
    )

    try:

        model.load_state_dict(
            state_dict,
            strict=True,
        )

    except RuntimeError as exc:

        raise RuntimeError(
            "Checkpoint와 CPMNetv2 architecture가 "
            "일치하지 않습니다.\n"
            f"Checkpoint: {checkpoint_path}"
        ) from exc


# =============================================================================
# PUBLIC LOADER
# =============================================================================

def load_detection_model(
    checkpoint_path: Path | str = DEFAULT_CHECKPOINT,
    device: Optional[str] = None,
) -> Tuple[nn.Module, torch.device]:

    torch_device = resolve_device(
        device
    )

    model = build_model()

    model.to(
        torch_device
    )

    load_checkpoint(
        model=model,
        checkpoint_path=checkpoint_path,
        device=torch_device,
    )

    model.eval()

    return (
        model,
        torch_device,
    )


# =============================================================================
# SELF TEST
# =============================================================================

if __name__ == "__main__":

    print(
        "=" * 100
    )

    print(
        "CPMNetv2 deployment model QA"
    )

    print(
        "=" * 100
    )

    model, device = (
        load_detection_model()
    )

    total_parameters = sum(
        parameter.numel()
        for parameter
        in model.parameters()
    )

    trainable_parameters = sum(
        parameter.numel()
        for parameter
        in model.parameters()
        if parameter.requires_grad
    )

    print(
        "Device:",
        device,
    )

    print(
        "Checkpoint:",
        DEFAULT_CHECKPOINT,
    )

    print(
        "Total parameters:",
        total_parameters,
    )

    print(
        "Trainable parameters:",
        trainable_parameters,
    )

    print(
        "Training mode:",
        model.training,
    )

    assert (
        model.training
        is False
    )

    print()

    print(
        "[PASS] CPMNetv2 model load completed"
    )
