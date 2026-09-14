from __future__ import annotations

import argparse
import json
from pathlib import Path

import nibabel as nib
import numpy as np
import pydicom


def get_slice_position(ds):
    ipp = getattr(ds, "ImagePositionPatient", None)

    if ipp is not None:
        return float(ipp[2])

    if hasattr(ds, "SliceLocation"):
        return float(ds.SliceLocation)

    if hasattr(ds, "InstanceNumber"):
        return float(ds.InstanceNumber)

    raise RuntimeError(
        "Slice ordering information is missing "
        "(ImagePositionPatient / SliceLocation / InstanceNumber)"
    )


def load_dicom_series(dicom_dir: str | Path):
    dicom_dir = Path(dicom_dir)

    if not dicom_dir.exists():
        raise FileNotFoundError(
            f"DICOM directory not found: {dicom_dir}"
        )

    dcm_files = [
        p
        for p in dicom_dir.rglob("*")
        if p.is_file()
    ]

    slices = []

    for path in dcm_files:
        try:
            ds = pydicom.dcmread(
                str(path),
                force=True,
            )
        except Exception:
            continue

        if not hasattr(ds, "PixelData"):
            continue

        if str(
            getattr(ds, "Modality", "")
        ).upper() != "CT":
            continue

        slices.append(
            (
                get_slice_position(ds),
                path,
                ds,
            )
        )

    if not slices:
        raise RuntimeError(
            f"No CT DICOM slices found: {dicom_dir}"
        )

    slices.sort(
        key=lambda x: x[0]
    )

    series_uids = {
        str(
            getattr(
                ds,
                "SeriesInstanceUID",
                "",
            )
        )
        for _, _, ds in slices
    }

    series_uids.discard("")

    if len(series_uids) > 1:
        raise RuntimeError(
            "Multiple SeriesInstanceUID values detected. "
            "Provide a single CT series directory."
        )

    return slices


def validate_series(slices):
    first = slices[0][2]

    rows = int(first.Rows)
    cols = int(first.Columns)

    for _, path, ds in slices:
        if (
            int(ds.Rows) != rows
            or int(ds.Columns) != cols
        ):
            raise RuntimeError(
                f"Inconsistent image shape: {path}"
            )

    z_positions = np.array(
        [
            z
            for z, _, _ in slices
        ],
        dtype=np.float64,
    )

    duplicate_slices = False

    if len(z_positions) > 1:
        duplicate_slices = bool(
            np.any(
                np.abs(
                    np.diff(z_positions)
                ) < 1e-6
            )
        )

    return {
        "rows": rows,
        "columns": cols,
        "slice_count": len(slices),
        "duplicate_slice_position": (
            duplicate_slices
        ),
    }


def build_hu_volume(slices):
    volume = []

    slopes = []
    intercepts = []

    for _, _, ds in slices:
        pixels = ds.pixel_array.astype(
            np.float32
        )

        slope = float(
            getattr(
                ds,
                "RescaleSlope",
                1.0,
            )
        )

        intercept = float(
            getattr(
                ds,
                "RescaleIntercept",
                0.0,
            )
        )

        hu = (
            pixels * slope
            + intercept
        )

        volume.append(
            hu
        )

        slopes.append(
            slope
        )

        intercepts.append(
            intercept
        )

    volume_zyx = np.stack(
        volume,
        axis=0,
    )

    return (
        volume_zyx,
        slopes,
        intercepts,
    )


def calculate_spacing(slices):
    first = slices[0][2]

    pixel_spacing = getattr(
        first,
        "PixelSpacing",
        None,
    )

    if pixel_spacing is None:
        raise RuntimeError(
            "PixelSpacing is missing"
        )

    spacing_y = float(
        pixel_spacing[0]
    )

    spacing_x = float(
        pixel_spacing[1]
    )

    if len(slices) >= 2:
        z_positions = np.array(
            [
                z
                for z, _, _ in slices
            ],
            dtype=np.float64,
        )

        diffs = np.abs(
            np.diff(
                z_positions
            )
        )

        valid_diffs = diffs[
            diffs > 1e-6
        ]

        if len(valid_diffs):
            spacing_z = float(
                np.median(
                    valid_diffs
                )
            )
        else:
            spacing_z = float(
                getattr(
                    first,
                    "SliceThickness",
                    1.0,
                )
            )
    else:
        spacing_z = float(
            getattr(
                first,
                "SliceThickness",
                1.0,
            )
        )

    return (
        spacing_z,
        spacing_y,
        spacing_x,
    )


