import importlib.util
from pathlib import Path


ORCHESTRATOR = (
    Path(__file__).resolve().parents[1]
    / "packages/final_ct_analysis_deploy_ready/code/orchestrator.py"
)
spec = importlib.util.spec_from_file_location("ct_resident_segmentation", ORCHESTRATOR)
orchestrator = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(orchestrator)


class FakeResidentModel:
    def __init__(self):
        self.calls = []

    def run(self, **kwargs):
        self.calls.append(kwargs)
        return {"model": "VISTA3D"}


def test_run_segmentation_uses_resident_model_without_subprocess(monkeypatch, tmp_path):
    resident = FakeResidentModel()
    monkeypatch.setattr(
        orchestrator,
        "run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("subprocess path must not run")
        ),
    )
    ct_path = tmp_path / "ct.nii.gz"
    seg_mask = tmp_path / "seg.nii.gz"
    seg_metadata = tmp_path / "metadata.json"

    result = orchestrator.run_segmentation(
        python_executable="python",
        ct_path=ct_path,
        seg_mask=seg_mask,
        seg_metadata=seg_metadata,
        segmentation_model=resident,
    )

    assert result == {"model": "VISTA3D"}
    assert resident.calls == [{
        "image_file": ct_path,
        "output_mask": seg_mask,
        "output_metadata": seg_metadata,
    }]


def test_run_segmentation_preserves_subprocess_fallback(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(orchestrator, "run", lambda command, env=None: calls.append(command))
    ct_path = tmp_path / "ct.nii.gz"
    seg_mask = tmp_path / "seg.nii.gz"
    seg_metadata = tmp_path / "metadata.json"

    result = orchestrator.run_segmentation(
        python_executable="python",
        ct_path=ct_path,
        seg_mask=seg_mask,
        seg_metadata=seg_metadata,
    )

    assert result is None
    assert calls == [[
        "python",
        orchestrator.SEG_ROOT / "code/inference.py",
        "--input",
        ct_path,
        "--output",
        seg_mask,
        "--metadata",
        seg_metadata,
    ]]
