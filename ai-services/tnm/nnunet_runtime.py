from __future__ import annotations

import logging
import time
from pathlib import Path

import torch
from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor


logger = logging.getLogger("uvicorn.error")


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
        started = time.perf_counter()
        self.predictor.network.to(device)
        self.predictor.device = device
        logger.info(
            "latency service=tnm_m stage=model_to_%s elapsed_seconds=%.3f",
            device.type,
            time.perf_counter() - started,
        )

    def predict(self, input_dir: Path, output_dir: Path) -> None:
        if self.predictor.device.type != "cuda":
            self._move_to(self.cuda_device)
        try:
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
        finally:
            if self.offload_after_predict:
                self._move_to(torch.device("cpu"))
                torch.cuda.empty_cache()
