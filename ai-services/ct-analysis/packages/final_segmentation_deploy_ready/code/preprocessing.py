from pathlib import Path

import nibabel as nib
import numpy as np


def inspect_input_ct(image_file):
    image_file = Path(image_file)

    if not image_file.exists():
        raise FileNotFoundError(image_file)

    img = nib.load(str(image_file))

    affine = np.asarray(
        img.affine,
        dtype=np.float64,
    )

    spacing = tuple(
        float(x)
        for x in nib.affines.voxel_sizes(affine)
    )

    return {
        "path": str(image_file),
        "shape_xyz": tuple(int(x) for x in img.shape),
        "spacing_xyz_mm": spacing,
        "affine": affine,
        "header": img.header.copy(),
    }

