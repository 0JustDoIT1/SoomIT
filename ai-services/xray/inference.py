from __future__ import annotations

import io
import os
import threading
from pathlib import Path
from typing import Any

import timm
import torch
import torch.nn as nn
from PIL import Image, UnidentifiedImageError
from torchvision import transforms
from torchvision.models.detection import fasterrcnn_resnet50_fpn_v2
from torchvision.transforms.functional import to_tensor

from artifact import ensure_gcs_artifact


DETECTOR_CLASS_NAMES = [
    "Background",
    "Atelectasis",
    "Calcification",
    "Cardiomegaly",
    "Consolidation",
    "Diffuse Nodule",
    "Effusion",
    "Emphysema",
    "Fibrosis",
    "Fracture",
    "Mass",
    "Nodule",
    "Pleural Thickening",
    "Pneumothorax",
]

CLASSIFICATION_CLASS_NAMES = [
    "Normal",
    "Other Lung Disease",
    "Suspicious Lung Cancer",
]

CLASSIFICATION_TRANSFORM = transforms.Compose(
    [
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ]
)


class InvalidImageError(ValueError):
    pass


def _unwrap_checkpoint(checkpoint: Any) -> dict[str, torch.Tensor]:
    if not isinstance(checkpoint, dict):
        return checkpoint
    for key in ("model_state_dict", "state_dict", "model"):
        nested = checkpoint.get(key)
        if isinstance(nested, dict):
            checkpoint = nested
            break
    if checkpoint and all(key.startswith("module.") for key in checkpoint):
        checkpoint = {key.removeprefix("module."): value for key, value in checkpoint.items()}
    return checkpoint


def _load_checkpoint(path: Path) -> dict[str, torch.Tensor]:
    if not path.is_file():
        raise RuntimeError(f"Model checkpoint does not exist: {path}")
    return _unwrap_checkpoint(torch.load(path, map_location="cpu", weights_only=True))


def build_detector(path: Path) -> nn.Module:
    model = fasterrcnn_resnet50_fpn_v2(
        weights=None,
        weights_backbone=None,
        num_classes=len(DETECTOR_CLASS_NAMES),
        min_size=1200,
        max_size=1333,
    )
    model.load_state_dict(_load_checkpoint(path), strict=True)
    return model.eval()


def build_classifier(path: Path) -> nn.Module:
    model = timm.create_model(
        "swin_base_patch4_window7_224",
        pretrained=False,
        num_classes=len(CLASSIFICATION_CLASS_NAMES),
    )
    model.head = nn.Linear(model.num_features, len(CLASSIFICATION_CLASS_NAMES))

    # The supplied checkpoint was trained with the legacy timm head pooling behavior.
    def legacy_forward_head(x: torch.Tensor, pre_logits: bool = False) -> torch.Tensor:
        if x.ndim == 4:
            x = x.mean(dim=(1, 2))
        elif x.ndim == 3:
            x = x.mean(dim=1)
        return x if pre_logits else model.head(x)

    model.forward_head = legacy_forward_head
    model.load_state_dict(_load_checkpoint(path), strict=True)
    return model.eval()


class XrayModels:
    def __init__(self) -> None:
        requested_device = os.environ.get("DEVICE", "cuda")
        if requested_device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("DEVICE=cuda, but CUDA is not available")

        self.device = torch.device(requested_device)
        detector_path = Path(os.environ.get("DETECTOR_MODEL_PATH", "/models/detector_final_model.pth"))
        classifier_path = Path(
            os.environ.get("CLASSIFICATION_MODEL_PATH", "/models/classification_final_model.pth")
        )
        self.detector_sha256 = ensure_gcs_artifact(
            os.environ.get("DETECTOR_MODEL_GCS_URI"),
            detector_path,
            os.environ.get(
                "DETECTOR_MODEL_SHA256",
                "bf80f1d0052e745f477bc4d92a0de52c05c30090449df7875d90093505d1f3c2",
            ),
        )
        self.classifier_sha256 = ensure_gcs_artifact(
            os.environ.get("CLASSIFICATION_MODEL_GCS_URI"),
            classifier_path,
            os.environ.get(
                "CLASSIFICATION_MODEL_SHA256",
                "7f3cec7f00860cebb9497a956dc46b1b1645f8c2ff8676754041db4e716bd5b1",
            ),
        )
        self.detector = build_detector(detector_path).to(self.device)
        self.classifier = build_classifier(classifier_path).to(self.device)
        self.revision = os.environ.get("MODEL_REVISION", "xray-v1")
        self._lock = threading.Lock()

        if self.device.type == "cuda":
            torch.backends.cudnn.benchmark = True

    @staticmethod
    def decode_image(content: bytes) -> Image.Image:
        try:
            with Image.open(io.BytesIO(content)) as source:
                source.load()
                return source.convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise InvalidImageError("The request body is not a supported PNG or JPEG image") from exc

    @torch.inference_mode()
    def predict(self, image: Image.Image, score_threshold: float) -> dict[str, Any]:
        with self._lock:
            classifier_input = CLASSIFICATION_TRANSFORM(image).unsqueeze(0).to(self.device)
            logits = self.classifier(classifier_input)
            probabilities_tensor = torch.softmax(logits, dim=1)[0].cpu()
            class_index = int(probabilities_tensor.argmax())
            probabilities = {
                name: float(probabilities_tensor[index])
                for index, name in enumerate(CLASSIFICATION_CLASS_NAMES)
            }

            detector_input = to_tensor(image).to(self.device)
            output = self.detector([detector_input])[0]
            detections = []
            for box, score_tensor, label_tensor in zip(
                output["boxes"], output["scores"], output["labels"], strict=True
            ):
                score = float(score_tensor)
                if score < score_threshold:
                    continue
                label = int(label_tensor)
                if not 0 < label < len(DETECTOR_CLASS_NAMES):
                    continue
                detections.append(
                    {
                        "class_id": label,
                        "class_name": DETECTOR_CLASS_NAMES[label],
                        "score": score,
                        "bbox_xyxy": [float(value) for value in box.cpu()],
                    }
                )

        assessment = ("NEGATIVE", "INDETERMINATE", "SUSPICIOUS")[class_index]
        return {
            "model_revision": self.revision,
            "image": {"width": image.width, "height": image.height},
            "classification": {
                "prediction": CLASSIFICATION_CLASS_NAMES[class_index],
                "class_index": class_index,
                "assessment": assessment,
                "suspicion_score": probabilities["Suspicious Lung Cancer"],
                "probabilities": probabilities,
            },
            "detections": detections,
        }
