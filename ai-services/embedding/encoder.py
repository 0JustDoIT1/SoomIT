import json
import logging
import os
import time
from pathlib import Path

MODEL_ID = "intfloat/multilingual-e5-base"
DIMENSIONS = 768
MAX_TOKENS = 512
logger = logging.getLogger("uvicorn.error")


def log_latency(stage, started):
    logger.info(
        "latency service=embedding stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


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
        total_started = time.perf_counter()
        inputs = [f"{input_type}: {text}" for text in texts]
        stage_started = time.perf_counter()
        tokens = self.tokenizer(inputs, padding=True, truncation=False, return_tensors="pt")
        log_latency("tokenization", stage_started)
        lengths = tokens["attention_mask"].sum(dim=1).tolist()
        if any(length > MAX_TOKENS for length in lengths):
            raise InputTooLong("Each input must fit 512 tokens including prefix and special tokens; split the text.")
        with self.torch.inference_mode():
            stage_started = time.perf_counter()
            hidden = self.model(**tokens).last_hidden_state
            log_latency("model_inference", stage_started)
            stage_started = time.perf_counter()
            mask = tokens["attention_mask"]
            hidden = hidden.masked_fill(~mask[..., None].bool(), 0.0)
            pooled = hidden.sum(dim=1) / mask.sum(dim=1)[..., None]
            vectors = self.torch.nn.functional.normalize(pooled, p=2, dim=1)
            log_latency("pooling_and_normalization", stage_started)
        if not self.torch.isfinite(vectors).all():
            raise RuntimeError("Non-finite embedding")
        stage_started = time.perf_counter()
        serialized_vectors = vectors.tolist()
        log_latency("serialization", stage_started)
        log_latency("total", total_started)
        return serialized_vectors, lengths
