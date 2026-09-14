import base64
import binascii
import tempfile
import threading
from pathlib import Path

import torch

from .predictor import InvalidFeatureFile, PDL1Predictor
from .storage import download_gcs_file
from .virchow2 import extract_virchow2_features, load_virchow2
from .wsi_patch_extraction import prepare_wsi, read_patch


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
        try:
            annotation = base64.b64decode(annotation_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise InvalidPipelineInput("annotation_base64 is not valid base64") from exc
        if not annotation:
            raise InvalidPipelineInput("annotation file is empty")

        with tempfile.TemporaryDirectory(prefix="pdl1-") as tmp:
            tmp_path = Path(tmp)
            wsi_path = tmp_path / "slide.svs"
            annotation_path = tmp_path / "slide.annotations"
            annotation_path.write_bytes(annotation)
            download_gcs_file(wsi_gcs_uri, wsi_path)

            with self._lock:
                prep = prepare_wsi(wsi_path, annotation_path, roi_layer)
                slide = prep["slide"]
                coords = prep["coords"]
                if not coords:
                    slide.close()
                    raise InvalidPipelineInput("ROI did not produce any patch coordinates")

                embeddings = []
                try:
                    for start in range(0, len(coords), self.batch_size):
                        patches = [
                            read_patch(slide, x, y, prep["source_patch_px"])
                            for x, y in coords[start : start + self.batch_size]
                        ]
                        embeddings.append(
                            extract_virchow2_features(
                                patches,
                                self.virchow2,
                                self.transform,
                                self.device,
                            )
                        )
                finally:
                    slide.close()

                features = torch.cat(embeddings, dim=0)
                result = self.predictor.predict_features(
                    features,
                    main_index=main_index,
                    pdl1_image_id=pdl1_image_id,
                )

        result["preprocessing"] = {
            "roi_layer": roi_layer,
            "mpp": prep["mpp"],
            "target_mpp": 0.5,
            "source_patch_px": prep["source_patch_px"],
            "output_patch_size": 224,
            "stride": prep["final_stride"],
            "raw_patch_count": prep["raw_patch_count"],
        }
        return result
