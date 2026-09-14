import numpy as np
from scipy import ndimage
import torch
import torch.nn.functional as F


def get_mask_center(mask):
    mask = np.asarray(mask)

    if mask.ndim != 3:
        raise ValueError(
            f"mask must be 3D [Z,Y,X], got {mask.shape}"
        )

    coords = np.argwhere(mask > 0)

    if len(coords) == 0:
        raise ValueError("mask contains no foreground voxels")

    return coords.mean(axis=0)


def extract_voxel_patch(
    volume,
    center_zyx,
    patch_size=(64, 64, 64),
    pad_value=0,
):
    volume = np.asarray(volume)

    if volume.ndim != 3:
        raise ValueError(
            f"volume must be 3D [Z,Y,X], got {volume.shape}"
        )

    patch_size = np.asarray(
        patch_size,
        dtype=int,
    )

    center = np.round(
        center_zyx
    ).astype(int)

    start = center - patch_size // 2
    end = start + patch_size

    src_start = np.maximum(
        start,
        0,
    )

    src_end = np.minimum(
        end,
        np.asarray(volume.shape),
    )

    dst_start = src_start - start
    dst_end = dst_start + (
        src_end - src_start
    )

    patch = np.full(
        tuple(patch_size),
        pad_value,
        dtype=volume.dtype,
    )

    patch[
        dst_start[0]:dst_end[0],
        dst_start[1]:dst_end[1],
        dst_start[2]:dst_end[2],
    ] = volume[
        src_start[0]:src_end[0],
        src_start[1]:src_end[1],
        src_start[2]:src_end[2],
    ]

    return patch


def resample_to_isotropic(
    volume,
    spacing_zyx,
    target_spacing=None,
    order=1,
):
    volume = np.asarray(volume)

    spacing = np.asarray(
        spacing_zyx,
        dtype=np.float64,
    )

    if spacing.shape != (3,):
        raise ValueError(
            "spacing_zyx must contain [z,y,x]"
        )

    if np.any(spacing <= 0):
        raise ValueError(
            f"invalid spacing: {spacing}"
        )

    if target_spacing is None:
        target_spacing = float(
            np.min(spacing)
        )

    zoom = spacing / float(
        target_spacing
    )

    resampled = ndimage.zoom(
        volume,
        zoom=zoom,
        order=order,
    )

    return (
        resampled,
        float(target_spacing),
        zoom,
    )


def normalize_cir_ct(
    volume,
    z_pad=32,
    pad_value=-2000.0,
):
    volume = np.asarray(
        volume,
        dtype=np.float32,
    )

    padded = np.pad(
        volume,
        (
            (z_pad, z_pad),
            (0, 0),
            (0, 0),
        ),
        mode="constant",
        constant_values=pad_value,
    )

    low = float(
        np.percentile(
            padded,
            0.1,
        )
    )

    high = float(
        np.percentile(
            padded,
            99.8,
        )
    )

    clipped = np.clip(
        padded,
        low,
        high,
    ).astype(
        np.float32
    )

    mean = float(
        clipped.mean()
    )

    std = float(
        clipped.std(
            ddof=1
        )
    )

    if std <= 0:
        raise ValueError(
            f"invalid CT std: {std}"
        )

    normalized = (
        clipped - mean
    ) / std

    return {
        "volume": normalized.astype(
            np.float32
        ),
        "clip_low": low,
        "clip_high": high,
        "mean": mean,
        "std": std,
        "z_pad": int(z_pad),
        "pad_value": float(pad_value),
    }

def make_morphology_patch(
    ct,
    mask,
    spacing_zyx,
    patch_size=(64, 64, 64),
):
    ct = np.asarray(
        ct,
        dtype=np.float32,
    )

    mask = np.asarray(mask)

    if ct.shape != mask.shape:
        raise ValueError(
            f"CT/mask shape mismatch: "
            f"{ct.shape} vs {mask.shape}"
        )

    ct_iso, iso_spacing, zoom = (
        resample_to_isotropic(
            ct,
            spacing_zyx,
            order=1,
        )
    )

    mask_iso, _, _ = (
        resample_to_isotropic(
            mask.astype(
                np.float32
            ),
            spacing_zyx,
            target_spacing=iso_spacing,
            order=0,
        )
    )

    mask_iso = (
        mask_iso > 0.5
    ).astype(
        np.float32
    )

    norm = normalize_cir_ct(
        ct_iso,
        z_pad=32,
        pad_value=-2000.0,
    )

    ct_iso_norm = norm[
        "volume"
    ]

    mask_iso = np.pad(
        mask_iso,
        (
            (32, 32),
            (0, 0),
            (0, 0),
        ),
        mode="constant",
        constant_values=0,
    )

    center = get_mask_center(
        mask_iso
    )

    ct_patch = extract_voxel_patch(
        ct_iso_norm,
        center,
        patch_size=patch_size,
        pad_value=0.0,
    ).astype(
        np.float32
    )

    mask_patch = extract_voxel_patch(
        mask_iso,
        center,
        patch_size=patch_size,
        pad_value=0.0,
    ).astype(
        np.float32
    )

    return {
        "center_zyx": center.tolist(),
        "ct_patch": ct_patch,
        "mask_patch": mask_patch,
        "isotropic_spacing_mm": float(
            iso_spacing
        ),
        "resample_zoom_zyx": [
            float(x)
            for x in zoom
        ],
        "clip_low": norm[
            "clip_low"
        ],
        "clip_high": norm[
            "clip_high"
        ],
        "normalization_mean": norm[
            "mean"
        ],
        "normalization_std": norm[
            "std"
        ],
        "z_padding_voxels": int(
            norm["z_pad"]
        ),
        "padding_hu": float(
            norm["pad_value"]
        ),
    }


