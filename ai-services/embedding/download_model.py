"""Build-time download; persist exact upstream revision for DB provenance."""
import json
import os
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download
from transformers import AutoModel, AutoTokenizer

from encoder import DIMENSIONS, MODEL_ID

target = Path("/models/e5")
revision = HfApi().model_info(MODEL_ID, revision=os.environ["MODEL_REVISION"]).sha
snapshot_download(
    MODEL_ID, revision=revision, local_dir=target,
    allow_patterns=["*.json", "*.safetensors", "*.model", "tokenizer.*", "README.md"],
)
tokenizer = AutoTokenizer.from_pretrained(target, local_files_only=True)
model = AutoModel.from_pretrained(target, local_files_only=True, use_safetensors=True)
assert model.config.hidden_size == DIMENSIONS
(target / "provenance.json").write_text(json.dumps({"model": MODEL_ID, "revision": revision}))
print(f"Validated {MODEL_ID}@{revision}: {DIMENSIONS} dimensions")
