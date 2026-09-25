import importlib.util
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


class FakeDevice:
    def __init__(self, name):
        self.type = name


class FakeNetwork:
    def __init__(self):
        self.moves = []

    def to(self, device):
        self.moves.append(device.type)


class FakePredictor:
    def __init__(self, *, device, **_kwargs):
        self.device = device
        self.network = FakeNetwork()
        self.fail = False

    def initialize_from_trained_model_folder(self, *_args, **_kwargs):
        return None

    def predict_from_files(self, *_args, **_kwargs):
        if self.fail:
            raise RuntimeError("prediction failed")


empty_cache_calls = []
fake_torch = SimpleNamespace(
    device=FakeDevice,
    cuda=SimpleNamespace(empty_cache=lambda: empty_cache_calls.append(True)),
)
fake_predict_module = ModuleType("nnunetv2.inference.predict_from_raw_data")
fake_predict_module.nnUNetPredictor = FakePredictor
fake_inference_module = ModuleType("nnunetv2.inference")
fake_nnunet_module = ModuleType("nnunetv2")

module_path = Path(__file__).resolve().parent / "nnunet_runtime.py"
spec = importlib.util.spec_from_file_location("tnm_nnunet_runtime_test", module_path)
runtime = importlib.util.module_from_spec(spec)
assert spec.loader is not None
module_names = {
    "torch": fake_torch,
    "nnunetv2": fake_nnunet_module,
    "nnunetv2.inference": fake_inference_module,
    "nnunetv2.inference.predict_from_raw_data": fake_predict_module,
}
previous = {name: sys.modules.get(name) for name in module_names}
sys.modules.update(module_names)
try:
    spec.loader.exec_module(runtime)
finally:
    for name, old_module in previous.items():
        if old_module is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = old_module


def test_offloads_model_even_when_prediction_fails(tmp_path):
    empty_cache_calls.clear()
    predictor = runtime.ResidentNnUNetPredictor(
        tmp_path, "checkpoint.pth", offload_after_predict=True
    )
    predictor.predictor.fail = True

    with pytest.raises(RuntimeError, match="prediction failed"):
        predictor.predict(tmp_path / "input", tmp_path / "output")

    assert predictor.predictor.device.type == "cpu"
    assert predictor.predictor.network.moves == ["cpu"]
    assert empty_cache_calls == [True]


def test_keeps_model_on_gpu_when_offload_is_disabled(tmp_path):
    empty_cache_calls.clear()
    predictor = runtime.ResidentNnUNetPredictor(
        tmp_path, "checkpoint.pth", offload_after_predict=False
    )

    predictor.predict(tmp_path / "input", tmp_path / "output")

    assert predictor.predictor.device.type == "cuda"
    assert predictor.predictor.network.moves == []
    assert empty_cache_calls == []