def build_affine(
    slices,
    spacing_zyx,
):
    first = slices[0][2]

    spacing_z, spacing_y, spacing_x = (
        spacing_zyx
    )

    orientation = getattr(
        first,
        "ImageOrientationPatient",
        None,
    )

    position = getattr(
        first,
        "ImagePositionPatient",
        None,
    )

    # Fallback: same geometry style used by the
    # original LIDC preprocessing code.
    if (
        orientation is None
        or position is None
    ):
        affine = np.eye(
            4,
            dtype=np.float64,
        )

        affine[0, 0] = spacing_x
        affine[1, 1] = spacing_y
        affine[2, 2] = spacing_z

        return affine, "spacing_only_fallback"

    orientation = np.asarray(
        orientation,
        dtype=np.float64,
    )

    row_direction = orientation[:3]
    column_direction = orientation[3:]

    origin_lps = np.asarray(
        position,
        dtype=np.float64,
    )

    # Prefer real direction between first and last slices.
    if len(slices) >= 2:
        first_pos = getattr(
            slices[0][2],
            "ImagePositionPatient",
            None,
        )

        last_pos = getattr(
            slices[-1][2],
            "ImagePositionPatient",
            None,
        )

        if (
            first_pos is not None
            and last_pos is not None
        ):
            delta = (
                np.asarray(
                    last_pos,
                    dtype=np.float64,
                )
                - np.asarray(
                    first_pos,
                    dtype=np.float64,
                )
            )

            norm = np.linalg.norm(
                delta
            )

            if norm > 1e-8:
                slice_direction = (
                    delta / norm
                )
            else:
                slice_direction = np.cross(
                    row_direction,
                    column_direction,
                )
        else:
            slice_direction = np.cross(
                row_direction,
                column_direction,
            )
    else:
        slice_direction = np.cross(
            row_direction,
            column_direction,
        )

    affine_lps = np.eye(
        4,
        dtype=np.float64,
    )

    # volume_xyz axes:
    # X = DICOM column index
    # Y = DICOM row index
    # Z = slice index
    affine_lps[:3, 0] = (
        row_direction
        * spacing_x
    )

    affine_lps[:3, 1] = (
        column_direction
        * spacing_y
    )

    affine_lps[:3, 2] = (
        slice_direction
        * spacing_z
    )

    affine_lps[:3, 3] = (
        origin_lps
    )

    # DICOM patient coordinates = LPS
    # NIfTI convention = RAS
    lps_to_ras = np.array(
        [
            [-1, 0, 0, 0],
            [0, -1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ],
        dtype=np.float64,
    )

    affine_ras = (
        lps_to_ras
        @ affine_lps
    )

    return (
        affine_ras,
        "dicom_orientation",
    )


def convert_dicom_series(
    dicom_dir: str | Path,
    output_nifti: str | Path,
    metadata_path: str | Path | None = None,
):
    dicom_dir = Path(
        dicom_dir
    )

    output_nifti = Path(
        output_nifti
    )

    output_nifti.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    slices = load_dicom_series(
        dicom_dir
    )

    validation = validate_series(
        slices
    )

    (
        volume_zyx,
        slopes,
        intercepts,
    ) = build_hu_volume(
        slices
    )

    spacing_zyx = calculate_spacing(
        slices
    )

    affine, affine_mode = (
        build_affine(
            slices,
            spacing_zyx,
        )
    )

    # Original training pipeline:
    # Z,Y,X -> X,Y,Z
    volume_xyz = np.transpose(
        volume_zyx,
        (
            2,
            1,
            0,
        ),
    )

    image = nib.Nifti1Image(
        volume_xyz.astype(
            np.float32
        ),
        affine,
    )

    nib.save(
        image,
        str(
            output_nifti
        ),
    )

    first = slices[0][2]

    metadata = {
        "source": {
            "dicom_dir": str(
                dicom_dir.resolve()
            ),
            "patient_id": str(
                getattr(
                    first,
                    "PatientID",
                    "",
                )
            ),
            "study_instance_uid": str(
                getattr(
                    first,
                    "StudyInstanceUID",
                    "",
                )
            ),
            "series_instance_uid": str(
                getattr(
                    first,
                    "SeriesInstanceUID",
                    "",
                )
            ),
            "modality": str(
                getattr(
                    first,
                    "Modality",
                    "",
                )
            ),
        },

        "output": {
            "nifti": str(
                output_nifti.resolve()
            ),
            "shape_xyz": [
                int(v)
                for v in volume_xyz.shape
            ],
            "spacing_xyz_mm": [
                float(spacing_zyx[2]),
                float(spacing_zyx[1]),
                float(spacing_zyx[0]),
            ],
            "hu_min": float(
                np.min(volume_xyz)
            ),
            "hu_max": float(
                np.max(volume_xyz)
            ),
            "affine_mode": (
                affine_mode
            ),
            "affine": (
                affine.tolist()
            ),
        },

        "dicom": {
            "rescale_slope_unique": sorted(
                {
                    float(v)
                    for v in slopes
                }
            ),
            "rescale_intercept_unique": sorted(
                {
                    float(v)
                    for v in intercepts
                }
            ),
        },

        "validation": validation,
    }

    if metadata_path:
        metadata_path = Path(
            metadata_path
        )

        metadata_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        metadata_path.write_text(
            json.dumps(
                metadata,
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    return metadata


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Convert one CT DICOM series "
            "to NIfTI for CT Analysis serving"
        )
    )

    parser.add_argument(
        "--dicom-dir",
        required=True,
    )

    parser.add_argument(
        "--output",
        required=True,
    )

    parser.add_argument(
        "--metadata",
        default=None,
    )

    args = parser.parse_args()

    result = convert_dicom_series(
        dicom_dir=args.dicom_dir,
        output_nifti=args.output,
        metadata_path=args.metadata,
    )

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
