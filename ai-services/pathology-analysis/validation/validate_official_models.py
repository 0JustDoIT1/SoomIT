from __future__ import annotations

import json
import math
from pathlib import Path

import torch

from app.models import load_clam


ASSET_DIR = Path("/workspace/validation-assets")
TISSUE_LABELS = ("Benign", "LUAD", "LUSC")
GENE_NAMES = ("EGFR", "KRAS", "BRAF", "MET", "ERBB2", "TP53", "STK11", "KEAP1")


def load_features(path: Path) -> torch.Tensor:
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if isinstance(payload, dict):
        for key in ("features", "embedding", "embeddings"):
            if key in payload:
                payload = payload[key]
                break
    if not isinstance(payload, torch.Tensor):
        raise TypeError("validation sample does not contain a tensor")
    if payload.ndim == 3 and payload.shape[0] == 1:
        payload = payload.squeeze(0)
    if payload.ndim != 2 or payload.shape[1] != 1536:
        raise ValueError(f"unexpected validation shape: {tuple(payload.shape)}")
    return payload.float()


features = load_features(ASSET_DIR / "sample_uni2h.pt")
tissue = load_clam(
    str(ASSET_DIR / "clam_model_full.pt"), num_classes=3, device=torch.device("cpu")
)
gene = load_clam(
    str(ASSET_DIR / "clam_mutation_model_full.pt"),
    num_classes=8,
    device=torch.device("cpu"),
)

with torch.inference_mode():
    tissue_logits, tissue_attention = tissue(features)
    tissue_probabilities = torch.softmax(tissue_logits, dim=0)
    gene_logits, gene_attention = gene(features)
    gene_probabilities = torch.sigmoid(gene_logits)

assert tissue_probabilities.shape == (3,)
assert gene_probabilities.shape == (8,)
assert tissue_attention.shape == (features.shape[0],)
assert gene_attention.shape == (features.shape[0],)
assert math.isclose(float(tissue_probabilities.sum()), 1.0, abs_tol=1e-5)
assert torch.isfinite(tissue_probabilities).all()
assert torch.isfinite(gene_probabilities).all()

predicted_class = int(tissue_probabilities.argmax())
expected_tissue = json.loads(
    Path("/workspace/validation/tissue_clam_expected_outputs.json").read_text()
)
expected_gene = json.loads(
    Path("/workspace/validation/gene_clam_expected_outputs.json").read_text()
)
assert predicted_class == expected_tissue["predicted_class"]
for index, label in enumerate(TISSUE_LABELS):
    assert math.isclose(
        float(tissue_probabilities[index]),
        expected_tissue["probabilities"][label],
        abs_tol=1e-6,
    )
for index, name in enumerate(GENE_NAMES):
    assert math.isclose(
        float(gene_probabilities[index]),
        expected_gene["probabilities"][name],
        abs_tol=1e-6,
    )
print(
    json.dumps(
        {
            "sample_shape": list(features.shape),
            "tissue": {
                "predicted_class": predicted_class,
                "predicted_label": TISSUE_LABELS[predicted_class],
                "probabilities": {
                    label: float(tissue_probabilities[index])
                    for index, label in enumerate(TISSUE_LABELS)
                },
            },
            "gene_probabilities": {
                name: float(gene_probabilities[index])
                for index, name in enumerate(GENE_NAMES)
            },
        },
        sort_keys=True,
    )
)
