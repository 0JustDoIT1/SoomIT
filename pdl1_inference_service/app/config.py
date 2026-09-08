import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    checkpoint_path: Path
    mil_baseline_path: Path
    device: str | None
    max_upload_bytes: int
    max_patches: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            checkpoint_path=Path(os.environ["PDL1_CHECKPOINT_PATH"]),
            mil_baseline_path=Path(os.environ["PDL1_MIL_BASELINE_PATH"]),
            device=os.getenv("PDL1_DEVICE") or None,
            max_upload_bytes=int(os.getenv("PDL1_MAX_UPLOAD_BYTES", str(64 * 1024 * 1024))),
            max_patches=int(os.getenv("PDL1_MAX_PATCHES", "5000")),
        )
