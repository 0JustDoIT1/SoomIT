from pathlib import Path

import nibabel as nib
import numpy as np
import torch


INTERNAL_TARGET_LABEL = 23
OUTPUT_TARGET_LABEL = 1


def tensor_to_numpy(pred):
    if isinstance(pred, torch.Tensor):
        pred = pred.detach().cpu().numpy()

    pred = np.asarray(pred)

    if pred.ndim == 4:
        if pred.shape[0] != 1:
            raise RuntimeError(
                f"Unexpected prediction shape: {pred.shape}"
            )
        pred = pred[0]

    if pred.ndim != 3:
        raise RuntimeError(
            f"Expected 3D prediction, got {pred.shape}"
        )

    return pred


def to_binary_nodule_mask(pred):
    pred = tensor_to_numpy(pred)

    return (
        pred == INTERNAL_TARGET_LABEL
    ).astype(np.uint8)


def save_binary_mask(
    mask,
    output_file,
    reference_affine,
    reference_header=None,
):
    output_file = Path(output_file)
    output_file.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if reference_header is not None:
        header = reference_header.copy()
        header.set_data_dtype(np.uint8)
    else:
        header = None

    out_img = nib.Nifti1Image(
        mask.astype(np.uint8),
        affine=reference_affine,
        header=header,
    )

    nib.save(
        out_img,
        str(output_file),
    )

    return output_file

