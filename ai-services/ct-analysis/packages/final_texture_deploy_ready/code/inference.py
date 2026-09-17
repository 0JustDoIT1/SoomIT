
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PACKAGE_ROOT

# "models/resnet.py" lives under external/MedicalNet, so `from models.resnet import
# ...` needs external/MedicalNet itself (the parent of models/) on sys.path - not the
# models/ directory.
MEDICALNET_ROOT = (
    PACKAGE_ROOT
    / "external"
    / "MedicalNet"
)

CODE_DIR = PACKAGE_ROOT / "code"

sys.path.insert(0, str(CODE_DIR))

import texture_common_ctmask as texture_common

# texture_common_ctmask.py ships with a hardcoded personal-machine default for
# MEDICALNET_ROOT; override it with the real deployed location before the model
# class's __init__ uses it to extend sys.path (mirrors the morphology package).
texture_common.MEDICALNET_ROOT = MEDICALNET_ROOT

TextureCTMaskResNet18 = texture_common.TextureCTMaskResNet18


CLASS_NAMES = [
    "GGO",
    "PART_SOLID",
    "SOLID",
]

CHECKPOINT = (
    PACKAGE_ROOT
    / "checkpoint"
    / "texture_med3d_final.pt"
)

DEVICE = torch.device(
    "cuda"
    if torch.cuda.is_available()
    else "cpu"
)


def load_array(path: str | Path) -> np.ndarray:
    arr = np.load(path).astype(np.float32)

    if arr.shape == (64, 64, 64):
        arr = arr[None, ...]

    if arr.shape != (1, 64, 64, 64):
        raise ValueError(
            f"Expected [1,64,64,64], got {arr.shape}: {path}"
        )

    return arr


def build_input(
    ct_path: str | Path,
    mask_path: str | Path,
) -> torch.Tensor:
    ct = load_array(ct_path)
    mask = load_array(mask_path)

    x = np.concatenate(
        [ct, mask],
        axis=0,
    )

    if x.shape != (2, 64, 64, 64):
        raise RuntimeError(
            f"Unexpected input shape: {x.shape}"
        )

    x = torch.from_numpy(
        np.ascontiguousarray(x)
    )

    return x.unsqueeze(0)


def load_model(device: torch.device = DEVICE) -> torch.nn.Module:
    model = TextureCTMaskResNet18(
        pretrained=False,
    ).to(device)

    checkpoint = torch.load(
        CHECKPOINT,
        map_location=device,
        weights_only=False,
    )

    if isinstance(checkpoint, dict):
        if "model_state_dict" in checkpoint:
            state_dict = checkpoint["model_state_dict"]
        elif "state_dict" in checkpoint:
            state_dict = checkpoint["state_dict"]
        else:
            state_dict = checkpoint
    else:
        state_dict = checkpoint

    model.load_state_dict(
        state_dict,
        strict=True,
    )

    model.eval()

    return model


@torch.inference_mode()
def predict(
    model: torch.nn.Module,
    ct_path: str | Path,
    mask_path: str | Path,
    device: torch.device = DEVICE,
) -> dict:
    x = build_input(
        ct_path,
        mask_path,
    ).to(
        device,
        non_blocking=True,
    )

    logits = model(x)

    probabilities = torch.softmax(
        logits,
        dim=1,
    )[0]

    pred_idx = int(
        torch.argmax(
            probabilities
        ).item()
    )

    probs = probabilities.detach().cpu().tolist()

    return {
        "prediction": pred_idx,
        "prediction_label": CLASS_NAMES[pred_idx],
        "probabilities": {
            "GGO": float(probs[0]),
            "PART_SOLID": float(probs[1]),
            "SOLID": float(probs[2]),
        },
        "input_shape": list(x.shape),
        "device": str(device),
        "model": "texture_med3d_resnet18_ctmask",
        "model_version": "1.0.0",
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--ct",
        required=True,
        help="CT .npy [1,64,64,64]",
    )

    parser.add_argument(
        "--mask",
        required=True,
        help="Nodule mask .npy [1,64,64,64]",
    )

    parser.add_argument(
        "--output",
        default=None,
    )

    args = parser.parse_args()

    model = load_model()

    result = predict(
        model,
        args.ct,
        args.mask,
    )

    text = json.dumps(
        result,
        ensure_ascii=False,
        indent=2,
    )

    print(text)

    if args.output:
        Path(
            args.output
        ).write_text(
            text,
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()

