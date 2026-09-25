from __future__ import annotations

import importlib.util
import json
import logging
import os
import sys
import time
from pathlib import Path

import torch


ROOT = Path(__file__).resolve().parent
PACKAGES = ROOT / "packages"
logger = logging.getLogger("uvicorn.error")


def _load_module(name: str, path: Path, search_path: Path | None = None, aliases=None):
    added = False
    if search_path is not None and str(search_path) not in sys.path:
        sys.path.insert(0, str(search_path))
        added = True
    previous = {}
    try:
        for alias, module in (aliases or {}).items():
            previous[alias] = sys.modules.get(alias)
            sys.modules[alias] = module
        spec = importlib.util.spec_from_file_location(name, path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"could not load inference module: {path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for alias in (aliases or {}):
            if previous[alias] is None:
                sys.modules.pop(alias, None)
            else:
                sys.modules[alias] = previous[alias]
        if added:
            sys.path.remove(str(search_path))


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


class ResidentSegmentationModel:
    """Reuse VISTA3D initialization without retaining request-specific state.

    VISTA3D's ``InferClass`` caches the transformed input and previous mask for
    interactive prompting. Those values must be cleared between patient
    requests. By default, the network is also moved back to CPU after each
    segmentation so the later TotalSegmentator and nodule-model stages keep
    the same available GPU memory as the former subprocess implementation.
    """

    def __init__(self) -> None:
        segmentation_root = PACKAGES / "final_segmentation_deploy_ready"
        code_root = segmentation_root / "code"
        postprocess_root = code_root / "postprocess"

        model_module = _load_module(
            "ct_phase1_segmentation_model", code_root / "model.py", code_root
        )
        preprocessing_module = _load_module(
            "ct_phase1_segmentation_preprocessing",
            code_root / "preprocessing.py",
            code_root,
        )
        postprocessing_module = _load_module(
            "ct_phase1_segmentation_postprocessing",
            code_root / "postprocessing.py",
            code_root,
        )
        nodule_patch_module = _load_module(
            "ct_phase1_segmentation_nodule_patch",
            postprocess_root / "nodule_patch.py",
            postprocess_root,
        )
        self.inference = _load_module(
            "ct_phase1_segmentation_inference",
            code_root / "inference.py",
            code_root,
            aliases={
                "model": model_module,
                "preprocessing": preprocessing_module,
                "postprocessing": postprocessing_module,
                "nodule_patch": nodule_patch_module,
            },
        )
        self.model = model_module.Vista3DModel()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.keep_on_gpu = (
            os.environ.get("CT_ANALYSIS_KEEP_VISTA_ON_GPU", "false").strip().lower()
            in {"1", "true", "yes", "on"}
        )
        if self.device.type == "cuda" and not self.keep_on_gpu:
            self._move_to(torch.device("cpu"))
            torch.cuda.empty_cache()

    def _move_to(self, device: torch.device) -> None:
        started = time.perf_counter()
        self.model.inferer.model.to(device)
        logger.info(
            "latency service=ct_phase1 stage=vista_model_to_%s elapsed_seconds=%.3f",
            device.type,
            time.perf_counter() - started,
        )

    def _clear_request_cache(self) -> None:
        self.model.inferer.clear_cache()

    def run(self, image_file: Path, output_mask: Path, output_metadata: Path) -> dict:
        self._clear_request_cache()
        if self.device.type == "cuda" and not self.keep_on_gpu:
            self._move_to(self.device)
        try:
            return self.inference.run_inference(
                image_file=image_file,
                output_mask=output_mask,
                output_metadata=output_metadata,
                model=self.model,
            )
        finally:
            self._clear_request_cache()
            if self.device.type == "cuda" and not self.keep_on_gpu:
                self._move_to(torch.device("cpu"))
                torch.cuda.empty_cache()


class ResidentNoduleModels:
    """Keep checkpoint-loaded CPU models and use one GPU model at a time.

    This avoids per-nodule checkpoint and process startup cost without keeping
    all three 3D networks in VRAM alongside VISTA3D/TotalSegmentator.
    """

    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        morphology_path = PACKAGES / "final_morphology_deploy_ready" / "code" / "inference.py"
        self.morphology = _load_module(
            "ct_phase1_morphology", morphology_path, morphology_path.parent
        )
        self.morphology_model, self.morphology_checkpoint = self.morphology.load_model(
            torch.device("cpu")
        )
        self.morphology_thresholds = self.morphology.load_thresholds()

        texture_path = PACKAGES / "final_texture_deploy_ready" / "code" / "inference.py"
        self.texture = _load_module("ct_phase1_texture", texture_path, texture_path.parent)
        self.texture_model = self.texture.load_model(device=torch.device("cpu"))

        malignancy_root = PACKAGES / "final_malignancy_deploy_ready"
        malignancy_model = _load_module(
            "ct_phase1_malignancy_model", malignancy_root / "model.py", malignancy_root
        )
        self.malignancy = _load_module(
            "ct_phase1_malignancy",
            malignancy_root / "inference.py",
            malignancy_root,
            aliases={"model": malignancy_model},
        )
        self.malignancy_config = self.malignancy.load_config()
        self.malignancy_threshold = float(self.malignancy_config.get("threshold", 0.5))
        self.malignancy_model, self.malignancy_checkpoint = malignancy_model.build_model(
            medicalnet_root=self.malignancy.MEDICALNET_ROOT,
            checkpoint_path=self.malignancy.CHECKPOINT_PATH,
            device=torch.device("cpu"),
        )

    def _activate(self, model):
        model.to(self.device)
        model.eval()
        return model

    def _release(self, model) -> None:
        if self.device.type == "cuda":
            model.to("cpu")
            torch.cuda.empty_cache()

    def run_morphology(self, jobs: list[dict]) -> None:
        if not jobs:
            return
        model = self._activate(self.morphology_model)
        try:
            for job in jobs:
                tensor = self.morphology.prepare_input(job["ct"], job["mask"])
                prediction = self.morphology.predict(
                    model, tensor, self.morphology_thresholds, self.device
                )
                result = {
                    "model": {
                        "name": "morphology_med3d_final",
                        "version": "1.0.0",
                        "checkpoint_epoch": int(self.morphology_checkpoint.get("epoch", -1)),
                    },
                    "input": {
                        "ct": str(Path(job["ct"])),
                        "mask": str(Path(job["mask"])),
                        "tensor_shape": list(tensor.shape),
                    },
                    "prediction": prediction,
                }
                _write_json(job["output"], result)
        finally:
            self._release(model)

    def run_texture(self, jobs: list[dict]) -> None:
        if not jobs:
            return
        model = self._activate(self.texture_model)
        try:
            for job in jobs:
                result = self.texture.predict(
                    model, job["ct"], job["mask"], device=self.device
                )
                _write_json(job["output"], result)
        finally:
            self._release(model)

    def run_malignancy(self, jobs: list[dict]) -> None:
        if not jobs:
            return
        model = self._activate(self.malignancy_model)
        try:
            for job in jobs:
                tensor, array = self.malignancy.load_preprocessed_patch(job["input"])
                prediction = self.malignancy.predict(
                    model=model,
                    tensor=tensor,
                    device=self.device,
                    threshold=self.malignancy_threshold,
                )
                result = {
                    "model": {
                        "name": self.malignancy_config.get(
                            "model_name", "Med3DResNet18Malignancy"
                        ),
                        "version": self.malignancy_config.get("model_version", "v1"),
                        "checkpoint_epoch": int(self.malignancy_checkpoint.get("epoch", -1)),
                    },
                    "input": {
                        "path": str(Path(job["input"])),
                        "shape": list(array.shape),
                        "dtype": str(array.dtype),
                        "min": float(array.min()),
                        "max": float(array.max()),
                        "preprocessed": True,
                        "preprocessing": {
                            "physical_crop_mm": 50.0,
                            "output_shape": [1, 64, 64, 64],
                            "hu_clip": [-1000.0, 400.0],
                            "normalization": "linear_0_1",
                        },
                    },
                    "prediction": prediction,
                    "device": str(self.device),
                }
                _write_json(job["output"], result)
        finally:
            self._release(model)
