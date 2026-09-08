import io
import math
import sys
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn


TPS_RANGES = {
    0: ("LT_1", "<1%"),
    1: ("FROM_1_TO_49", "1–49%"),
    2: ("GE_50", "≥50%"),
}


class InvalidFeatureFile(ValueError):
    pass


class PDL1Predictor:
    """Loads AMD-MIL once and predicts from serialized Virchow2 features."""

    def __init__(
        self,
        checkpoint_path: Path,
        mil_baseline_path: Path,
        *,
        device: str | None = None,
        max_patches: int = 5000,
    ) -> None:
        checkpoint_path = checkpoint_path.resolve(strict=True)
        mil_baseline_path = mil_baseline_path.resolve(strict=True)
        if str(mil_baseline_path) not in sys.path:
            sys.path.insert(0, str(mil_baseline_path))

        from modules.AMD_MIL.amd_mil import AMD_MIL

        selected_device = device or ("cuda:0" if torch.cuda.is_available() else "cpu")
        self.device = torch.device(selected_device)
        self.max_patches = max_patches
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
            raise RuntimeError("체크포인트에 model_state_dict가 없습니다.")
        self.model.load_state_dict(state_dict)
        self.model = self.model.to(self.device)
        self.model.eval()

    def predict_bytes(self, content: bytes) -> dict[str, Any]:
        try:
            data = torch.load(io.BytesIO(content), map_location="cpu", weights_only=True)
        except Exception as exc:
            raise InvalidFeatureFile("유효한 PyTorch feature 파일이 아닙니다.") from exc

        if not isinstance(data, dict):
            raise InvalidFeatureFile("feature 파일의 최상위 값은 객체여야 합니다.")
        features = data.get("features")
        if not isinstance(features, torch.Tensor):
            raise InvalidFeatureFile("features tensor가 없습니다.")
        if features.ndim != 2 or features.shape[1] != 2560:
            raise InvalidFeatureFile("features shape은 [N, 2560]이어야 합니다.")
        patch_count = features.shape[0]
        if patch_count < 1 or patch_count > self.max_patches:
            raise InvalidFeatureFile(f"patch 수는 1~{self.max_patches}개여야 합니다.")
        if not features.is_floating_point() or not torch.isfinite(features).all().item():
            raise InvalidFeatureFile("features는 유한한 실수 tensor여야 합니다.")

        batch = features.float().unsqueeze(0).to(self.device)
        with torch.inference_mode():
            output = self.model(batch)
            logits = output.get("logits") if isinstance(output, dict) else None
            if not isinstance(logits, torch.Tensor) or tuple(logits.shape) != (1, 3):
                raise RuntimeError("모델 출력 logits shape이 [1, 3]이 아닙니다.")
            probabilities = torch.softmax(logits, dim=1).squeeze(0).cpu()

        predicted_class = int(probabilities.argmax().item())
        range_code, range_label = TPS_RANGES[predicted_class]
        probability_values = [float(value) for value in probabilities.tolist()]
        if not all(math.isfinite(value) for value in probability_values):
            raise RuntimeError("모델 확률 출력에 유효하지 않은 값이 있습니다.")

        return {
            "main_index": data.get("main_index"),
            "pdl1_image_id": data.get("pdl1_image_id"),
            "patch_count": patch_count,
            "predicted_class": predicted_class,
            "predicted_tps_range": range_code,
            "predicted_tps_range_label": range_label,
            "confidence": probability_values[predicted_class],
            "probabilities": {
                "class_0": probability_values[0],
                "class_1": probability_values[1],
                "class_2": probability_values[2],
            },
        }
