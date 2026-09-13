import io
import math
import sys
import threading
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn

from artifact import ensure_gcs_artifact


TPS_RANGES = {
    0: ("LT_1", "<1%"),
    1: ("FROM_1_TO_49", "1–49%"),
    2: ("GE_50", "≥50%"),
}


class InvalidFeatureFile(ValueError):
    pass


class PDL1Predictor:
    """Load AMD-MIL once and predict from serialized Virchow2 features."""

    def __init__(
        self,
        checkpoint_path: Path,
        mil_baseline_path: Path,
        *,
        model_gcs_uri: str | None = None,
        model_sha256: str = "",
        model_revision: str = "final_model",
        device: str | None = None,
        max_patches: int = 5000,
    ) -> None:
        mil_baseline_path = mil_baseline_path.resolve(strict=True)
        if str(mil_baseline_path) not in sys.path:
            sys.path.insert(0, str(mil_baseline_path))

        from modules.AMD_MIL.amd_mil import AMD_MIL

        selected_device = device or ("cuda:0" if torch.cuda.is_available() else "cpu")
        if selected_device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError(f"{selected_device} was requested, but CUDA is not available")

        self.device = torch.device(selected_device)
        self.max_patches = max_patches
        self.model_revision = model_revision
        self.model_sha256 = ensure_gcs_artifact(
            model_gcs_uri,
            checkpoint_path,
            model_sha256,
        )
        self._lock = threading.Lock()
        self.model = AMD_MIL(
            num_classes=3,
            in_dim=2560,
            embed_dim=512,
            dropout=0.20,
            act=nn.ReLU(),
            agent_num=128,
        )
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
        state_dict = checkpoint.get("model_state_dict")
        if not isinstance(state_dict, dict):
            raise RuntimeError("checkpoint does not contain model_state_dict")
        self.model.load_state_dict(state_dict, strict=True)
        self.model = self.model.to(self.device)
        self.model.eval()

    def predict_bytes(self, content: bytes) -> dict[str, Any]:
        try:
            data = torch.load(io.BytesIO(content), map_location="cpu", weights_only=True)
        except Exception as exc:
            raise InvalidFeatureFile("request body is not a valid safe PyTorch feature file") from exc

        if not isinstance(data, dict):
            raise InvalidFeatureFile("feature file must contain a dictionary")
        features = data.get("features")
        if not isinstance(features, torch.Tensor):
            raise InvalidFeatureFile("feature file does not contain a features tensor")
        if features.ndim != 2 or features.shape[1] != 2560:
            raise InvalidFeatureFile("features shape must be [N, 2560]")
        patch_count = features.shape[0]
        if patch_count < 1 or patch_count > self.max_patches:
            raise InvalidFeatureFile(f"patch count must be between 1 and {self.max_patches}")
        if not features.is_floating_point() or not torch.isfinite(features).all().item():
            raise InvalidFeatureFile("features must be a finite floating-point tensor")

        batch = features.float().unsqueeze(0).to(self.device)
        with self._lock, torch.inference_mode():
            output = self.model(batch)
            logits = output.get("logits") if isinstance(output, dict) else None
            if not isinstance(logits, torch.Tensor) or tuple(logits.shape) != (1, 3):
                raise RuntimeError("model logits shape is not [1, 3]")
            probabilities = torch.softmax(logits, dim=1).squeeze(0).cpu()

        predicted_class = int(probabilities.argmax().item())
        range_code, range_label = TPS_RANGES[predicted_class]
        values = [float(value) for value in probabilities.tolist()]
        if not all(math.isfinite(value) for value in values):
            raise RuntimeError("model probabilities contain a non-finite value")

        return {
            "model_revision": self.model_revision,
            "model_sha256": self.model_sha256,
            "main_index": data.get("main_index"),
            "pdl1_image_id": data.get("pdl1_image_id"),
            "patch_count": patch_count,
            "predicted_class": predicted_class,
            "predicted_tps_range": range_code,
            "predicted_tps_range_label": range_label,
            "confidence": values[predicted_class],
            "probabilities": {
                "class_0": values[0],
                "class_1": values[1],
                "class_2": values[2],
            },
        }
