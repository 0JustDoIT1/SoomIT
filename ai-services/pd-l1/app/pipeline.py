import base64
import binascii
import logging
import tempfile
import threading
import time
from pathlib import Path

import torch

from .predictor import PDL1Predictor
from .storage import download_gcs_file, upload_wsi_preview
from .virchow2 import extract_virchow2_features, load_virchow2
from .wsi_patch_extraction import create_preview, prepare_wsi, read_patch


logger = logging.getLogger("uvicorn.error")


def log_latency(stage: str, started: float) -> None:
    logger.info(
        "latency service=pdl1 stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


class InvalidPipelineInput(ValueError):
    pass


class PDL1Pipeline:
    def __init__(self, predictor: PDL1Predictor, *, batch_size: int = 64) -> None:
        self.predictor = predictor
        self.batch_size = batch_size
        self.virchow2, self.transform, self.device = load_virchow2(predictor.device)
        self._lock = threading.Lock()

    def predict(
        self,
        *,
        wsi_gcs_uri: str,
        annotation_base64: str,
        roi_layer: str,
        main_index: str | int | None,
        pdl1_image_id: str | int | None,
    ) -> dict:
        total_started = time.perf_counter()
        try:
            annotation = base64.b64decode(annotation_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise InvalidPipelineInput("annotation_base64 is not valid base64") from exc
        if not annotation:
            raise InvalidPipelineInput("annotation file is empty")

        preview_uri = None
        with tempfile.TemporaryDirectory(prefix="pdl1-") as tmp:
            tmp_path = Path(tmp)
            wsi_path = tmp_path / "slide.svs"
            annotation_path = tmp_path / "slide.annotations"
            annotation_path.write_bytes(annotation)
            stage_started = time.perf_counter()
            download_gcs_file(wsi_gcs_uri, wsi_path)
            log_latency("download", stage_started)

            stage_started = time.perf_counter()
            try:
                preview_uri = upload_wsi_preview(
                    wsi_uri=wsi_gcs_uri,
                    content=create_preview(wsi_path),
                )
            except Exception:
                preview_uri = None
            log_latency("preview", stage_started)

            wait_started = time.perf_counter()
            with self._lock:
                log_latency("inference_lock_wait", wait_started)
                stage_started = time.perf_counter()
                prep = prepare_wsi(wsi_path, annotation_path, roi_layer)
                log_latency("wsi_open_and_patch_selection", stage_started)
                slide = prep["slide"]
                coords = prep["coords"]
                if not coords:
                    slide.close()
                    raise InvalidPipelineInput("ROI did not produce any patch coordinates")

                embeddings = []
                timings = {
                    "patch_read": 0.0,
                    "patch_transform": 0.0,
                    "embedding_transfer_and_inference": 0.0,
                }
                embedding_started = time.perf_counter()
                try:
                    for start in range(0, len(coords), self.batch_size):
                        read_started = time.perf_counter()
                        patches = [
                            read_patch(slide, x, y, prep["source_patch_px"])
                            for x, y in coords[start : start + self.batch_size]
                        ]
                        timings["patch_read"] += time.perf_counter() - read_started
                        embeddings.append(
                            extract_virchow2_features(
                                patches,
                                self.virchow2,
                                self.transform,
                                self.device,
                                timings=timings,
                            )
                        )
                finally:
                    slide.close()

                features = torch.cat(embeddings, dim=0)
                log_latency("embedding_total", embedding_started)
                for stage, elapsed in timings.items():
                    logger.info(
                        "latency service=pdl1 stage=%s elapsed_seconds=%.3f",
                        stage,
                        elapsed,
                    )
                logger.info(
                    "latency service=pdl1 stage=patch_count value=%d batch_size=%d device=%s",
                    len(coords),
                    self.batch_size,
                    self.device,
                )
                stage_started = time.perf_counter()
                result = self.predictor.predict_features(
                    features,
                    main_index=main_index,
                    pdl1_image_id=pdl1_image_id,
                )
                log_latency("amd_mil_prediction", stage_started)

        result["preprocessing"] = {
            "roi_layer": roi_layer,
            "mpp": prep["mpp"],
            "target_mpp": 0.5,
            "source_patch_px": prep["source_patch_px"],
            "output_patch_size": 224,
            "stride": prep["final_stride"],
            "raw_patch_count": prep["raw_patch_count"],
        }
        result["preview"] = {"gcs_uri": preview_uri} if preview_uri else None
        log_latency("total", total_started)
        return result
