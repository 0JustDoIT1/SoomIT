from __future__ import annotations

from typing import Any

import torch
from torch import nn


class CLAM(nn.Module):
    def __init__(
        self,
        input_dim: int = 1536,
        hidden_dim: int = 512,
        num_classes: int = 2,
        dropout: float = 0.25,
    ) -> None:
        super().__init__()
        self.patch_proj = nn.Sequential(
            nn.Linear(input_dim, hidden_dim), nn.ReLU(), nn.Dropout(dropout)
        )
        self.attention_a = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2), nn.Tanh()
        )
        self.attention_b = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2), nn.Sigmoid()
        )
        self.attention_c = nn.Linear(hidden_dim // 2, 1)
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, num_classes),
        )

    def forward(self, bag: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        x = self.patch_proj(bag)
        attention = self.attention_c(self.attention_a(x) * self.attention_b(x))
        attention = torch.softmax(attention, dim=0)
        slide = torch.sum(attention * x, dim=0, keepdim=True)
        return self.classifier(slide).squeeze(0), attention.squeeze(-1)


def unwrap_state_dict(checkpoint: Any) -> dict[str, torch.Tensor]:
    if isinstance(checkpoint, dict):
        for key in ("model_state_dict", "state_dict", "model"):
            nested = checkpoint.get(key)
            if isinstance(nested, dict):
                checkpoint = nested
                break
    if not isinstance(checkpoint, dict) or not checkpoint:
        raise RuntimeError("checkpoint does not contain a state dict")
    if all(str(key).startswith("module.") for key in checkpoint):
        checkpoint = {
            str(key).removeprefix("module."): value
            for key, value in checkpoint.items()
        }
    return checkpoint


def load_clam(
    checkpoint_path: str,
    *,
    num_classes: int,
    device: torch.device,
) -> CLAM:
    model = CLAM(input_dim=1536, hidden_dim=512, num_classes=num_classes)
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    model.load_state_dict(unwrap_state_dict(checkpoint), strict=True)
    return model.to(device).eval()
