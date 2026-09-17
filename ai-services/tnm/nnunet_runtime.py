from __future__ import annotations

from pathlib import Path

import torch
from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor


class ResidentNnUNetPredictor:
    """Initialize nnU-Net once while preserving the CLI inference settings."""

    def __init__(self, model_folder: Path, checkpoint_name: str, *, offload_after_predict=False):
        self.cuda_device = torch.device("cuda")
        self.offload_after_predict = offload_after_predict
        self.predictor = nnUNetPredictor(
            tile_step_size=0.5,
            use_gaussian=True,
            use_mirroring=False,
            perform_everything_on_device=True,
            device=self.cuda_device,
            verbose=False,
            verbose_preprocessing=False,
            allow_tqdm=False,
        )
        self.predictor.initialize_from_trained_model_folder(
            str(model_folder),
            use_folds=(0,),
            checkpoint_name=checkpoint_name,
        )

    def _move_to(self, device: torch.device) -> None:
        self.predictor.network.to(device)
        self.predictor.device = device

    def predict(self, input_dir: Path, output_dir: Path) -> None:
        if self.predictor.device.type != "cuda":
            self._move_to(self.cuda_device)
        self.predictor.predict_from_files(
            str(input_dir),
            str(output_dir),
            save_probabilities=False,
            overwrite=True,
            num_processes_preprocessing=1,
            num_processes_segmentation_export=1,
            folder_with_segs_from_prev_stage=None,
            num_parts=1,
            part_id=0,
        )
        if self.offload_after_predict:
            self._move_to(torch.device("cpu"))
            torch.cuda.empty_cache()
