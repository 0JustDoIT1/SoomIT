import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    checkpoint_path: Path
    model_gcs_uri: str | None
    model_sha256: str
    model_revision: str
    mil_baseline_path: Path
    device: str | None
    max_upload_bytes: int
    max_patches: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            checkpoint_path=Path(os.getenv("PDL1_CHECKPOINT_PATH", "/models/final_model.pth")),
            model_gcs_uri=os.getenv("PDL1_MODEL_GCS_URI"),
            model_sha256=os.environ["PDL1_MODEL_SHA256"],
            model_revision=os.getenv("PDL1_MODEL_REVISION", "final_model"),
            mil_baseline_path=Path(os.getenv("PDL1_MIL_BASELINE_PATH", "/app/mil_baseline")),
            device=os.getenv("PDL1_DEVICE") or None,
            max_upload_bytes=int(os.getenv("PDL1_MAX_UPLOAD_BYTES", str(64 * 1024 * 1024))),
            max_patches=int(os.getenv("PDL1_MAX_PATCHES", "5000")),
        )
