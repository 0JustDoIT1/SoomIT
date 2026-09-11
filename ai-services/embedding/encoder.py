import json
import os
from pathlib import Path

MODEL_ID = "intfloat/multilingual-e5-base"
DIMENSIONS = 768
MAX_TOKENS = 512


class InputTooLong(ValueError):
    pass


class Encoder:
    def __init__(self):
        import torch
        from transformers import AutoModel, AutoTokenizer

        self.torch = torch
        torch.set_num_threads(int(os.environ.get("TORCH_NUM_THREADS", "2")))
        model_path = Path(os.environ.get("MODEL_PATH", "/models/e5"))
        self.revision = json.loads((model_path / "provenance.json").read_text())["revision"]
        self.tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
        self.model = AutoModel.from_pretrained(
            model_path, local_files_only=True, use_safetensors=True
        ).eval()
        if self.model.config.hidden_size != DIMENSIONS:
            raise RuntimeError("Unexpected embedding dimensions")

    def encode(self, texts, input_type):
        inputs = [f"{input_type}: {text}" for text in texts]
        tokens = self.tokenizer(inputs, padding=True, truncation=False, return_tensors="pt")
        lengths = tokens["attention_mask"].sum(dim=1).tolist()
        if any(length > MAX_TOKENS for length in lengths):
            raise InputTooLong("Each input must fit 512 tokens including prefix and special tokens; split the text.")
        with self.torch.inference_mode():
            hidden = self.model(**tokens).last_hidden_state
            mask = tokens["attention_mask"]
            hidden = hidden.masked_fill(~mask[..., None].bool(), 0.0)
            pooled = hidden.sum(dim=1) / mask.sum(dim=1)[..., None]
            vectors = self.torch.nn.functional.normalize(pooled, p=2, dim=1)
        if not self.torch.isfinite(vectors).all():
            raise RuntimeError("Non-finite embedding")
        return vectors.tolist(), lengths
