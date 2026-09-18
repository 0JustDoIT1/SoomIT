import importlib.util
from pathlib import Path

import pytest


ORCHESTRATOR = (
    Path(__file__).resolve().parents[1]
    / "packages/final_ct_analysis_deploy_ready/code/orchestrator.py"
)
spec = importlib.util.spec_from_file_location("ct_primary_orchestrator", ORCHESTRATOR)
orchestrator = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(orchestrator)


def nodule(nodule_id, *, malignancy, diameter, volume, solid_diameter=None):
    morphology = {"prediction": {}}
    if solid_diameter is not None:
        morphology["prediction"]["solid_component_maximum_3d_diameter_mm"] = solid_diameter
    return {
        "nodule_id": nodule_id,
        "malignancy": {"prediction": {"malignancy_score": malignancy}},
        "morphology": morphology,
        "quantification": {
            "maximum_3d_diameter_mm": diameter,
            "equivalent_diameter_mm": diameter,
            "volume_mm3": volume,
            "centroid_voxel_xyz": [1, 2, 3],
            "bbox_voxel_xyz": [0, 1, 2, 3, 4, 5],
        },
    }


def test_selects_highest_malignancy_candidate():
    selected = orchestrator.select_target_nodule([
        nodule("N001", malignancy=20, diameter=30, volume=500),
        nodule("N002", malignancy=80, diameter=10, volume=100),
    ])
    assert selected["target_nodule_id"] == "N002"


def test_keeps_a_single_candidate_and_rejects_an_empty_candidate_list():
    assert orchestrator.select_target_nodule([
        nodule("N001", malignancy=20, diameter=30, volume=500),
    ])["target_nodule_id"] == "N001"
    with pytest.raises(RuntimeError, match="No Phase 1 nodule candidate"):
        orchestrator.select_target_nodule([])


def test_uses_diameter_then_id_when_malignancy_ties_and_solid_diameter_is_absent():
    selected = orchestrator.select_target_nodule([
        nodule("N002", malignancy=50, diameter=10, volume=300),
        nodule("N001", malignancy=50, diameter=20, volume=100),
    ])
    assert selected["target_nodule_id"] == "N001"

    selected = orchestrator.select_target_nodule([
        nodule("N002", malignancy=50, diameter=20, volume=100),
        nodule("N001", malignancy=50, diameter=20, volume=100),
    ])
    assert selected["target_nodule_id"] == "N001"
