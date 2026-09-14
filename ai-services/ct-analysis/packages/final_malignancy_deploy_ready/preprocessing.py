
import numpy as np
import torch
import torch.nn.functional as F


TARGET_MM = 50.0
TARGET_SIZE = 64

HU_MIN = -1000.0
HU_MAX = 400.0


def normalize_hu(volume):
    volume = np.clip(
        volume,
        HU_MIN,
        HU_MAX,
    )

    volume = (
        volume - HU_MIN
    ) / (
        HU_MAX - HU_MIN
    )

    return volume.astype(
        np.float32
    )


def resize_to_64(volume):
    tensor = torch.from_numpy(
        volume
    ).float()

    tensor = (
        tensor
        .unsqueeze(0)
        .unsqueeze(0)
    )

    tensor = F.interpolate(
        tensor,
        size=(64, 64, 64),
        mode="trilinear",
        align_corners=False,
    )

    return (
        tensor
        .squeeze(0)
        .squeeze(0)
        .numpy()
    )


def crop_center_physical(
    volume,
    spacing,
    target_mm=TARGET_MM,
):
    spacing = np.asarray(
        spacing,
        dtype=np.float32,
    )

    target_voxels = np.round(
        target_mm / spacing
    ).astype(int)

    target_voxels = np.maximum(
        target_voxels,
        1,
    )

    shape = np.asarray(
        volume.shape
    )

    center = shape // 2

    start = (
        center
        - target_voxels // 2
    )

    end = (
        start
        + target_voxels
    )

    pad_before = np.maximum(
        -start,
        0,
    )

    pad_after = np.maximum(
        end - shape,
        0,
    )

    start = np.maximum(
        start,
        0,
    )

    end = np.minimum(
        end,
        shape,
    )

    cropped = volume[
        start[0]:end[0],
        start[1]:end[1],
        start[2]:end[2],
    ]

    if (
        np.any(pad_before > 0)
        or np.any(pad_after > 0)
    ):
        cropped = np.pad(
            cropped,
            (
                (
                    pad_before[0],
                    pad_after[0],
                ),
                (
                    pad_before[1],
                    pad_after[1],
                ),
                (
                    pad_before[2],
                    pad_after[2],
                ),
            ),
            mode="constant",
            constant_values=HU_MIN,
        )

    return cropped


def preprocess_nodule(
    image_path,
    metadata_path,
):
    volume = np.load(
        image_path
    )

    metadata = np.load(
        metadata_path,
        allow_pickle=True,
    ).item()

    spacing = metadata[
        "spacing"
    ]

    volume = crop_center_physical(
        volume,
        spacing,
    )

    volume = resize_to_64(
        volume
    )

    volume = normalize_hu(
        volume
    )

    tensor = torch.from_numpy(
        volume
    ).float()

    tensor = (
        tensor
        .unsqueeze(0)
        .unsqueeze(0)
    )

    return tensor

