from pathlib import Path
import sys

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset


# Fallback default; inference.py overrides MEDICALNET_ROOT with the real deployed
# location (third_party/MedicalNet, not external/MedicalNet) before instantiating
# MorphologyCTMaskResNet18.
ROOT = Path(__file__).resolve().parents[1]

MEDICALNET_ROOT = (
    ROOT
    / "third_party"
    / "MedicalNet"
)

PRETRAINED_PATH = (
    ROOT
    / "models"
    / "med3d"
    / "resnet_18_23dataset.pth"
)


class MorphologyCTMaskDataset(Dataset):
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

    def __getitem__(
        self,
        idx,
    ):
        row = self.df.iloc[idx]

        ct = np.load(
            row["ct_path"]
        ).astype(
            np.float32
        )

        mask = np.load(
            row["nodule_mask_path"]
        ).astype(
            np.float32
        )

        if ct.shape != (
            1,
            64,
            64,
            64,
        ):
            raise ValueError(
                f"Unexpected CT shape "
                f"{ct.shape}: "
                f"{row['ct_path']}"
            )

        if mask.shape != (
            1,
            64,
            64,
            64,
        ):
            raise ValueError(
                f"Unexpected mask shape "
                f"{mask.shape}: "
                f"{row['nodule_mask_path']}"
            )

        #
        # Apply same augmentation
        # to CT and mask
        #
        if self.augment:

            for axis in [
                1,
                2,
                3,
            ]:

                if np.random.rand() < 0.5:

                    ct = np.flip(
                        ct,
                        axis=axis,
                    ).copy()

                    mask = np.flip(
                        mask,
                        axis=axis,
                    ).copy()

        #
        # 2-channel input
        #
        x = np.concatenate(
            [
                ct,
                mask,
            ],
            axis=0,
        )

        targets = np.array(
            [
                row[
                    "spiculation_target"
                ],
                row[
                    "lobulation_target"
                ],
            ],
            dtype=np.float32,
        )

        valid = np.array(
            [
                row[
                    "spiculation_valid"
                ],
                row[
                    "lobulation_valid"
                ],
            ],
            dtype=np.float32,
        )

        return {
            "image": torch.from_numpy(
                x
            ),
            "target": torch.from_numpy(
                targets
            ),
            "valid": torch.from_numpy(
                valid
            ),
            "pid": str(
                row["PID"]
            ),
            "nid": int(
                row["NID"]
            ),
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
        state = checkpoint[
            "state_dict"
        ]
    else:
        state = checkpoint

    clean = {}

    for key, value in (
        state.items()
    ):

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

        clean[
            new_key
        ] = value

    model_state = (
        base_model.state_dict()
    )

    compatible = {}

    for key, value in (
        clean.items()
    ):

        if key not in model_state:
            continue

        if (
            tuple(
                value.shape
            )
            != tuple(
                model_state[
                    key
                ].shape
            )
        ):
            continue

        compatible[
            key
        ] = value

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


class MorphologyCTMaskResNet18(
    nn.Module
):

    def __init__(
        self,
        pretrained=True,
    ):
        super().__init__()

        sys.path.insert(
            0,
            str(
                MEDICALNET_ROOT
            ),
        )

        from models.resnet import (
            resnet18,
        )

        base = resnet18(
            sample_input_D=64,
            sample_input_H=64,
            sample_input_W=64,
            num_seg_classes=2,
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
        # Replace conv1:
        # 1 channel -> 2 channels
        #
        old_conv = base.conv1

        new_conv = nn.Conv3d(
            in_channels=2,
            out_channels=(
                old_conv.out_channels
            ),
            kernel_size=(
                old_conv.kernel_size
            ),
            stride=(
                old_conv.stride
            ),
            padding=(
                old_conv.padding
            ),
            bias=False,
        )

        with torch.no_grad():

            #
            # Preserve pretrained CT kernel
            #
            new_conv.weight[
                :,
                0:1,
                ...
            ].copy_(
                old_conv.weight
            )

            #
            # Initialize mask channel
            # from same pretrained kernel
            #
            new_conv.weight[
                :,
                1:2,
                ...
            ].copy_(
                old_conv.weight
            )

            #
            # Keep total initial response
            # scale comparable to 1-channel
            #
            new_conv.weight.mul_(
                0.5
            )

        self.conv1 = new_conv

        self.bn1 = base.bn1
        self.relu = base.relu
        self.maxpool = base.maxpool

        self.layer1 = base.layer1
        self.layer2 = base.layer2
        self.layer3 = base.layer3
        self.layer4 = base.layer4

        self.pool = (
            nn.AdaptiveAvgPool3d(
                1
            )
        )

        self.dropout = nn.Dropout(
            p=0.3
        )

        self.spiculation_head = (
            nn.Linear(
                512,
                1,
            )
        )

        self.lobulation_head = (
            nn.Linear(
                512,
                1,
            )
        )

    def forward_features(
        self,
        x,
    ):

        x = self.conv1(
            x
        )

        x = self.bn1(
            x
        )

        x = self.relu(
            x
        )

        x = self.maxpool(
            x
        )

        x = self.layer1(
            x
        )

        x = self.layer2(
            x
        )

        x = self.layer3(
            x
        )

        x = self.layer4(
            x
        )

        x = self.pool(
            x
        )

        x = torch.flatten(
            x,
            1,
        )

        x = self.dropout(
            x
        )

        return x

    def forward(
        self,
        x,
    ):

        x = self.forward_features(
            x
        )

        spic = (
            self.spiculation_head(
                x
            )
            .squeeze(1)
        )

        lob = (
            self.lobulation_head(
                x
            )
            .squeeze(1)
        )

        return torch.stack(
            [
                spic,
                lob,
            ],
            dim=1,
        )

