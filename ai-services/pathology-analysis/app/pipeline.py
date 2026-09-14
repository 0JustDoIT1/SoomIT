from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import torch

from .models import load_clam
from .wsi import Uni2hEmbedder


TISSUE_LABELS = ("Benign", "LUAD", "LUSC")
GENE_NAMES = ("EGFR", "KRAS", "BRAF", "MET", "ERBB2", "TP53", "STK11", "KEAP1")
ACTIONABLE_GENES = {"EGFR", "KRAS", "BRAF", "MET", "ERBB2"}
LOW_SAMPLE_GENES = {"MET", "ERBB2"}


class PathologyPipeline:
    def __init__(
        self,
        *,
        tissue_checkpoint: Path,
        gene_checkpoint: Path,
        device: torch.device,
        batch_size: int,
        tissue_confidence_threshold: float,
    ) -> None:
        self.device = device
        self.embedder = Uni2hEmbedder(device, batch_size)
        self.tissue_model = load_clam(str(tissue_checkpoint), num_classes=3, device=device)
        self.gene_model = load_clam(str(gene_checkpoint), num_classes=8, device=device)
        self.tissue_confidence_threshold = tissue_confidence_threshold
        self.lock = threading.Lock()

    @staticmethod
    def _gene_confidence(gene: str, probability: float) -> str:
        if gene in LOW_SAMPLE_GENES:
            return "LOW"
        return "HIGH" if abs(probability - 0.5) >= 0.15 else "LOW"

    @torch.inference_mode()
    def predict_embedding(self, embedding: torch.Tensor) -> tuple[dict[str, Any], dict[str, Any]]:
        if embedding.ndim != 2 or embedding.shape[1] != 1536 or embedding.shape[0] < 1:
            raise ValueError("UNI2-h embedding must have shape [N, 1536]")
        bag = embedding.float().to(self.device)
        tissue_logits, _ = self.tissue_model(bag)
        probabilities = torch.softmax(tissue_logits, dim=0).cpu()
        predicted_class = int(probabilities.argmax())
        confidence = float(probabilities[predicted_class])
        tissue = {
            "model": "CLAM",
            "predicted_class": predicted_class,
            "predicted_label": TISSUE_LABELS[predicted_class],
            "confidence_score": confidence,
            "confidence_level": "HIGH" if confidence >= self.tissue_confidence_threshold else "LOW",
            "probabilities": {
                label: float(probabilities[index])
                for index, label in enumerate(TISSUE_LABELS)
            },
        }
        if tissue["predicted_label"] != "LUAD":
            return tissue, {
                "status": "NOT_APPLICABLE_NON_LUAD",
                "model": "CLAM",
                "scope": "LUAD_ONLY",
                "predictions": None,
            }
        gene_logits, _ = self.gene_model(bag)
        gene_probabilities = torch.sigmoid(gene_logits).cpu()
        predictions = {}
        for gene, raw_probability in zip(GENE_NAMES, gene_probabilities, strict=True):
            probability = float(raw_probability)
            predictions[gene] = {
                "probability": probability,
                "category": "actionable" if gene in ACTIONABLE_GENES else "prognostic_reference",
                "confidence_level": self._gene_confidence(gene, probability),
            }
        return tissue, {
            "status": (
                "SUCCEEDED"
                if confidence >= self.tissue_confidence_threshold
                else "REVIEW_REQUIRED_TISSUE_UNCERTAIN"
            ),
            "model": "CLAM",
            "scope": "LUAD_ONLY",
            "predictions": predictions,
        }

    def predict_wsi(self, slide_path: Path, **embedding_options: Any) -> dict[str, Any]:
        with self.lock:
            embedding, _, level = self.embedder.embed(slide_path, **embedding_options)
            tissue, gene = self.predict_embedding(embedding)
        return {
            "embedding": {
                "backbone": "UNI2-h",
                "dimension": 1536,
                "patch_count": int(embedding.shape[0]),
                "slide_level": level,
            },
            "tissue": tissue,
            "gene": gene,
        }
