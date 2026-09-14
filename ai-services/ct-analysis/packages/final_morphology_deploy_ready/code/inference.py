import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch


CODE_DIR = Path(__file__).resolve().parent
DEPLOY_ROOT = CODE_DIR.parent

MEDICALNET_ROOT = (
    DEPLOY_ROOT
    / "third_party"
    / "MedicalNet"
)

sys.path.insert(
    0,
    str(CODE_DIR),
)

import morphology_common_ctmask as morphology_common

morphology_common.MEDICALNET_ROOT = (
    MEDICALNET_ROOT
)

MorphologyCTMaskResNet18 = (
    morphology_common
    .MorphologyCTMaskResNet18
)


CHECKPOINT_PATH = (
    DEPLOY_ROOT
    / "model"
    / "morphology_med3d_final.pt"
)

THRESHOLD_PATH = (
    DEPLOY_ROOT
    / "config"
    / "thresholds.json"
)


def load_thresholds():
    with open(
        THRESHOLD_PATH,
        "r",
        encoding="utf-8",
    ) as f:
        return json.load(f)


def load_model(device):
    model = MorphologyCTMaskResNet18(
        pretrained=False
    )

    checkpoint = torch.load(
        CHECKPOINT_PATH,
        map_location="cpu",
    )

    model.load_state_dict(
        checkpoint[
            "model_state_dict"
        ],
        strict=True,
    )

    model = model.to(device)
    model.eval()

    return model, checkpoint


def load_array(path, name):
    array = np.load(
        path
    ).astype(
        np.float32
    )

    if array.shape != (
        1,
        64,
        64,
        64,
    ):
        raise ValueError(
            f"{name} shape must be "
            "(1, 64, 64, 64), "
            f"got {array.shape}"
        )

    return array


def prepare_input(
    ct_path,
    mask_path,
):
    ct = load_array(
        ct_path,
        "CT",
    )

    mask = load_array(
        mask_path,
        "Mask",
    )

    x = np.concatenate(
        [
            ct,
            mask,
        ],
        axis=0,
    )

    return torch.from_numpy(
        x
    ).unsqueeze(
        0
    )


@torch.no_grad()
def predict(
    model,
    x,
    thresholds,
    device,
):
    x = x.to(
        device,
        non_blocking=True,
    )

    logits = model(x)

    probs = torch.sigmoid(
        logits
    )[0].detach().cpu().numpy()

    spic_prob = float(
        probs[0]
    )

    lob_prob = float(
        probs[1]
    )

    spic_threshold = float(
        thresholds[
            "spiculation"
        ]
    )

    lob_threshold = float(
        thresholds[
            "lobulation"
        ]
    )

    return {
        "spiculation": {
            "probability": spic_prob,
            "threshold": spic_threshold,
            "prediction": (
                "POSITIVE"
                if spic_prob
                >= spic_threshold
                else "NEGATIVE"
            ),
        },
        "lobulation": {
            "probability": lob_prob,
            "threshold": lob_threshold,
            "prediction": (
                "POSITIVE"
                if lob_prob
                >= lob_threshold
                else "NEGATIVE"
            ),
        },
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--ct",
        required=True,
    )

    parser.add_argument(
        "--mask",
        required=True,
    )

    parser.add_argument(
        "--output",
        default=None,
    )

    args = parser.parse_args()

    device = torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    thresholds = load_thresholds()

    model, checkpoint = load_model(
        device
    )

    x = prepare_input(
        args.ct,
        args.mask,
    )

    prediction = predict(
        model,
        x,
        thresholds,
        device,
    )

    result = {
        "model": {
            "name": "morphology_med3d_final",
            "version": "1.0.0",
            "checkpoint_epoch": int(
                checkpoint.get(
                    "epoch",
                    -1,
                )
            ),
        },
        "input": {
            "ct": str(
                Path(args.ct)
            ),
            "mask": str(
                Path(args.mask)
            ),
            "tensor_shape": list(
                x.shape
            ),
        },
        "prediction": prediction,
    }

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )

    if args.output:
        output_path = Path(
            args.output
        )

        output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with open(
            output_path,
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(
                result,
                f,
                indent=2,
                ensure_ascii=False,
            )


if __name__ == "__main__":
    main()