def make_malignancy_patch(
    ct,
    mask,
    spacing_zyx,
    cube_mm=50.0,
    output_size=(64, 64, 64),
):
    ct = np.asarray(
        ct,
        dtype=np.float32,
    )

    spacing = np.asarray(
        spacing_zyx,
        dtype=np.float32,
    )

    if spacing.shape != (3,):
        raise ValueError(
            "spacing_zyx must contain [z,y,x]"
        )

    if np.any(spacing <= 0):
        raise ValueError(
            f"invalid spacing: {spacing}"
        )

    center = get_mask_center(mask)

    crop_voxels = np.maximum(
        np.round(
            cube_mm / spacing
        ).astype(int),
        1,
    )

    ct_cube = extract_voxel_patch(
        ct,
        center,
        patch_size=tuple(crop_voxels),
        pad_value=-1000.0,
    )

    x = torch.from_numpy(
        ct_cube
    ).float()[None, None]

    x = F.interpolate(
        x,
        size=output_size,
        mode="trilinear",
        align_corners=False,
    )

    patch = (
        x[0, 0]
        .cpu()
        .numpy()
        .astype(np.float32)
    )

    patch = np.clip(
        patch,
        -1000.0,
        400.0,
    )

    patch = (
        patch + 1000.0
    ) / 1400.0

    return {
        "center_zyx": center.tolist(),
        "cube_mm": float(cube_mm),
        "spacing_zyx": spacing.tolist(),
        "source_crop_shape": crop_voxels.tolist(),
        "ct_patch": patch.astype(
            np.float32
        ),
    }


def split_nodule_components(mask):
    mask = np.asarray(mask)

    if mask.ndim != 3:
        raise ValueError(
            f"mask must be 3D, got {mask.shape}"
        )

    binary = mask > 0

    structure = ndimage.generate_binary_structure(
        rank=3,
        connectivity=3,
    )

    labeled, count = ndimage.label(
        binary,
        structure=structure,
    )

    components = []

    for label_id in range(
        1,
        count + 1,
    ):
        component = (
            labeled == label_id
        ).astype(np.uint8)

        voxel_count = int(
            component.sum()
        )

        if voxel_count == 0:
            continue

        components.append({
            "nodule_id":
                f"N{len(components)+1:03d}",
            "mask": component,
            "voxel_count":
                voxel_count,
            "center_zyx":
                get_mask_center(
                    component
                ).tolist(),
        })

    components.sort(
        key=lambda x: x["voxel_count"],
        reverse=True,
    )

    for idx, component in enumerate(
        components,
        start=1,
    ):
        component["nodule_id"] = (
            f"N{idx:03d}"
        )

    return components


def filter_components_by_equivalent_diameter(
    components,
    spacing_zyx,
    min_diameter_mm=3.0,
):
    spacing = np.asarray(
        spacing_zyx,
        dtype=np.float64,
    )

    if spacing.shape != (3,):
        raise ValueError(
            "spacing_zyx must be [z,y,x]"
        )

    voxel_volume_mm3 = float(
        np.prod(spacing)
    )

    kept = []
    rejected = []

    for component in components:
        voxel_count = int(
            component["voxel_count"]
        )

        volume_mm3 = (
            voxel_count
            * voxel_volume_mm3
        )

        equivalent_diameter_mm = (
            (
                6.0
                * volume_mm3
                / np.pi
            )
            ** (1.0 / 3.0)
        )

        enriched = dict(
            component
        )

        enriched[
            "volume_mm3"
        ] = float(
            volume_mm3
        )

        enriched[
            "equivalent_diameter_mm"
        ] = float(
            equivalent_diameter_mm
        )

        if (
            equivalent_diameter_mm
            >= min_diameter_mm
        ):
            kept.append(
                enriched
            )
        else:
            rejected.append(
                enriched
            )

    return {
        "kept": kept,
        "rejected": rejected,
    }

