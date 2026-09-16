import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cornerstone_labelmap import generate_cornerstone_segmentation
from visualization import ANATOMY_LAYERS, LOBE_LAYERS


def _save_mask(path, shape, region, affine=None):
    data = np.zeros(shape, dtype=np.uint8)
    data[region] = 1
    path.parent.mkdir(parents=True, exist_ok=True)
    nib.save(nib.Nifti1Image(data, affine if affine is not None else np.eye(4)), str(path))


def _build_case(tmp_path, *, lobe_affine=None, lobe_shape=(12, 12, 12)):
    ct_path = tmp_path / "ct.nii.gz"
    nib.save(nib.Nifti1Image(np.zeros((12, 12, 12), dtype=np.int16), np.eye(4)), str(ct_path))

    segmentation = tmp_path / "seg.nii.gz"
    data = np.zeros((12, 12, 12), dtype=np.uint8)
    data[1:3, 1:3, 1:3] = 1
    data[7:11, 7:11, 7:11] = 1
    nib.save(nib.Nifti1Image(data, np.eye(4)), str(segmentation))

    lobe_dir = tmp_path / "lobes"
    for index, (_, _, filename, _) in enumerate(LOBE_LAYERS):
        region = np.s_[2:9, 2:9, 2:9] if index == 0 else np.s_[0, 0, 0]
        _save_mask(lobe_dir / filename, lobe_shape, region, lobe_affine)

    canonical_dir = tmp_path / "canonical"
    for index, (_, _, filename, _) in enumerate(ANATOMY_LAYERS):
        region = np.s_[3:8, 3:8, 3:8] if index == 0 else np.s_[0, 0, 0]
        _save_mask(canonical_dir / filename, (12, 12, 12), region)

    return ct_path, segmentation, lobe_dir, canonical_dir


def test_generate_cornerstone_segmentation_assigns_stable_segment_indices(tmp_path):
    ct_path, segmentation, lobe_dir, canonical_dir = _build_case(tmp_path)

    output = tmp_path / "cornerstone"
    manifest = generate_cornerstone_segmentation(
        segmentation_path=segmentation,
        lobe_dir=lobe_dir,
        canonical_dir=canonical_dir,
        ct_path=ct_path,
        output_dir=output,
        case_id="CASE001",
    )

    by_id = {segment["id"]: segment for segment in manifest["segments"]}
    assert by_id["N001"]["segment_index"] == 1
    assert by_id[LOBE_LAYERS[0][0]]["segment_index"] == 101
    assert by_id[ANATOMY_LAYERS[0][0]]["segment_index"] == 201
    assert manifest["scalar_type"] == "uint8"
    assert manifest["dimensions"] == [12, 12, 12]

    metadata = json.loads((output / "labelmap_metadata.json").read_text(encoding="utf-8"))
    assert metadata == {
        "schema_version": manifest["schema_version"],
        "case_id": "CASE001",
        "scalar_type": "uint8",
        "dimensions": [12, 12, 12],
        "segments": manifest["segments"],
    }
    stored_manifest = json.loads((output / "cornerstone_manifest.json").read_text(encoding="utf-8"))
    assert stored_manifest == manifest

    voxels = (output / "labelmap.bin").read_bytes()
    assert len(voxels) == 12 * 12 * 12
    values = set(voxels)
    assert 1 in values  # nodule N001 voxels present
    assert 101 in values  # LUL voxels present
    assert 201 in values  # airway voxels present


def test_generate_cornerstone_segmentation_resamples_mismatched_geometry(tmp_path):
    mismatched_affine = np.eye(4)
    mismatched_affine[:3, :3] *= 2.0  # half-resolution grid relative to the CT
    ct_path, segmentation, lobe_dir, canonical_dir = _build_case(
        tmp_path, lobe_affine=mismatched_affine, lobe_shape=(6, 6, 6),
    )

    output = tmp_path / "cornerstone"
    manifest = generate_cornerstone_segmentation(
        segmentation_path=segmentation,
        lobe_dir=lobe_dir,
        canonical_dir=canonical_dir,
        ct_path=ct_path,
        output_dir=output,
        case_id="CASE002",
    )

    dimensions = manifest["dimensions"]
    voxels = np.frombuffer((output / "labelmap.bin").read_bytes(), dtype=np.uint8).reshape(
        dimensions[2], dimensions[1], dimensions[0],
    )
    # The lobe mask was defined on a coarser grid; resampling must still land
    # its labelled region inside the CT-space volume without raising.
    assert dimensions == [12, 12, 12]
    assert 101 in voxels
