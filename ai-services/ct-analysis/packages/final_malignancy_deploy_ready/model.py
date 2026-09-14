
import importlib.util
from pathlib import Path
import sys

import numpy as np
import torch
import torch.nn as nn


# Compatibility for checkpoints serialized with NumPy 2.x
if "numpy._core" not in sys.modules:
    sys.modules["numpy._core"] = np.core

if "numpy._core.multiarray" not in sys.modules:
    sys.modules["numpy._core.multiarray"] = np.core.multiarray


class Med3DResNet18Classifier(nn.Module):
    def __init__(self, backbone):
        super().__init__()

        self.conv1 = backbone.conv1
        self.bn1 = backbone.bn1
        self.relu = backbone.relu
        self.maxpool = backbone.maxpool

        self.layer1 = backbone.layer1
        self.layer2 = backbone.layer2
        self.layer3 = backbone.layer3
        self.layer4 = backbone.layer4

        self.pool = nn.AdaptiveAvgPool3d((1, 1, 1))
        self.dropout = nn.Dropout(p=0.3)
        self.fc = nn.Linear(512, 1)

    def forward(self, x):
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = self.maxpool(x)

        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)

        x = self.pool(x)
        x = torch.flatten(x, 1)
        x = self.dropout(x)

        return self.fc(x)


def build_model(
    medicalnet_root,
    checkpoint_path,
    device,
):
    medicalnet_root = Path(medicalnet_root)

    resnet_path = (
        medicalnet_root
        / "models"
        / "resnet.py"
    )

    if not resnet_path.exists():
        raise FileNotFoundError(
            f"MedicalNet resnet.py not found: {resnet_path}"
        )

    spec = importlib.util.spec_from_file_location(
        "medicalnet_resnet",
        resnet_path,
    )

    resnet = importlib.util.module_from_spec(
        spec
    )

    spec.loader.exec_module(
        resnet
    )

    backbone = resnet.resnet18(
        sample_input_W=64,
        sample_input_H=64,
        sample_input_D=64,
        shortcut_type="A",
        no_cuda=(device.type != "cuda"),
        num_seg_classes=1,
    )

    model = Med3DResNet18Classifier(
        backbone
    )

    checkpoint = torch.load(
        checkpoint_path,
        map_location=device,
        weights_only=False,
    )

    model.load_state_dict(
        checkpoint["model_state_dict"]
    )

    model = model.to(device)
    model.eval()

    return model, checkpoint

