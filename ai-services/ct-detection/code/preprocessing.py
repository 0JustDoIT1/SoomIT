#!/usr/bin/env python3

"""
preprocessing.py

CPMNetv2 deployment CT preprocessing.

Final detection preprocessing
-----------------------------
Input:
    CT NIfTI (.nii / .nii.gz)
    OR
    DICOM series directory

Output:
    normalized numpy volume

Shape:
    [Z, Y, X]

Target spacing:
    [1.0, 1.0, 1.0] mm

Intensity:
    HU clip [-1200, 600]
    -> scale [-1, 1]

Also preserves:
    original size
    original spacing
    original origin
    original direction
    resampled geometry

Coordinate conversion itself will be implemented
in step 22 coordinate_transform.py.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import SimpleITK as sitk


# =============================================================================
# CONFIG
# =============================================================================

TARGET_SPACING_XYZ = (
    1.0,
    1.0,
    1.0,
)

HU_MIN = -1200.0
HU_MAX = 600.0

NORMALIZED_MIN = -1.0
NORMALIZED_MAX = 1.0

RESAMPLE_DEFAULT_HU = -1200.0


# =============================================================================
# UTILITY
# =============================================================================

def normalize_case_id(
    name: str,
) -> str:

    name = str(
        name
    ).strip()

    if name.endswith(
        ".nii.gz"
    ):

        return name[:-7]

    if name.endswith(
        ".nii"
    ):

        return name[:-4]

    return name


def image_geometry(
    image: sitk.Image,
) -> Dict[str, Any]:

    size_xyz = [
        int(
            value
        )
        for value
        in image.GetSize()
    ]

    spacing_xyz = [
        float(
            value
        )
        for value
        in image.GetSpacing()
    ]

    origin_xyz = [
        float(
            value
        )
        for value
        in image.GetOrigin()
    ]

    direction = [
        float(
            value
        )
        for value
        in image.GetDirection()
    ]

    return {
        "size_xyz":
            size_xyz,

        "shape_zyx":
            [
                size_xyz[2],
                size_xyz[1],
                size_xyz[0],
            ],

        "spacing_xyz_mm":
            spacing_xyz,

        "spacing_zyx_mm":
            [
                spacing_xyz[2],
                spacing_xyz[1],
                spacing_xyz[0],
            ],

        "origin_xyz_mm":
            origin_xyz,

        "direction":
            direction,
    }


# =============================================================================
# INPUT
# =============================================================================

def load_nifti(
    path: Path,
) -> Tuple[
    sitk.Image,
    Dict[str, Any],
]:

    image = sitk.ReadImage(
        str(
            path
        ),
        sitk.sitkFloat32,
    )

    metadata = {
        "input_type":
            "NIFTI",

        "source_path":
            str(
                path
            ),

        "case_id":
            normalize_case_id(
                path.name
            ),

        "series_uid":
            None,
    }

    return (
        image,
        metadata,
    )


def load_dicom_series(
    directory: Path,
    series_uid: Optional[str] = None,
) -> Tuple[
    sitk.Image,
    Dict[str, Any],
]:

    series_ids = (
        sitk.ImageSeriesReader
        .GetGDCMSeriesIDs(
            str(
                directory
            )
        )
    )

    if not series_ids:

        raise RuntimeError(
            "DICOM Series를 찾지 못했습니다:\n"
            f"{directory}"
        )

    series_ids = list(
        series_ids
    )

    if series_uid is None:

        if len(
            series_ids
        ) != 1:

            raise RuntimeError(
                "DICOM directory에 Series가 "
                "여러 개 있습니다.\n"
                "series_uid를 명시해야 합니다.\n"
                f"Series IDs: {series_ids}"
            )

        selected_uid = (
            series_ids[0]
        )

    else:

        selected_uid = str(
            series_uid
        )

        if (
            selected_uid
            not in series_ids
        ):

            raise RuntimeError(
                "요청한 DICOM Series UID가 없습니다.\n"
                f"Requested: {selected_uid}\n"
                f"Available: {series_ids}"
            )

    filenames = (
        sitk.ImageSeriesReader
        .GetGDCMSeriesFileNames(
            str(
                directory
            ),
            selected_uid,
        )
    )

    if not filenames:

        raise RuntimeError(
            "DICOM 파일 목록을 얻지 못했습니다."
        )

    reader = (
        sitk.ImageSeriesReader()
    )

    reader.SetFileNames(
        filenames
    )

    image = reader.Execute()

    image = sitk.Cast(
        image,
        sitk.sitkFloat32,
    )

    metadata = {
        "input_type":
            "DICOM",

        "source_path":
            str(
                directory
            ),

        "case_id":
            selected_uid,

        "series_uid":
            selected_uid,

        "dicom_file_count":
            len(
                filenames
            ),
    }

    return (
        image,
        metadata,
    )


def load_ct(
    input_path: Path | str,
    series_uid: Optional[str] = None,
) -> Tuple[
    sitk.Image,
    Dict[str, Any],
]:

    path = Path(
        input_path
    )

    if not path.exists():

        raise FileNotFoundError(
            f"CT input 없음:\n{path}"
        )

    if path.is_dir():

        return load_dicom_series(
            directory=path,
            series_uid=series_uid,
        )

    lower_name = (
        path.name.lower()
    )

    if (
        lower_name.endswith(
            ".nii"
        )
        or
        lower_name.endswith(
            ".nii.gz"
        )
    ):

        return load_nifti(
            path
        )

    raise RuntimeError(
        "지원하지 않는 CT input 형식입니다.\n"
        "지원:\n"
        "  - NIfTI .nii\n"
        "  - NIfTI .nii.gz\n"
        "  - DICOM directory"
    )


# =============================================================================
# VALIDATION
# =============================================================================

def validate_ct_image(
    image: sitk.Image,
) -> None:

    if image.GetDimension() != 3:

        raise RuntimeError(
            "3D CT가 아닙니다.\n"
            f"Dimension: {image.GetDimension()}"
        )

    size = np.asarray(
        image.GetSize(),
        dtype=np.int64,
    )

    spacing = np.asarray(
        image.GetSpacing(),
        dtype=np.float64,
    )

    if np.any(
        size <= 0
    ):

        raise RuntimeError(
            f"Invalid CT size: {size.tolist()}"
        )

    if np.any(
        spacing <= 0
    ):

        raise RuntimeError(
            f"Invalid CT spacing: {spacing.tolist()}"
        )

    if not np.all(
        np.isfinite(
            spacing
        )
    ):

        raise RuntimeError(
            "CT spacing에 NaN/Inf가 있습니다."
        )


# =============================================================================
# RESAMPLING
# =============================================================================

def calculate_resampled_size(
    image: sitk.Image,
    target_spacing_xyz=TARGET_SPACING_XYZ,
):

    original_size = np.asarray(
        image.GetSize(),
        dtype=np.int64,
    )

    original_spacing = np.asarray(
        image.GetSpacing(),
        dtype=np.float64,
    )

    target_spacing = np.asarray(
        target_spacing_xyz,
        dtype=np.float64,
    )

    # physical extent between voxel centers를 최대한 보존.
    new_size = (
        np.round(
            (
                original_size
                - 1
            )
            * original_spacing
            / target_spacing
        )
        .astype(
            np.int64
        )
        + 1
    )

    new_size = np.maximum(
        new_size,
        1,
    )

    return [
        int(
            value
        )
        for value
        in new_size
    ]


def resample_ct(
    image: sitk.Image,
    target_spacing_xyz=TARGET_SPACING_XYZ,
) -> sitk.Image:

    output_size = (
        calculate_resampled_size(
            image=image,
            target_spacing_xyz=target_spacing_xyz,
        )
    )

    resampler = (
        sitk.ResampleImageFilter()
    )

    resampler.SetOutputSpacing(
        tuple(
            float(
                value
            )
            for value
            in target_spacing_xyz
        )
    )

    resampler.SetSize(
        output_size
    )

    resampler.SetOutputOrigin(
        image.GetOrigin()
    )

    resampler.SetOutputDirection(
        image.GetDirection()
    )

    resampler.SetTransform(
        sitk.Transform()
    )

    resampler.SetInterpolator(
        sitk.sitkLinear
    )

    resampler.SetDefaultPixelValue(
        float(
            RESAMPLE_DEFAULT_HU
        )
    )

    resampler.SetOutputPixelType(
        sitk.sitkFloat32
    )

    return resampler.Execute(
        image
    )


# =============================================================================
# INTENSITY
# =============================================================================

def normalize_hu(
    volume_hu: np.ndarray,
) -> np.ndarray:

    volume_hu = np.asarray(
        volume_hu,
        dtype=np.float32,
    )

    if not np.all(
        np.isfinite(
            volume_hu
        )
    ):

        raise RuntimeError(
            "CT voxel에 NaN/Inf가 있습니다."
        )

    clipped = np.clip(
        volume_hu,
        HU_MIN,
        HU_MAX,
    )

    normalized_01 = (
        clipped
        - HU_MIN
    ) / (
        HU_MAX
        - HU_MIN
    )

    normalized = (
        normalized_01
        * 2.0
        - 1.0
    )

    normalized = np.clip(
        normalized,
        NORMALIZED_MIN,
        NORMALIZED_MAX,
    )

    return normalized.astype(
        np.float32,
        copy=False,
    )


# =============================================================================
# MAIN PREPROCESS
# =============================================================================

def preprocess_ct(
    input_path: Path | str,
    series_uid: Optional[str] = None,
) -> Tuple[
    np.ndarray,
    Dict[str, Any],
]:

    original_image, source_metadata = (
        load_ct(
            input_path=input_path,
            series_uid=series_uid,
        )
    )

    validate_ct_image(
        original_image
    )

    original_geometry = (
        image_geometry(
            original_image
        )
    )

    resampled_image = (
        resample_ct(
            image=original_image,
            target_spacing_xyz=TARGET_SPACING_XYZ,
        )
    )

    resampled_geometry = (
        image_geometry(
            resampled_image
        )
    )

    volume_hu = (
        sitk.GetArrayFromImage(
            resampled_image
        )
        .astype(
            np.float32
        )
    )

    hu_range_before_clip = [
        float(
            np.min(
                volume_hu
            )
        ),
        float(
            np.max(
                volume_hu
            )
        ),
    ]

    normalized_volume = (
        normalize_hu(
            volume_hu
        )
    )

    metadata = {
        **source_metadata,

        "axis_convention": {
            "numpy_volume":
                "ZYX",

            "simpleitk_geometry":
                "XYZ",

            "world_coordinate":
                "XYZ_mm",
        },

        "original":
            original_geometry,

        "resampled":
            resampled_geometry,

        "preprocessing": {
            "target_spacing_xyz_mm":
                list(
                    TARGET_SPACING_XYZ
                ),

            "hu_clip":
                [
                    HU_MIN,
                    HU_MAX,
                ],

            "normalization":
                "linear_-1_to_1",

            "normalized_range":
                [
                    NORMALIZED_MIN,
                    NORMALIZED_MAX,
                ],

            "interpolation":
                "SimpleITK linear",

            "resample_default_hu":
                RESAMPLE_DEFAULT_HU,
        },

        "qa": {
            "resampled_hu_min_before_clip":
                hu_range_before_clip[0],

            "resampled_hu_max_before_clip":
                hu_range_before_clip[1],

            "normalized_min":
                float(
                    normalized_volume.min()
                ),

            "normalized_max":
                float(
                    normalized_volume.max()
                ),
        },
    }

    return (
        normalized_volume,
        metadata,
    )


# =============================================================================
# SAVE METADATA
# =============================================================================

def save_metadata_json(
    metadata: Dict[str, Any],
    output_path: Path | str,
) -> None:

    output_path = Path(
        output_path
    )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            metadata,
            file,
            indent=2,
            ensure_ascii=False,
        )


# =============================================================================
# CLI
# =============================================================================

if __name__ == "__main__":

    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "CPMNetv2 deployment CT preprocessing QA"
        )
    )

    parser.add_argument(
        "--input",
        required=True,
        type=str,
    )

    parser.add_argument(
        "--series-uid",
        default=None,
        type=str,
    )

    parser.add_argument(
        "--metadata-out",
        default="preprocessing_metadata.json",
        type=str,
    )

    args = parser.parse_args()

    print(
        "=" * 100
    )

    print(
        "CPMNetv2 preprocessing QA"
    )

    print(
        "=" * 100
    )

    volume, metadata = (
        preprocess_ct(
            input_path=args.input,
            series_uid=args.series_uid,
        )
    )

    save_metadata_json(
        metadata,
        args.metadata_out,
    )

    print(
        "Input:",
        args.input,
    )

    print(
        "Output shape ZYX:",
        list(
            volume.shape
        ),
    )

    print(
        "dtype:",
        volume.dtype,
    )

    print(
        "range:",
        float(
            volume.min()
        ),
        "~",
        float(
            volume.max()
        ),
    )

    print(
        "Original spacing XYZ:",
        metadata[
            "original"
        ][
            "spacing_xyz_mm"
        ],
    )

    print(
        "Resampled spacing XYZ:",
        metadata[
            "resampled"
        ][
            "spacing_xyz_mm"
        ],
    )

    print(
        "Metadata:",
        args.metadata_out,
    )

    print()

    print(
        "[PASS] preprocessing completed"
    )

