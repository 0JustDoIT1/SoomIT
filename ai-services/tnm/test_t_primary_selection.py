import sys
import types
from pathlib import Path

import nibabel as nib
import numpy as np


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
runtime = types.ModuleType("nnunet_runtime")
runtime.ResidentNnUNetPredictor = object
sys.modules["nnunet_runtime"] = runtime
import t_server  # noqa: E402


def write_mask(path, points):
    data = np.zeros((8, 8, 8), dtype=np.uint8)
    for point in points:
        data[point] = 1
    nib.save(nib.Nifti1Image(data, np.eye(4)), str(path))


def test_prefers_overlap_then_centroid_then_component_id(tmp_path):
    prediction = tmp_path / "prediction.nii.gz"
    target = tmp_path / "target.nii.gz"
    write_mask(prediction, [(1, 1, 1), (1, 1, 2), (5, 5, 5)])
    write_mask(target, [(5, 5, 5)])
    labels, _, candidates = t_server.component_candidates(prediction)

    component_id, details = t_server.select_primary_component(
        prediction, labels, candidates,
        {"target_centroid_xyz": [5, 5, 5]}, target,
    )
    assert component_id == 2
    assert details["overlap_iou"] > 0

    empty_target = tmp_path / "empty-target.nii.gz"
    write_mask(empty_target, [])
    component_id, _ = t_server.select_primary_component(
        prediction, labels, candidates,
        {"target_centroid_xyz": [5, 5, 5]}, empty_target,
    )
    assert component_id == 2


def test_uses_component_id_as_final_tie_breaker(tmp_path):
    prediction = tmp_path / "prediction.nii.gz"
    write_mask(prediction, [(1, 1, 1), (5, 5, 5)])
    labels, _, candidates = t_server.component_candidates(prediction)

    component_id, _ = t_server.select_primary_component(
        prediction, labels, candidates, {}, None,
    )
    assert component_id == 1


def test_keeps_the_only_prediction_component(tmp_path):
    prediction = tmp_path / "prediction.nii.gz"
    write_mask(prediction, [(3, 3, 3)])
    labels, _, candidates = t_server.component_candidates(prediction)

    component_id, _ = t_server.select_primary_component(
        prediction, labels, candidates, {"target_centroid_xyz": [3, 3, 3]}, None,
    )
    assert component_id == 1
