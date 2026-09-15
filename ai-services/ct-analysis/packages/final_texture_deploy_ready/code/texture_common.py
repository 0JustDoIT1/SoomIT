from pathlib import Path
import sys

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset


ROOT = Path(__file__).resolve().parents[1]

MEDICALNET_ROOT = (
    ROOT
    / "external"
    / "MedicalNet"
)

PRETRAINED_PATH = (
    ROOT
    / "models"
    / "med3d"
    / "resnet_18_23dataset.pth"
)

CLASS_NAMES = [
    "GGO",
    "PART_SOLID",
    "SOLID",
]


class TextureDataset(Dataset):
    def __init__(
        self,
        dataframe,
        augment=False,
    ):
        self.df = dataframe.reset_index(
            drop=True
        )

        self.augment = augment

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]

        x = np.load(
            row["ct_path"]
        ).astype(np.float32)

        if x.shape != (
            1,
            64,
            64,
            64,
        ):
            raise ValueError(
                f"Unexpected shape "
                f"{x.shape}: "
                f"{row[ct_path]}"
            )

        #
        # Simple spatial augmentation
        #
        if self.augment:
            if np.random.rand() < 0.5:
                x = np.flip(
                    x,
                    axis=1,
                ).copy()

            if np.random.rand() < 0.5:
                x = np.flip(
                    x,
                    axis=2,
                ).copy()

            if np.random.rand() < 0.5:
                x = np.flip(
                    x,
                    axis=3,
                ).copy()

        target = int(
            row["texture_target"]
        )

        if target not in (
            0,
            1,
            2,
        ):
            raise ValueError(
                f"Invalid texture target: "
                f"{target}"
            )

        return {
            "image": torch.from_numpy(x),
            "target": torch.tensor(
                target,
                dtype=torch.long,
            ),
            "pid": str(row["PID"]),
            "nid": int(row["NID"]),
        }


def load_med3d_pretrained(
    base_model,
):
    checkpoint = torch.load(
        PRETRAINED_PATH,
        map_location="cpu",
        weights_only=False,
    )

    if "state_dict" in checkpoint:
        state = checkpoint["state_dict"]
    else:
        state = checkpoint

    clean = {}

    for key, value in state.items():
        new_key = key

        if new_key.startswith(
            "module."
        ):
            new_key = new_key[
                len("module.") :
            ]

        if new_key.startswith(
            "model."
        ):
            new_key = new_key[
                len("model.") :
            ]

        clean[new_key] = value

    model_state = (
        base_model.state_dict()
    )

    compatible = {
        k: v
        for k, v in clean.items()
        if (
            k in model_state
            and tuple(v.shape)
            == tuple(
                model_state[k].shape
            )
        )
    }

    result = (
        base_model.load_state_dict(
            compatible,
            strict=False,
        )
    )

    print(
        f"[Med3D] loaded "
        f"{len(compatible)}/"
        f"{len(clean)} tensors"
    )

    print(
        f"[Med3D] missing keys: "
        f"{len(result.missing_keys)}"
    )

    return base_model


class TextureResNet18(nn.Module):
    def __init__(
        self,
        pretrained=True,
        dropout=0.3,
    ):
        super().__init__()

        sys.path.insert(
            0,
            str(MEDICALNET_ROOT),
        )

        from models.resnet import (
            resnet18,
        )

        base = resnet18(
            sample_input_D=64,
            sample_input_H=64,
            sample_input_W=64,
            num_seg_classes=3,
            shortcut_type="A",
            no_cuda=(
                not torch.cuda.is_available()
            ),
        )

        if pretrained:
            base = (
                load_med3d_pretrained(
                    base
                )
            )

        #
        # Encoder only.
        # MedicalNet conv_seg excluded.
        #
        self.conv1 = base.conv1
        self.bn1 = base.bn1
        self.relu = base.relu
        self.maxpool = base.maxpool

        self.layer1 = base.layer1
        self.layer2 = base.layer2
        self.layer3 = base.layer3
        self.layer4 = base.layer4

        self.pool = (
            nn.AdaptiveAvgPool3d(1)
        )

        self.dropout = nn.Dropout(
            p=dropout
        )

        self.classifier = nn.Linear(
            512,
            3,
        )

    def forward_features(
        self,
        x,
    ):
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = self.maxpool(x)

        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)

        x = self.pool(x)
        x = torch.flatten(
            x,
            1,
        )

        x = self.dropout(x)

        return x

    def forward(
        self,
        x,
    ):
        x = self.forward_features(
            x
        )

        logits = self.classifier(
            x
        )

        return logits

