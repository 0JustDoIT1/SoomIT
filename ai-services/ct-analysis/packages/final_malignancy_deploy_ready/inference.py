import argparse
import json
from pathlib import Path

import numpy as np
import torch

from model import build_model


PACKAGE_ROOT = Path(__file__).resolve().parent
PACKAGES_ROOT = PACKAGE_ROOT.parent
BUNDLE_ROOT = PACKAGES_ROOT.parent

MODEL_CONFIG_PATH = (
    PACKAGE_ROOT
    / "model_config.json"
)

CHECKPOINT_PATH = (
    PACKAGE_ROOT
    / "med3d_resnet18_best.pth"
)

MEDICALNET_ROOT = (
    BUNDLE_ROOT
    / "external"
    / "MedicalNet"
)


def load_config():
    with open(
        MODEL_CONFIG_PATH,
        "r",
        encoding="utf-8",
    ) as f:
        return json.load(f)


def load_preprocessed_patch(
    path,
):
    arr = np.load(
        path
    ).astype(
        np.float32
    )

    if arr.shape == (
        64,
        64,
        64,
    ):
        arr = arr[
            None,
            ...
        ]

    if arr.shape != (
        1,
        64,
        64,
        64,
    ):
        raise ValueError(
            "Malignancy input must have "
            f"shape [1,64,64,64], got {arr.shape}"
        )

    if not np.isfinite(arr).all():
        raise ValueError(
            "Malignancy input contains "
            "NaN or Inf"
        )

    # Segmentation-side patch builder already performs:
    # 50 mm physical crop
    # -> 64^3 resize
    # -> HU clipping [-1000, 400]
    # -> normalization [0, 1]
    #
    # Therefore no second preprocessing is applied here.

    tensor = torch.from_numpy(
        np.ascontiguousarray(arr)
    ).float()

    tensor = tensor.unsqueeze(0)

    return tensor, arr


@torch.inference_mode()
def predict(
    model,
    tensor,
    device,
    threshold,
):
    tensor = tensor.to(
        device,
        non_blocking=True,
    )

    logits = model(
        tensor
    )

    probability = float(
        torch.sigmoid(
            logits
        )
        .squeeze()
        .item()
    )

    malignancy_score = (
        probability
        * 100.0
    )

    prediction = (
        "MALIGNANT"
        if probability >= threshold
        else "BENIGN"
    )

    return {
        "probability": probability,
        "malignancy_score": float(
            malignancy_score
        ),
        "prediction": prediction,
        "threshold": float(
            threshold
        ),
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--input",
        required=True,
        help=(
            "Preprocessed malignancy CT patch "
            ".npy [1,64,64,64]"
        ),
    )

    parser.add_argument(
        "--output",
        default=None,
    )

    args = parser.parse_args()

    config = load_config()

    threshold = float(
        config.get(
            "threshold",
            0.5,
        )
    )

    device = torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    tensor, array = (
        load_preprocessed_patch(
            args.input
        )
    )

    model, checkpoint = build_model(
        medicalnet_root=MEDICALNET_ROOT,
        checkpoint_path=CHECKPOINT_PATH,
        device=device,
    )

    prediction = predict(
        model=model,
        tensor=tensor,
        device=device,
        threshold=threshold,
    )

    result = {
        "model": {
            "name": config.get(
                "model_name",
                "Med3DResNet18Malignancy",
            ),
            "version": config.get(
                "model_version",
                "v1",
            ),
            "checkpoint_epoch": int(
                checkpoint.get(
                    "epoch",
                    -1,
                )
            ),
        },
        "input": {
            "path": str(
                Path(args.input)
            ),
            "shape": list(
                array.shape
            ),
            "dtype": str(
                array.dtype
            ),
            "min": float(
                array.min()
            ),
            "max": float(
                array.max()
            ),
            "preprocessed": True,
            "preprocessing": {
                "physical_crop_mm": 50.0,
                "output_shape": [
                    1,
                    64,
                    64,
                    64,
                ],
                "hu_clip": [
                    -1000.0,
                    400.0,
                ],
                "normalization": "linear_0_1",
            },
        },
        "prediction": prediction,
        "device": str(
            device
        ),
    }

    text = json.dumps(
        result,
        indent=2,
        ensure_ascii=False,
    )

    print(text)

    if args.output:
        output_path = Path(
            args.output
        )

        output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        output_path.write_text(
            text,
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()

