from __future__ import annotations

import os
from pathlib import Path

from artifact import ModelArtifact


ROOT = Path(__file__).resolve().parent


def phase1_artifacts() -> list[ModelArtifact]:
    return [
        ModelArtifact(
            "vista3d",
            ROOT / "packages/final_segmentation_deploy_ready/model/vista3d_lidc_best.pt",
            os.environ.get("VISTA3D_MODEL_GCS_URI", ""),
            os.environ.get(
                "VISTA3D_MODEL_SHA256",
                "a38ff95bf4bae705de32f20d5327b42d52fffa5c84f3e57b308afc70700cbc7b",
            ),
        ),
        ModelArtifact(
            "morphology",
            ROOT / "packages/final_morphology_deploy_ready/model/morphology_med3d_final.pt",
            os.environ.get("MORPHOLOGY_MODEL_GCS_URI", ""),
            os.environ.get(
                "MORPHOLOGY_MODEL_SHA256",
                "d582c8b0be4e12ea5d7906f2ba36ff17c07429f895a8974c386458c1153fbfd7",
            ),
        ),
        ModelArtifact(
            "texture",
            ROOT / "packages/final_texture_deploy_ready/checkpoint/texture_med3d_final.pt",
            os.environ.get("TEXTURE_MODEL_GCS_URI", ""),
            os.environ.get(
                "TEXTURE_MODEL_SHA256",
                "8c1b3d875e2efc51fad4cfba2766f8d46f25f40bb61963c8a44678bcae677b08",
            ),
        ),
        ModelArtifact(
            "malignancy",
            ROOT / "packages/final_malignancy_deploy_ready/med3d_resnet18_best.pth",
            os.environ.get("MALIGNANCY_MODEL_GCS_URI", ""),
            os.environ.get(
                "MALIGNANCY_MODEL_SHA256",
                "4cf6847af46a7a82169068eecfb7f220c8799a8c0841de0d09377f9cd23272e2",
            ),
        ),
    ]
