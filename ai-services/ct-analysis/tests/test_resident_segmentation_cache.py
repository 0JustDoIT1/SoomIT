import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


class FakeDevice:
    def __init__(self, name):
        self.type = name


fake_torch = SimpleNamespace(
    device=FakeDevice,
    cuda=SimpleNamespace(is_available=lambda: False, empty_cache=lambda: None),
)
module_path = Path(__file__).resolve().parents[1] / "phase1_models.py"
spec = importlib.util.spec_from_file_location("ct_phase1_models_cache_test", module_path)
phase1_models = importlib.util.module_from_spec(spec)
assert spec.loader is not None
previous_torch = sys.modules.get("torch")
sys.modules["torch"] = fake_torch
try:
    spec.loader.exec_module(phase1_models)
finally:
    if previous_torch is None:
        sys.modules.pop("torch", None)
    else:
        sys.modules["torch"] = previous_torch

ResidentSegmentationModel = phase1_models.ResidentSegmentationModel


class FakeInferer:
    def __init__(self):
        self.clear_count = 0
        self.model = SimpleNamespace(to=lambda _device: None)

    def clear_cache(self):
        self.clear_count += 1


def build_resident(run_inference):
    resident = object.__new__(ResidentSegmentationModel)
    resident.model = SimpleNamespace(inferer=FakeInferer())
    resident.inference = SimpleNamespace(run_inference=run_inference)
    resident.device = FakeDevice("cpu")
    resident.keep_on_gpu = False
    return resident


def test_resident_segmentation_clears_request_state_before_and_after_run():
    calls = []
    resident = build_resident(lambda **kwargs: calls.append(kwargs) or {"ok": True})

    result = resident.run(Path("ct.nii.gz"), Path("seg.nii.gz"), Path("metadata.json"))

    assert result == {"ok": True}
    assert resident.model.inferer.clear_count == 2
    assert calls[0]["model"] is resident.model


def test_resident_segmentation_clears_request_state_after_failure():
    def fail(**_kwargs):
        raise RuntimeError("inference failed")

    resident = build_resident(fail)

    with pytest.raises(RuntimeError, match="inference failed"):
        resident.run(Path("ct.nii.gz"), Path("seg.nii.gz"), Path("metadata.json"))

    assert resident.model.inferer.clear_count == 2
