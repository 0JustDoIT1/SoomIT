import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from visualization import ANATOMY_LAYERS, LOBE_LAYERS, generate_visualization


def _save_mask(path, region):
    data = np.zeros((12, 12, 12), dtype=np.uint8)
    data[region] = 1
    path.parent.mkdir(parents=True, exist_ok=True)
    nib.save(nib.Nifti1Image(data, np.eye(4)), str(path))


def test_generate_visualization_writes_independent_glb_layers(tmp_path):
    segmentation = tmp_path / "seg.nii.gz"
    data = np.zeros((12, 12, 12), dtype=np.uint8)
    data[1:3, 1:3, 1:3] = 1
    data[7:11, 7:11, 7:11] = 1
    nib.save(nib.Nifti1Image(data, np.eye(4)), str(segmentation))

    lobe_dir = tmp_path / "lobes"
    for _, _, filename, _ in LOBE_LAYERS:
        _save_mask(lobe_dir / filename, np.s_[2:9, 2:9, 2:9])
    canonical_dir = tmp_path / "canonical"
    for _, _, filename, _ in ANATOMY_LAYERS:
        _save_mask(canonical_dir / filename, np.s_[3:8, 3:8, 3:8])

    output = tmp_path / "visualization"
    manifest = generate_visualization(
        segmentation_path=segmentation,
        lobe_dir=lobe_dir,
        canonical_dir=canonical_dir,
        output_dir=output,
        case_id="CASE001",
    )

    # The 3 mm filter removes the smaller component and preserves stable N IDs.
    assert [layer["id"] for layer in manifest["layers"] if layer["category"] == "NODULE"] == ["N001"]
    assert {layer["category"] for layer in manifest["layers"]} == {"NODULE", "LUNG_LOBE", "ANATOMY"}
    for layer in manifest["layers"]:
        assert (output / layer["mesh_relative_path"]).is_file()
        assert layer["supported_render_modes"] == ["surface", "wireframe"]
    stored = json.loads((output / "visualization_manifest.json").read_text(encoding="utf-8"))
    assert stored == manifest
