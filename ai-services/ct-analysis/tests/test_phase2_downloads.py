from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import phase2_server


def test_download_phase1_inputs_fetches_only_required_contract_files(tmp_path, monkeypatch):
    requested = []

    def fake_download(uri, destination):
        requested.append(uri)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.touch()
        return destination

    monkeypatch.setattr(phase2_server, "download_file", fake_download)

    ct_path, phase1_dir = phase2_server.download_phase1_inputs(
        "gs://bucket/case-root/", "case-001", tmp_path / "case"
    )

    assert ct_path == tmp_path / "case/source/case-001_0000.nii.gz"
    assert phase1_dir == tmp_path / "case/phase1"
    assert requested == [
        "gs://bucket/case-root/source/case-001_0000.nii.gz",
        *[
            f"gs://bucket/case-root/phase1/anatomy/thoracic_total/{name}"
            for name in phase2_server.LOBE_MASKS
        ],
        *[
            f"gs://bucket/case-root/phase1/canonical_anatomy/{name}"
            for name in phase2_server.CANONICAL_MASKS
        ],
    ]
    assert all(Path(path).is_file() for path in [ct_path])
